# NODE NY — Wireframe Viewer

A minimal, high-performance Three.js wireframe walkthrough of the NODE NY
space, built from the canonical Blender export `BASE.glb`.

## Install

```bash
npm install
```

## Dev

```bash
npm run dev
```

Opens a local dev server (default `http://localhost:5173`).

## Build

```bash
npm run build
```

Outputs a static production build to `dist/`.

```bash
npm run preview
```

Serves the production build locally for a final check.

## Deployment

The project is a static Vite build with no server-side code and no
environment variables, so it deploys to Vercel with zero configuration:
push to a Git repo, import it in Vercel, and it will detect the Vite
framework preset automatically (`npm run build`, output directory `dist`).

## Where things live

| What | Where |
| --- | --- |
| The canonical 3D scene | `public/BASE.glb` (served as-is, untouched geometry) |
| EdgesGeometry threshold | `src/config.js` → `EDGE_THRESHOLD_DEGREES` |
| Movement speed | `src/config.js` → `MOVE_SPEED` |
| Mouse/touch look sensitivity | `src/config.js` → `LOOK_SENSITIVITY` |
| Pitch limit | `src/config.js` → `MAX_PITCH` |
| Selection pulse look | `src/config.js` → `SELECTION_PULSE_MIN/MAX/SPEED` |
| Debug FPS overlay (off by default) | `src/config.js` → `SHOW_FPS_OVERLAY` |

## The six movable walls

Exact node names as authored in Blender / exported in `BASE.glb`:

```
WALL 1
WALL 2
WALL 3
WALL 4
WALL 5
WALL 6
```

Each is an independent top-level node with its own Blender-authored pivot
(origin). The app never recenters or recomputes a pivot from a bounding
box — it rotates each wall directly around its own local Y axis in
Three.js, which is local Z in Blender (see the comment in
`src/wallsInteraction.js` for why that mapping holds regardless of a
wall's base orientation/scale).

## Project structure

```
src/
  config.js            tunable constants (see table above)
  loadModel.js          GLTFLoader + locating Camera.001 / BUILDING / WALL 1-6
  wireframe.js          EdgesGeometry generation + geometry merging (cached once at load)
  navigation.js         shared first-person walk controller (WASD + drag-to-look)
  joystick.js            mobile virtual joystick (movement only)
  wallsInteraction.js    raycast selection, pulse feedback, rotation slider
  saveView.js            canvas capture, modal, download/share
  main.js                wires everything together, render loop, resize
  style.css               all UI styling
```

## Camera

The initial camera reproduces `Camera.001` from `BASE.glb` exactly: world
position, world orientation, and vertical FOV are read directly off the
loaded glTF camera node — nothing is hand-tuned. Its initial height (world
Y) becomes the fixed walking height for the whole session.

## Navigation

- **Desktop:** WASD/arrow keys to move, click-and-drag with the mouse to
  look around (a full click with no drag selects a wall instead). Movement
  is always horizontal; height never changes.
- **Mobile:** a small joystick (bottom-left) for movement, touch-and-drag
  anywhere else on the screen to look around. Same movement math as
  desktop, fed through the same controller.

Pointer Lock was deliberately not used — a click-drag-to-look model keeps
the OS cursor visible and avoids the "game" feel the brief asked to avoid,
while still supporting free yaw/pitch look with a clamped pitch so the
camera can't flip.

## Wireframe method

`BASE.glb`'s meshes are quad/ngon based in Blender but glTF always
triangulates on export, which adds a diagonal per polygon. Those diagonals
sit at a perfectly flat 0° dihedral angle, so `THREE.EdgesGeometry` with a
small non-zero threshold (`EDGE_THRESHOLD_DEGREES`, default `1`) removes
them while keeping every real edge — panel seams, the mesh-grille
strands, column flutes — matching Blender's native "Wireframe" viewport
shading reference. Edge geometry is generated once at load time per
top-level node and merged into a single `LineSegments` draw call; it is
never regenerated per frame.

## Performance notes

- Per top-level node (the building, each wall), all primitives are merged
  into one `LineSegments` draw call — 7 draw calls total for the whole
  scene, regardless of the ~275k line segments in the building's
  mesh-grille detail.
- Original PBR materials/textures are discarded immediately after edge
  extraction — the viewer only ever needs line geometry.
- Wall raycasting tests only the six invisible wall proxy meshes, never
  the building wireframe.
- `devicePixelRatio` is capped (`MAX_PIXEL_RATIO`, default `2`) to protect
  mobile GPUs.
- No allocations inside the render loop — reusable `Vector3`/`Quaternion`
  scratch objects live at module scope.
- Measured ~60 fps steady on real GPU hardware (Apple M3 Max via WebGL/
  ANGLE) with 5–7 draw calls per frame.

## Save View

Renders the current frame and reads it straight off the WebGL canvas via
`toDataURL()` — the HTML UI (joystick, slider, buttons) is a separate
overlay never drawn into the canvas, so it's excluded automatically. On
devices with the Web Share API (`navigator.share`/`canShare`), the action
button reads "SHARE" and opens the native share sheet; otherwise it reads
"DOWNLOAD" and saves the PNG directly.
