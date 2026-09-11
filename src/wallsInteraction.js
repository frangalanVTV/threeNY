import * as THREE from "three";
import {
  SELECTION_PULSE_MIN,
  SELECTION_PULSE_MAX,
  SELECTION_PULSE_SPEED,
} from "./config.js";

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _deltaQuat = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * Click/tap-to-select for the six movable walls, restrained pulse feedback
 * on the selected wall, and the 0–360° slider that spins it live around its
 * exported Blender pivot (rotation happens purely in local space, about the
 * node's own local Y axis — which is local Z in Blender, see wireframe.js /
 * loadModel.js for why that mapping holds regardless of a wall's base
 * orientation).
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

    _deltaQuat.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(angleDeg));
    this.selected.group.quaternion
      .copy(this.selected.baseQuaternion)
      .multiply(_deltaQuat);

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
