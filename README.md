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
| Edge classification (flat / silhouette / crease) | `src/config.js` → `FLAT_EDGE_DEGREES`, `CREASE_EDGE_DEGREES` |
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
box — it only ever changes the node's quaternion, never its position.

The slider rotates each wall around the fixed **world-vertical axis**
(pre-multiplying the delta quaternion — `Object3D.rotateOnWorldAxis`
semantics), not a local axis. This was verified against the actual
Blender file: three.js local Y is exactly where each wall's Blender local
Z axis lands (confirmed by direct computation, true for all six nodes),
but for WALL 1/3/5 (the `Cylinder.*` turnstile-drum meshes) that local Z
axis itself isn't vertical in world space — it's a leftover
cylinder-primitive axis lying almost flat. Rotating around it tumbled
those three like a rolling pin instead of swinging like a hinged door.
World-vertical rotation gives the identical result for WALL 2/4/6 (whose
local Z already was vertical) and the correct hinge behavior for WALL
1/3/5. See the comment in `src/wallsInteraction.js` for the full
derivation.

## Project structure

```
src/
  config.js            tunable constants (see table above)
  loadModel.js          GLTFLoader + locating Camera.001 / BUILDING / WALL 1-6
  wireframe.js          edge classification (flat / silhouette / crease) + merging (once at load)
  silhouetteLineMaterial.js  view-space silhouette shader for curved-surface edges
  vectorExport.js       SVG / PDF vector export with hidden-line removal
  navigation.js         shared first-person walk controller (WASD + drag-to-look)
  joystick.js            mobile virtual joystick (movement only)
  wallsInteraction.js    raycast selection, pulse feedback, rotation slider
  saveView.js            canvas capture, modal, PNG / SVG / PDF download/share
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

Every mesh edge is classified once at load time by the angle between the
two faces that share it (`src/wireframe.js` → `classifyEdges`):

- **Below `FLAT_EDGE_DEGREES` (1°)** — dropped. glTF triangulates every
  quad/n-gon on export, adding perfectly flat diagonals.
- **At or above `CREASE_EDGE_DEGREES` (40°)**, plus open edges — always
  drawn: real corners, panel edges, rims.
- **In between** — the facets of curved surfaces (cylinders, pipes,
  flutes). These are drawn with `SilhouetteLineMaterial` (three.js's
  "conditional lines" with a view-space test), which shows a facet edge
  only where it is the silhouette from the current camera. A cylinder reads
  as its outline and rims instead of every subdivision, like Freestyle /
  Line Art in Blender.

Loose edges (Blender edges with no face — export `BASE.glb` with glTF
**Data → Mesh → Loose Edges** enabled) are always drawn exactly as authored.

Edge geometry is never regenerated per frame; the silhouette test runs in
the vertex shader.

## Vector export (SVG / PDF, for plotters)

SAVE VIEW offers **PNG** (the screen capture), and **SVG** / **PDF** — the
current view as real vector strokes (`src/vectorExport.js`): the occluders
are rendered offscreen to a depth map (`VECTOR_DEPTH_RESOLUTION`, default
4096 px on the long side), every line — including the silhouettes for this
camera, same test as on screen — is clipped to the view and cut where it
passes behind a surface, and the visible pieces are deduplicated and
chained into polylines (fewer pen lifts). The PDF is a single page of
stroked paths, 1 unit = 1 pt (`VECTOR_OUTPUT_WIDTH` wide). Open either in
Illustrator / Inkscape to convert to DXF or HPGL if a plotter needs it.

## Performance notes

- Per top-level node (the building, each wall), all primitives are merged
  into at most two line draw calls (always-drawn + silhouette) plus one
  depth occluder, regardless of how many line segments the node has.
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
overlay never drawn into the canvas, so it's excluded automatically. The
modal's **PNG**, **SVG** and **PDF** buttons export that same view as an
image or as vectors (see "Vector export" above). On devices with the Web
Share API (`navigator.share`/`canShare`) each opens the native share sheet;
otherwise the file downloads directly.
