// ---------------------------------------------------------------------------
// Central, documented tuning constants for the viewer.
// ---------------------------------------------------------------------------

export const MODEL_URL = "/BASE.glb";

// The exact node names as authored in Blender / exported in BASE.glb.
export const CAMERA_NODE_NAME = "Camera.001";
export const BUILDING_NODE_NAME = "BUILDING";
export const WALL_NODE_NAMES = [
  "WALL 1",
  "WALL 2",
  "WALL 3",
  "WALL 4",
  "WALL 5",
  "WALL 6",
];

// ---------------------------------------------------------------------------
// WIREFRAME
// ---------------------------------------------------------------------------
// THREE.EdgesGeometry keeps an edge when the angle between the two faces
// sharing it is >= this threshold (in degrees). Blender's exported mesh is
// already quad/ngon based; glTF always triangulates on export, which adds a
// diagonal per n-gon. Those diagonals sit at a perfectly flat 0 degrees, so a
// small non-zero threshold removes them while keeping every real edge
// (panel seams, mesh-grille strands, column flutes, etc.) that the Blender
// "Wireframe" viewport shading reference shows.
//
// Raise this value to thin out the linework (keep only harder corners);
// lower it toward 0 to show more of the raw mesh density.
export const EDGE_THRESHOLD_DEGREES = 1;

export const LINE_COLOR = 0x111111;
export const BACKGROUND_COLOR = 0xffffff;

// ---------------------------------------------------------------------------
// NAVIGATION
// ---------------------------------------------------------------------------
// Walking speed, in world units (meters) per second.
export const MOVE_SPEED = 2.2;

// Look sensitivity for drag-to-look (desktop mouse-drag and mobile
// touch-drag), in radians of rotation per pixel of pointer movement.
export const LOOK_SENSITIVITY = 0.0032;

// Vertical look limit, in radians, measured from the horizon. Prevents the
// camera from flipping over when looking straight up/down.
export const MAX_PITCH = Math.PI / 2 - 0.05;

// Pointer movement (px) below which a press+release is treated as a
// "click/tap" (wall selection) rather than a look-drag.
export const DRAG_CLICK_THRESHOLD_PX = 6;

// ---------------------------------------------------------------------------
// MOBILE JOYSTICK
// ---------------------------------------------------------------------------
export const JOYSTICK_RADIUS_PX = 46;
export const JOYSTICK_KNOB_RADIUS_PX = 20;

// ---------------------------------------------------------------------------
// WALL SELECTION
// ---------------------------------------------------------------------------
// Opacity pulse range applied to a selected wall's wireframe lines.
export const SELECTION_PULSE_MIN = 0.55;
export const SELECTION_PULSE_MAX = 1.0;
export const SELECTION_PULSE_SPEED = 2.4; // radians / second

// ---------------------------------------------------------------------------
// PERFORMANCE / DEBUG
// ---------------------------------------------------------------------------
export const MAX_PIXEL_RATIO = 2;
export const SHOW_FPS_OVERLAY = false;
