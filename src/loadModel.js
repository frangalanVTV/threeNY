import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { buildWireframeFromNode } from "./wireframe.js";
import {
  MODEL_URL,
  CAMERA_NODE_NAME,
  BUILDING_NODE_NAME,
  WALL_NODE_NAMES,
  LINE_COLOR,
} from "./config.js";

/**
 * Loads BASE.glb and converts it into the lightweight monochrome wireframe
 * representation the viewer actually renders.
 *
 * Returns:
 *  - camera: a THREE.PerspectiveCamera with Camera.001's exact exported
 *    world position / orientation / vertical FOV.
 *  - walkHeight: fixed world-space Y (the app never moves the camera off it).
 *  - buildingLines: static LineSegments for the whole building shell.
 *  - walls: [{ name, group, lines, proxy, baseQuaternion }] — group is the
 *    original glTF node (untouched position/quaternion/scale = the
 *    Blender-authored pivot), lines is the visible wireframe, proxy is an
 *    invisible (colorWrite:false) solid mesh reused for two things: wall
 *    raycasting AND depth-buffer occlusion (hidden-line removal) — see
 *    makeOccluderMaterial().
 */
export async function loadModel(onProgress) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(MODEL_URL, onProgress);

  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  const cameraNode = findByName(scene, CAMERA_NODE_NAME);
  if (!cameraNode || !cameraNode.isCamera) {
    throw new Error(`Camera node "${CAMERA_NODE_NAME}" was not found in ${MODEL_URL}`);
  }

  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  cameraNode.getWorldPosition(worldPosition);
  cameraNode.getWorldQuaternion(worldQuaternion);

  const camera = new THREE.PerspectiveCamera(
    cameraNode.fov,
    window.innerWidth / window.innerHeight,
    Math.max(cameraNode.near, 0.05),
    cameraNode.far
  );
  camera.position.copy(worldPosition);
  camera.quaternion.copy(worldQuaternion);

  // Replicate Blender's focal length with Sensor Fit "Auto": the sensor
  // width maps onto whichever viewport side is longer. glTF only stores
  // yfov for the export aspect ratio, so recover the tangent of the
  // half-FOV across the longer side once; applyBlenderSensorFit() then
  // derives the vertical FOV for any window shape (landscape desktop or
  // portrait phone) instead of keeping yfov fixed.
  const exportAspect = cameraNode.aspect || 1;
  const tanHalfYFov = Math.tan(THREE.MathUtils.degToRad(cameraNode.fov) / 2);
  camera.userData.tanHalfLongSide =
    exportAspect >= 1 ? tanHalfYFov * exportAspect : tanHalfYFov;

  const walkHeight = worldPosition.y;

  const buildingNode = findByName(scene, BUILDING_NODE_NAME);
  if (!buildingNode) {
    throw new Error(`Building node "${BUILDING_NODE_NAME}" was not found in ${MODEL_URL}`);
  }
  const { edges: buildingEdges, solid: buildingSolid } = buildWireframeFromNode(buildingNode);

  if (buildingSolid) {
    const buildingOccluder = new THREE.Mesh(buildingSolid, makeOccluderMaterial());
    buildingOccluder.renderOrder = OCCLUDER_RENDER_ORDER;
    buildingNode.add(buildingOccluder);
  }

  const buildingLines = new THREE.LineSegments(buildingEdges, makeLineMaterial());
  buildingLines.renderOrder = LINE_RENDER_ORDER;
  buildingNode.add(buildingLines);

  const walls = WALL_NODE_NAMES.map((name) => {
    const group = findByName(scene, name);
    if (!group) {
      throw new Error(`Movable wall node "${name}" was not found in ${MODEL_URL}`);
    }

    const { edges, solid } = buildWireframeFromNode(group);

    const lineMaterial = makeLineMaterial();
    const lines = new THREE.LineSegments(edges, lineMaterial);
    lines.renderOrder = LINE_RENDER_ORDER;
    group.add(lines);

    // Doubles as the depth-buffer occluder (hidden-line removal) and the
    // raycast target for wall selection — same merged geometry, no
    // duplication. It must render (visible = true) for the depth pass to
    // take effect; colorWrite:false keeps it invisible on screen, and
    // Raycaster ignores .visible entirely so selection is unaffected.
    let proxy = null;
    if (solid) {
      proxy = new THREE.Mesh(solid, makeOccluderMaterial());
      proxy.renderOrder = OCCLUDER_RENDER_ORDER;
      proxy.userData.wallName = name;
      group.add(proxy);
    }

    return {
      name,
      group,
      lines,
      proxy,
      baseQuaternion: group.quaternion.clone(),
      angleDeg: 0,
    };
  });

  return { scene, camera, walkHeight, buildingLines, walls };
}

/**
 * Sets camera.aspect and the vertical FOV so the longer viewport side
 * always spans the Blender camera's horizontal-sensor FOV (Sensor Fit
 * "Auto"), e.g. 30mm on a 36mm sensor reads the same on any screen.
 */
export function applyBlenderSensorFit(camera, aspect) {
  camera.aspect = aspect;
  const tanHalfLong = camera.userData.tanHalfLongSide;
  if (tanHalfLong) {
    const tanHalfV = aspect >= 1 ? tanHalfLong / aspect : tanHalfLong;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanHalfV));
  }
  camera.updateProjectionMatrix();
}

// GLTFLoader sanitizes node names (spaces/dots stripped, e.g. "Camera.001"
// -> "Camera001", "WALL 1" -> "WALL_1"), so lookups compare normalized
// (alphanumeric-only) forms rather than exact strings.
function normalize(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function findByName(root, name) {
  const target = normalize(name);
  let found = null;
  root.traverse((obj) => {
    if (!found && normalize(obj.name) === target) found = obj;
  });
  return found;
}

// Depth occluders render before lines regardless of distance-based sort
// order, so a wall's solid geometry reliably occludes lines from *other*
// objects behind it (not just its own), matching Blender's non-X-Ray
// wireframe shading (hidden-line removal).
const OCCLUDER_RENDER_ORDER = 0;
const LINE_RENDER_ORDER = 1;

function makeLineMaterial() {
  return new THREE.LineBasicMaterial({
    color: LINE_COLOR,
    transparent: true,
    opacity: 1,
    depthTest: true,
    depthWrite: false,
  });
}

// Invisible hidden-line-removal occluder: writes real depth so edges behind
// it are hidden, but never writes color. polygonOffset nudges its written
// depth slightly *away* from the camera so its own coincident edge lines
// (at the true, un-offset depth) win the depth test cleanly instead of
// z-fighting/flickering against their own surface.
function makeOccluderMaterial() {
  return new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}
