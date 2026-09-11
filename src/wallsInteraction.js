import * as THREE from "three";
import {
  SELECTION_PULSE_MIN,
  SELECTION_PULSE_MAX,
  SELECTION_PULSE_SPEED,
} from "./config.js";

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _deltaQuat = new THREE.Quaternion();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Click/tap-to-select for the six movable walls, restrained pulse feedback
 * on the selected wall, and the 0–360° slider that spins it live around its
 * exported Blender pivot.
 *
 * Rotation axis: verified by direct computation (Blender matrix_world axes
 * vs. the exported glTF node quaternions) that three.js local Y is exactly
 * where each wall's Blender local Z axis lands — true for all six nodes,
 * no parent transforms involved. BUT for WALL 1/3/5 (the "Cylinder.*"
 * turnstile-drum meshes) that local Z axis itself is *not* vertical in
 * world space — it's a leftover cylinder-primitive axis lying almost flat
 * in the horizontal plane — so spinning them around their own local Z/Y
 * tumbled them like a rolling pin instead of swinging like a hinged door.
 * WALL 2/4/6's local Z happens to already be vertical, so they looked
 * correct. The fix rotates every wall around the fixed WORLD vertical axis
 * (pre-multiplying the delta quaternion, i.e. Object3D.rotateOnWorldAxis
 * semantics) instead of the object's own local axis — identical result for
 * WALL 2/4/6, and the actually-intended hinge behaviour for WALL 1/3/5.
 * The pivot (translation) is untouched either way.
 *
 * Raycasting only ever tests the six invisible wall proxy meshes, never the
 * (much heavier) building wireframe.
 */
export class WallInteraction {
  constructor({ camera, domElement, walls, panel, slider, valueLabel, label }) {
    this.camera = camera;
    this.domElement = domElement;
    this.walls = walls;
    this.panel = panel;
    this.slider = slider;
    this.valueLabel = valueLabel;
    this.label = label;

    this.selected = null;
    this._pulseT = 0;

    this.proxies = walls.map((w) => w.proxy).filter(Boolean);

    this.slider.addEventListener("input", () => this._onSliderInput());
  }

  handleTap(clientX, clientY) {
    const rect = this.domElement.getBoundingClientRect();
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    _raycaster.setFromCamera(_ndc, this.camera);
    const hits = _raycaster.intersectObjects(this.proxies, false);

    if (hits.length === 0) {
      this.select(null);
      return;
    }

    const wallName = hits[0].object.userData.wallName;
    const wall = this.walls.find((w) => w.name === wallName);
    this.select(wall === this.selected ? null : wall);
  }

  select(wall) {
    if (this.selected && this.selected !== wall) {
      this.selected.lines.material.opacity = 1;
    }

    this.selected = wall;

    if (!wall) {
      this.panel.hidden = true;
      return;
    }

    this._pulseT = 0;
    this.label.textContent = wall.name;
    this.slider.value = String(wall.angleDeg);
    this.valueLabel.textContent = `${Math.round(wall.angleDeg)}°`;
    this.panel.hidden = false;
  }

  _onSliderInput() {
    if (!this.selected) return;
    const angleDeg = Number(this.slider.value);
    this.selected.angleDeg = angleDeg;

    // World-axis (not local-axis) rotation: pre-multiplying applies the
    // delta about the fixed world-vertical axis on top of the base
    // orientation, so the wall always swings horizontally regardless of
    // its own base tilt — see the class doc comment above.
    _deltaQuat.setFromAxisAngle(WORLD_UP, THREE.MathUtils.degToRad(angleDeg));
    this.selected.group.quaternion
      .copy(this.selected.baseQuaternion)
      .premultiply(_deltaQuat);

    this.valueLabel.textContent = `${Math.round(angleDeg)}°`;
  }

  update(deltaSeconds) {
    if (!this.selected) return;
    this._pulseT += deltaSeconds * SELECTION_PULSE_SPEED;
    const t = (Math.sin(this._pulseT) + 1) / 2;
    this.selected.lines.material.opacity =
      SELECTION_PULSE_MIN + t * (SELECTION_PULSE_MAX - SELECTION_PULSE_MIN);
  }
}
