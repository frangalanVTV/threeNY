import * as THREE from "three";
import {
  VECTOR_DEPTH_RESOLUTION,
  VECTOR_OUTPUT_WIDTH,
  VECTOR_STROKE_WIDTH,
} from "./config.js";

/**
 * Vector (SVG / PDF) export of exactly what the camera currently sees, for
 * plotters / Illustrator. Same linework as the screen, as real strokes:
 *
 *  1. Depth pass: the scene's invisible occluder meshes are rendered
 *     offscreen with a packed-depth material (lines hidden), at
 *     VECTOR_DEPTH_RESOLUTION on the long side, and read back to the CPU.
 *  2. Every line segment in the scene is collected in world space: always-
 *     drawn edges, loose edges, and the conditional (curved-surface) edges
 *     that are silhouettes from this camera — the same view-space test
 *     SilhouetteLineMaterial does on screen, run on the CPU.
 *  3. Each segment is clipped to the view frustum, then walked in small
 *     screen-space steps and compared against the depth map: only the runs
 *     in front of the occluders are kept (hidden-line removal).
 *  4. Visible runs are projected to 2D, chained into polylines where their
 *     ends meet (fewer pen lifts on a plotter); toSVG() / toPDF() write
 *     the same polylines out in either format.
 *
 * Hidden-line accuracy is bounded by the depth map resolution, not exact
 * geometry — at 4096 px it is far below what is visible on paper.
 */
export function exportViewVectors({ renderer, scene, camera }) {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  const aspect = camera.aspect;
  const maxSize = Math.min(
    VECTOR_DEPTH_RESOLUTION,
    renderer.capabilities.maxTextureSize
  );
  const depthW = aspect >= 1 ? maxSize : Math.round(maxSize * aspect);
  const depthH = aspect >= 1 ? Math.round(maxSize / aspect) : maxSize;

  const depth = renderDepth(renderer, scene, camera, depthW, depthH);
  const segments = collectVisibleSegments(scene, camera, depth, depthW, depthH);

  const width = VECTOR_OUTPUT_WIDTH;
  const height = Math.round(VECTOR_OUTPUT_WIDTH / aspect);
  const polylines = chainSegments(segments, width, height);

  return { polylines, width, height };
}

// ---------------------------------------------------------------- depth pass

function renderDepth(renderer, scene, camera, width, height) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
  });
  const depthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  });

  // Only the occluder meshes (colorWrite:false, see loadModel.js) should
  // write depth: hide every line object and give each occluder the
  // depth-packing material for the duration of this pass.
  const hidden = [];
  const swapped = [];
  scene.traverse((obj) => {
    if (obj.isLineSegments && obj.visible) {
      obj.visible = false;
      hidden.push(obj);
    } else if (obj.isMesh && obj.material && obj.material.colorWrite === false) {
      swapped.push([obj, obj.material]);
      obj.material = depthMaterial;
    }
  });

  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();

  renderer.setRenderTarget(target);
  renderer.setClearColor(0xffffff, 1); // packs to depth 1.0 = "nothing here"
  renderer.clear();
  renderer.render(scene, camera);

  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);

  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  hidden.forEach((obj) => (obj.visible = true));
  swapped.forEach(([obj, material]) => (obj.material = material));
  target.dispose();
  depthMaterial.dispose();

  // Unpack three.js RGBA depth packing (packing.glsl.js) to NDC depth 0..1.
  const depth = new Float32Array(width * height);
  const d = 255 / 256;
  for (let i = 0, p = 0; i < depth.length; i++, p += 4) {
    const r = pixels[p];
    const g = pixels[p + 1];
    const b = pixels[p + 2];
    const a = pixels[p + 3];
    depth[i] =
      r === 255 && g === 255 && b === 255 && a === 255
        ? 1
        : (r / 255) * d +
          ((g / 255) * d) / 256 +
          ((b / 255) * d) / 65536 +
          a / 255 / 16777216;
  }
  return depth;
}

// ------------------------------------------------------- segment collection

const _mvp = new THREE.Matrix4();
const _mv = new THREE.Matrix4();
const _a = new THREE.Vector4();
const _b = new THREE.Vector4();
const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
const _c0 = new THREE.Vector3();
const _c1 = new THREE.Vector3();
const _n = new THREE.Vector3();

