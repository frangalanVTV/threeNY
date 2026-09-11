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

  node.traverse((child) => {
    if (!child.isMesh) return;

    const localMatrix = child.matrix;
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
