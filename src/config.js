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
// Each mesh edge is classified by the angle (degrees) between the two faces
// sharing it:
//  - below FLAT_EDGE_DEGREES: never drawn. glTF triangulates every quad /
//    n-gon on export, adding perfectly flat (0°) diagonals; this drops them.
//  - at or above CREASE_EDGE_DEGREES: always drawn (real corners).
//  - in between: facets of curved surfaces (cylinders, pipes, flutes),
//    drawn only where they form the silhouette from the current camera, so
//    a cylinder reads as its outline + rims instead of every subdivision.
// Loose edges (exported with glTF "Loose Edges") are always drawn as-is.
//
// Lower CREASE_EDGE_DEGREES to keep more facet lines permanently; raise it
// for a sparser, more minimal drawing.
export const FLAT_EDGE_DEGREES = 1;
export const CREASE_EDGE_DEGREES = 40;

export const LINE_COLOR = 0x111111;
export const BACKGROUND_COLOR = 0xffffff;

// ---------------------------------------------------------------------------
// VECTOR EXPORT (SVG / PDF)
// ---------------------------------------------------------------------------
// Long-side resolution (px) of the offscreen depth map used for hidden-line
// removal in the SVG / PDF export. Higher = more precise line cut-offs behind
// objects, at the cost of export time / memory. Capped by the GPU's limit.
export const VECTOR_DEPTH_RESOLUTION = 4096;
// Width of the exported drawing in units — SVG user units / PDF points
// (height follows the view's aspect ratio). Scale freely in Illustrator /
// plotter software.
export const VECTOR_OUTPUT_WIDTH = 1600;
export const VECTOR_STROKE_WIDTH = 0.5;

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