function collectVisibleSegments(scene, camera, depth, depthW, depthH) {
  const near = camera.near;
  const far = camera.far;
  const out = []; // flat [x0, y0, x1, y1, ...] in NDC (-1..1)

  const toViewDistance = (ndcDepth) => {
    const z = ndcDepth * 2 - 1;
    return (2 * near * far) / (far + near - z * (far - near));
  };

  const isVisible = (ndcX, ndcY, ndcZ) => {
    const px = Math.floor((ndcX * 0.5 + 0.5) * depthW);
    const py = Math.floor((ndcY * 0.5 + 0.5) * depthH); // readPixels is bottom-up
    // Farthest occluder depth in a 3x3 neighbourhood: lines lying exactly
    // on a surface's own edge must not be lost to a one-pixel miss.
    let occluderDepth = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const y = py + dy;
      if (y < 0 || y >= depthH) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const x = px + dx;
        if (x < 0 || x >= depthW) continue;
        const v = depth[y * depthW + x];
        if (v > occluderDepth) occluderDepth = v;
      }
    }
    if (occluderDepth >= 1) return true;
    const lineDist = toViewDistance(ndcZ * 0.5 + 0.5);
    const sceneDist = toViewDistance(occluderDepth);
    return lineDist <= sceneDist * 1.003 + 0.003;
  };

  scene.traverseVisible((obj) => {
    if (!obj.isLineSegments) return;
    const geom = obj.geometry;
    const pos = geom.getAttribute("position");
    if (!pos || pos.count === 0) return;

    _mv.multiplyMatrices(camera.matrixWorldInverse, obj.matrixWorld);
    _mvp.multiplyMatrices(camera.projectionMatrix, _mv);

    const conditional = obj.material.isLDrawConditionalLineMaterial;
    const control0 = conditional ? geom.getAttribute("control0") : null;
    const control1 = conditional ? geom.getAttribute("control1") : null;

    for (let i = 0; i < pos.count; i += 2) {
      if (conditional) {
        // Silhouette test in view space: draw the edge only when both
        // adjacent faces' opposite vertices lie on the same side of the
        // plane through the eye and the edge (one face front, one back).
        _va.fromBufferAttribute(pos, i).applyMatrix4(_mv);
        _vb.fromBufferAttribute(pos, i + 1).applyMatrix4(_mv);
        _c0.fromBufferAttribute(control0, i).applyMatrix4(_mv);
        _c1.fromBufferAttribute(control1, i).applyMatrix4(_mv);
        _n.crossVectors(_va, _vb);
        if (Math.sign(_n.dot(_c0)) !== Math.sign(_n.dot(_c1))) continue;
      }

      _a.fromBufferAttribute(pos, i);
      _a.w = 1;
      _a.applyMatrix4(_mvp);
      _b.fromBufferAttribute(pos, i + 1);
      _b.w = 1;
      _b.applyMatrix4(_mvp);

      const clipped = clipToFrustum(_a, _b);
      if (!clipped) continue;
      const [t0, t1] = clipped;

      walkSegment(_a, _b, t0, t1, depthW, depthH, isVisible, out);
    }
  });

  return out;
}

