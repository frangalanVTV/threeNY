import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { FLAT_EDGE_DEGREES, CREASE_EDGE_DEGREES } from "./config.js";

/**
 * Walks a loaded glTF node (which may be a single Mesh or a Group of
 * per-material Mesh primitives), and produces, all in the node's local
 * space and built once at load (never regenerated at render time):
 *  - edges: always-drawn lines (hard corners + authored loose edges).
 *  - conditional: curved-surface facet edges, drawn only where they form
 *    the silhouette from the current camera (see classifyEdges).
 *  - solid: merged triangles for raycasting / depth occlusion.
 *
 * The original meshes/materials/textures are disposed — the wireframe
 * viewer never needs shaded materials, so keeping them around would only
 * cost GPU memory.
 */
export function buildWireframeFromNode(node) {
  const edgeGeometries = [];
  const conditionalGeometries = [];
  const solidGeometries = [];

  node.updateWorldMatrix(true, true);
  const nodeWorldInverse = node.matrixWorld.clone().invert();

  node.traverse((child) => {
    if (!child.isMesh && !child.isLineSegments) return;

    // Geometry must end up in the node's own local space, since the lines
    // are added as children of the node. traverse() visits the node itself
    // too: a single-primitive glTF node *is* the Mesh (no child Group), so
    // using child.matrix there would bake the node's own transform in a
    // second time. Relative-to-node matrix is identity for the node itself
    // and correct for descendants at any depth.
    const localMatrix = nodeWorldInverse.clone().multiply(child.matrixWorld);
    const sourceGeometry = child.geometry;

    // Loose edges (Blender edges with no face, exported with the glTF
    // "Loose Edges" option) arrive as a LINES primitive -> LineSegments.
    // They are already exactly the authored lines: draw them as-is, with
    // no angle filtering and no occluder (they have no surface).
    if (child.isLineSegments) {
      const lines = new THREE.BufferGeometry();
      lines.setAttribute("position", sourceGeometry.getAttribute("position"));
      if (sourceGeometry.index) lines.setIndex(sourceGeometry.index);
      lines.applyMatrix4(localMatrix);
      edgeGeometries.push(lines.index ? lines.toNonIndexed() : lines);
      if (lines.index) lines.dispose();
      child.geometry.dispose();
      disposeMaterial(child.material);
      return;
    }

    const positionOnly = new THREE.BufferGeometry();
    positionOnly.setAttribute("position", sourceGeometry.getAttribute("position"));
    if (sourceGeometry.index) positionOnly.setIndex(sourceGeometry.index);
    positionOnly.applyMatrix4(localMatrix);

    const { hard, conditional } = classifyEdges(positionOnly);
    if (hard) edgeGeometries.push(hard);
    if (conditional) conditionalGeometries.push(conditional);

    const solid = positionOnly.clone();
    solid.deleteAttribute("normal");
    solid.deleteAttribute("uv");
    solidGeometries.push(solid);

    positionOnly.dispose();

    child.geometry.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach(disposeMaterial);
    } else {
      disposeMaterial(child.material);
    }
  });

  const mergedEdges = edgeGeometries.length
    ? mergeGeometries(edgeGeometries, false)
    : null;
  edgeGeometries.forEach((g) => g.dispose());

  const mergedConditional = conditionalGeometries.length
    ? mergeGeometries(conditionalGeometries, false)
    : null;
  conditionalGeometries.forEach((g) => g.dispose());

  const mergedSolid = solidGeometries.length
    ? mergeGeometries(solidGeometries, false)
    : null;
  solidGeometries.forEach((g) => g.dispose());

  // Strip the node's own children now that their geometry has been
  // extracted; the pivot (position/quaternion/scale) stays untouched.
  [...node.children].forEach((child) => node.remove(child));

  // If the node itself was the Mesh, it stays in the scene as the pivot;
  // give it empty geometry and a non-rendering material so the original
  // shaded mesh is never drawn (its children — lines/proxy — still are).
  if (node.isMesh || node.isLineSegments) {
    node.geometry = new THREE.BufferGeometry();
    node.material = new THREE.MeshBasicMaterial({ visible: false });
  }

  return { edges: mergedEdges, conditional: mergedConditional, solid: mergedSolid };
}

