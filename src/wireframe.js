import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EDGE_THRESHOLD_DEGREES } from "./config.js";

/**
 * Walks a loaded glTF node (which may be a single Mesh or a Group of
 * per-material Mesh primitives), and produces:
 *  - one merged edges LineSegments geometry (in the node's local space),
 *    built once via THREE.EdgesGeometry so it never needs to be
 *    regenerated at render time.
 *  - one merged triangle geometry (same local space) for raycasting only.
 *
 * The original meshes/materials/textures are disposed — the wireframe
 * viewer never needs shaded materials, so keeping them around would only
 * cost GPU memory.
 */
export function buildWireframeFromNode(node) {
  const edgeGeometries = [];
  const solidGeometries = [];

  node.updateWorldMatrix(true, true);
  const nodeWorldInverse = node.matrixWorld.clone().invert();

  node.traverse((child) => {
    if (!child.isMesh) return;

    // Geometry must end up in the node's own local space, since the lines
    // are added as children of the node. traverse() visits the node itself
    // too: a single-primitive glTF node *is* the Mesh (no child Group), so
    // using child.matrix there would bake the node's own transform in a
    // second time. Relative-to-node matrix is identity for the node itself
    // and correct for descendants at any depth.
    const localMatrix = nodeWorldInverse.clone().multiply(child.matrixWorld);
    const sourceGeometry = child.geometry;

    const positionOnly = new THREE.BufferGeometry();
    positionOnly.setAttribute("position", sourceGeometry.getAttribute("position"));
    if (sourceGeometry.index) positionOnly.setIndex(sourceGeometry.index);
    positionOnly.applyMatrix4(localMatrix);

    const edges = new THREE.EdgesGeometry(positionOnly, EDGE_THRESHOLD_DEGREES);
    edgeGeometries.push(edges);

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

  const mergedEdges = mergeGeometries(edgeGeometries, false);
  edgeGeometries.forEach((g) => g.dispose());

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
  if (node.isMesh) {
    node.geometry = new THREE.BufferGeometry();
    node.material = new THREE.MeshBasicMaterial({ visible: false });
  }

  return { edges: mergedEdges, solid: mergedSolid };
}

function disposeMaterial(material) {
  if (!material) return;
  for (const key of Object.keys(material)) {
    const value = material[key];
    if (value && value.isTexture) value.dispose();
  }
  material.dispose();
}