// Liang–Barsky clipping of a clip-space segment against -w<=x,y,z<=w.
function clipToFrustum(a, b) {
  let t0 = 0;
  let t1 = 1;
  const planes = [
    [a.w + a.x, b.w + b.x],
    [a.w - a.x, b.w - b.x],
    [a.w + a.y, b.w + b.y],
    [a.w - a.y, b.w - b.y],
    [a.w + a.z, b.w + b.z],
    [a.w - a.z, b.w - b.z],
  ];
  for (const [da, db] of planes) {
    if (da < 0 && db < 0) return null;
    if (da < 0) t0 = Math.max(t0, da / (da - db));
    else if (db < 0) t1 = Math.min(t1, da / (da - db));
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

// Steps along the clipped segment (interpolated in clip space, so depth is
// perspective-correct) about twice per depth-map pixel, and pushes each
// run of visible samples as one straight NDC segment.
function walkSegment(a, b, t0, t1, depthW, depthH, isVisible, out) {
  const lerp = (t) => {
    const w = a.w + (b.w - a.w) * t;
    return [
      (a.x + (b.x - a.x) * t) / w,
      (a.y + (b.y - a.y) * t) / w,
      (a.z + (b.z - a.z) * t) / w,
    ];
  };

  const p0 = lerp(t0);
  const p1 = lerp(t1);
  const pixelLen = Math.hypot(
    ((p1[0] - p0[0]) * depthW) / 2,
    ((p1[1] - p0[1]) * depthH) / 2
  );
  const steps = Math.max(1, Math.ceil(pixelLen * 2));

  let runStart = null;
  let last = null;
  for (let s = 0; s <= steps; s++) {
    const p = s === 0 ? p0 : s === steps ? p1 : lerp(t0 + ((t1 - t0) * s) / steps);
    if (isVisible(p[0], p[1], p[2])) {
      if (!runStart) runStart = p;
      last = p;
    } else if (runStart) {
      if (runStart !== last) out.push(runStart[0], runStart[1], last[0], last[1]);
      runStart = null;
    }
  }
  if (runStart && runStart !== last) out.push(runStart[0], runStart[1], last[0], last[1]);
}

// ------------------------------------------------------------ SVG output

// Joins segments whose ends coincide (after projecting to output units)
// into polylines, so a plotter draws them in one pen-down stroke.
function chainSegments(flat, outW, outH) {
  const toX = (x) => (x * 0.5 + 0.5) * outW;
  const toY = (y) => (1 - (y * 0.5 + 0.5)) * outH;
  const key = (x, y) => `${Math.round(x * 20)},${Math.round(y * 20)}`;

  // Project, drop zero-length pieces, and drop exact duplicates (the same
  // edge emitted by two coincident pieces of geometry) so a plotter never
  // draws a line twice.
  const seen = new Set();
  const kept = [];
  for (let i = 0; i < flat.length; i += 4) {
    const x0 = toX(flat[i]);
    const y0 = toY(flat[i + 1]);
    const x1 = toX(flat[i + 2]);
    const y1 = toY(flat[i + 3]);
    const k0 = key(x0, y0);
    const k1 = key(x1, y1);
    if (k0 === k1) continue;
    const segKey = k0 < k1 ? `${k0}|${k1}` : `${k1}|${k0}`;
    if (seen.has(segKey)) continue;
    seen.add(segKey);
    kept.push(x0, y0, x1, y1);
  }

  const count = kept.length / 4;
  const pts = Float64Array.from(kept);
  const ends = new Map(); // key -> [segment*2 + endIndex]
  for (let i = 0; i < count; i++) {
    for (let e = 0; e < 2; e++) {
      const k = key(pts[i * 4 + e * 2], pts[i * 4 + e * 2 + 1]);
      let list = ends.get(k);
      if (!list) ends.set(k, (list = []));
      list.push(i * 2 + e);
    }
  }

  const used = new Uint8Array(count);
  const polylines = [];

  const extend = (line, x, y) => {
    for (;;) {
      const list = ends.get(key(x, y));
      if (!list) return;
      let next = -1;
      for (const ref of list) {
        if (!used[ref >> 1]) {
          next = ref;
          break;
        }
      }
      if (next < 0) return;
      const seg = next >> 1;
      used[seg] = 1;
      const other = (next & 1) ^ 1;
      x = pts[seg * 4 + other * 2];
      y = pts[seg * 4 + other * 2 + 1];
      line.push(x, y);
    }
  };

  for (let i = 0; i < count; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const forward = [pts[i * 4], pts[i * 4 + 1], pts[i * 4 + 2], pts[i * 4 + 3]];
    extend(forward, pts[i * 4 + 2], pts[i * 4 + 3]);
    const backward = [];
    extend(backward, pts[i * 4], pts[i * 4 + 1]);
    // backward holds points walking away from the start; reverse onto front.
    const line = [];
    for (let j = backward.length - 2; j >= 0; j -= 2) line.push(backward[j], backward[j + 1]);
    polylines.push(line.concat(forward));
  }
  return polylines;
}

// ----------------------------------------------------------- file writers

// Both writers take exportViewVectors()'s output: polylines in a top-left
// origin, y-down coordinate space of width x height units.

export function toSVG({ polylines, width, height }) {
  const f = (v) => +v.toFixed(2);
  const paths = polylines.map((pts) => {
    let d = `M${f(pts[0])} ${f(pts[1])}`;
    for (let i = 2; i < pts.length; i += 2) d += `L${f(pts[i])} ${f(pts[i + 1])}`;
    return d;
  });
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<title>NODE NY</title>`,
    `<g fill="none" stroke="#000" stroke-width="${VECTOR_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round">`,
    ...paths.map((d) => `<path d="${d}"/>`),
    `</g>`,
    `</svg>`,
  ].join("\n");
}

// Minimal single-page PDF 1.4, written by hand (no library): one content
// stream of stroked paths, 1 unit = 1 pt, so the page is width x height pt.
// PDF's origin is bottom-left, hence the y flip. Everything is ASCII, so
// string length equals byte length for the xref offsets.
export function toPDF({ polylines, width, height }) {
  const f = (v) => +v.toFixed(2);
  let content = `${VECTOR_STROKE_WIDTH} w 1 J 1 j 0 G\n`;
  for (const pts of polylines) {
    content += `${f(pts[0])} ${f(height - pts[1])} m`;
    for (let i = 2; i < pts.length; i += 2) {
      content += ` ${f(pts[i])} ${f(height - pts[i + 1])} l`;
    }
    content += " S\n";
  }

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    "<< /Title (NODE NY) /Producer (NODE NY wireframe viewer) >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}