/**
 * Splits a triangle mesh's edges into three groups, by the angle between
 * the two faces that share each edge:
 *  - below FLAT_EDGE_DEGREES: dropped (coplanar, incl. the triangulation
 *    diagonals glTF adds to every quad/n-gon).
 *  - at or above CREASE_EDGE_DEGREES, plus open/non-manifold edges: "hard"
 *    — always drawn (box corners, panel edges, rims).
 *  - in between: "conditional" — the facets of curved surfaces (cylinder
 *    sides, flutes, pipes). Each carries the two opposite triangle vertices
 *    so LDrawConditionalLineMaterial can draw it only where it is the
 *    silhouette from the current camera, like Freestyle / Line Art.
 *
 * glTF splits vertices along UV seams and hard normals, so adjacency is
 * computed on a position-welded copy.
 */
function classifyEdges(geometry) {
  const welded = mergeVertices(geometry, 1e-4);
  const pos = welded.getAttribute("position");
  const index = welded.index.array;
  const vertexCount = pos.count;

  const cosFlat = Math.cos(THREE.MathUtils.degToRad(FLAT_EDGE_DEGREES));
  const cosCrease = Math.cos(THREE.MathUtils.degToRad(CREASE_EDGE_DEGREES));

  const triangleCount = index.length / 3;
  const normals = new Float32Array(triangleCount * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();

  // key -> [vA, vB, face0, opposite0, face1, opposite1, faceCount]
  const edgeMap = new Map();

  for (let t = 0; t < triangleCount; t++) {
    const i0 = index[t * 3];
    const i1 = index[t * 3 + 1];
    const i2 = index[t * 3 + 2];
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    n.subVectors(c, b).cross(a.clone().sub(b));
    if (n.lengthSq() < 1e-20) continue; // degenerate triangle
    n.normalize();
    normals[t * 3] = n.x;
    normals[t * 3 + 1] = n.y;
    normals[t * 3 + 2] = n.z;

    const tri = [i0, i1, i2];
    for (let e = 0; e < 3; e++) {
      const v0 = tri[e];
      const v1 = tri[(e + 1) % 3];
      const opposite = tri[(e + 2) % 3];
      const lo = Math.min(v0, v1);
      const hi = Math.max(v0, v1);
      const key = lo * vertexCount + hi;
      const entry = edgeMap.get(key);
      if (!entry) {
        edgeMap.set(key, [lo, hi, t, opposite, -1, -1, 1]);
      } else {
        if (entry[6] === 1) {
          entry[4] = t;
          entry[5] = opposite;
        }
        entry[6]++;
      }
    }
  }

  const hard = [];
  const condPosition = [];
  const condControl0 = [];
  const condControl1 = [];
  const condDirection = [];

  for (const [lo, hi, f0, o0, f1, o1, count] of edgeMap.values()) {
    a.fromBufferAttribute(pos, lo);
    b.fromBufferAttribute(pos, hi);

    if (count !== 2) {
      hard.push(a.x, a.y, a.z, b.x, b.y, b.z);
      continue;
    }

    const dot =
      normals[f0 * 3] * normals[f1 * 3] +
      normals[f0 * 3 + 1] * normals[f1 * 3 + 1] +
      normals[f0 * 3 + 2] * normals[f1 * 3 + 2];

    if (dot > cosFlat) continue;

    if (dot <= cosCrease) {
      hard.push(a.x, a.y, a.z, b.x, b.y, b.z);
      continue;
    }

    c.fromBufferAttribute(pos, o0);
    n.fromBufferAttribute(pos, o1);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    condPosition.push(a.x, a.y, a.z, b.x, b.y, b.z);
    condControl0.push(c.x, c.y, c.z, c.x, c.y, c.z);
    condControl1.push(n.x, n.y, n.z, n.x, n.y, n.z);
    condDirection.push(dx, dy, dz, dx, dy, dz);
  }

  welded.dispose();

  let hardGeometry = null;
  if (hard.length) {
    hardGeometry = new THREE.BufferGeometry();
    hardGeometry.setAttribute("position", new THREE.Float32BufferAttribute(hard, 3));
  }

  let conditionalGeometry = null;
  if (condPosition.length) {
    conditionalGeometry = new THREE.BufferGeometry();
    conditionalGeometry.setAttribute("position", new THREE.Float32BufferAttribute(condPosition, 3));
    conditionalGeometry.setAttribute("control0", new THREE.Float32BufferAttribute(condControl0, 3));
    conditionalGeometry.setAttribute("control1", new THREE.Float32BufferAttribute(condControl1, 3));
    conditionalGeometry.setAttribute("direction", new THREE.Float32BufferAttribute(condDirection, 3));
  }

  return { hard: hardGeometry, conditional: conditionalGeometry };
}

function disposeMaterial(material) {
  if (!material) return;
  for (const key of Object.keys(material)) {
    const value = material[key];
    if (value && value.isTexture) value.dispose();
  }
  material.dispose();
}
