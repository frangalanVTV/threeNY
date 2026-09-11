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
 *    invisible solid mesh used only for raycasting.
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

  const walkHeight = worldPosition.y;

  const buildingNode = findByName(scene, BUILDING_NODE_NAME);
  if (!buildingNode) {
    throw new Error(`Building node "${BUILDING_NODE_NAME}" was not found in ${MODEL_URL}`);
  }
  const { edges: buildingEdges } = buildWireframeFromNode(buildingNode);
  const buildingLines = new THREE.LineSegments(buildingEdges, makeLineMaterial());
  buildingNode.add(buildingLines);

  const walls = WALL_NODE_NAMES.map((name) => {
    const group = findByName(scene, name);
    if (!group) {
      throw new Error(`Movable wall node "${name}" was not found in ${MODEL_URL}`);
    }

    const { edges, solid } = buildWireframeFromNode(group);

    const lineMaterial = makeLineMaterial();
    const lines = new THREE.LineSegments(edges, lineMaterial);
    group.add(lines);

    let proxy = null;
    if (solid) {
      proxy = new THREE.Mesh(solid, new THREE.MeshBasicMaterial());
      proxy.visible = false;
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

function makeLineMaterial() {
  return new THREE.LineBasicMaterial({
    color: LINE_COLOR,
    transparent: true,
    opacity: 1,
  });
}
