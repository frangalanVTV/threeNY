import * as THREE from "three";
import {
  MOVE_SPEED,
  LOOK_SENSITIVITY,
  MAX_PITCH,
  DRAG_CLICK_THRESHOLD_PX,
} from "./config.js";

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");
const _lookEuler = new THREE.Euler(0, 0, 0, "YXZ");
const UP = new THREE.Vector3(0, 1, 0);

/**
 * First-person walkthrough controller shared by desktop and mobile.
 *
 * - Look: press-and-drag with mouse OR touch on `dragElement` (both use the
 *   Pointer Events API, so the same handlers cover both inputs). A drag
 *   shorter than DRAG_CLICK_THRESHOLD_PX is treated as a tap/click and
 *   forwarded to `onTap` instead (used for wall selection).
 * - Move: WASD/arrow keys on desktop, plus an externally-driven joystick
 *   vector (see joystick.js) on mobile — both feed the same movement math.
 * - Height: camera.position.y is hard-pinned to `walkHeight` every frame;
 *   nothing in this class ever changes it otherwise.
 */
export class Navigation {
  constructor(camera, walkHeight, dragElement) {
    this.camera = camera;
    this.walkHeight = walkHeight;
    this.dragElement = dragElement;

    _lookEuler.setFromQuaternion(camera.quaternion, "YXZ");
    this.yaw = _lookEuler.y;
    this.pitch = THREE.MathUtils.clamp(_lookEuler.x, -MAX_PITCH, MAX_PITCH);

    this.keys = { forward: false, backward: false, left: false, right: false };
    this.joystick = { x: 0, y: 0 };

    /** Set from outside (wall interaction) to receive tap/click coordinates. */
    this.onTap = null;

    this._dragPointerId = null;
    this._dragLast = { x: 0, y: 0 };
    this._dragMoved = 0;

    this._bindKeyboard();
    this._bindDrag();

    dragElement.style.cursor = "grab";
  }

  _bindKeyboard() {
    window.addEventListener("keydown", (e) => this._setKey(e.code, true));
    window.addEventListener("keyup", (e) => this._setKey(e.code, false));
  }

  _setKey(code, value) {
    switch (code) {
      case "KeyW":
      case "ArrowUp":
        this.keys.forward = value;
        break;
      case "KeyS":
      case "ArrowDown":
        this.keys.backward = value;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.keys.left = value;
        break;
      case "KeyD":
      case "ArrowRight":
        this.keys.right = value;
        break;
    }
  }

  _bindDrag() {
    const el = this.dragElement;

    el.addEventListener("pointerdown", (e) => {
      if (this._dragPointerId !== null) return;
      this._dragPointerId = e.pointerId;
      this._dragLast.x = e.clientX;
      this._dragLast.y = e.clientY;
      this._dragMoved = 0;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Pointer already released — safe to ignore.
      }
      el.style.cursor = "grabbing";
    });

    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this._dragPointerId) return;
      const dx = e.clientX - this._dragLast.x;
      const dy = e.clientY - this._dragLast.y;
      this._dragLast.x = e.clientX;
      this._dragLast.y = e.clientY;
      this._dragMoved += Math.abs(dx) + Math.abs(dy);

      this.yaw -= dx * LOOK_SENSITIVITY;
      this.pitch -= dy * LOOK_SENSITIVITY;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -MAX_PITCH, MAX_PITCH);
    });

    const end = (e) => {
      if (e.pointerId !== this._dragPointerId) return;
      this._dragPointerId = null;
      el.style.cursor = "grab";
      if (this._dragMoved < DRAG_CLICK_THRESHOLD_PX && this.onTap) {
        this.onTap(e.clientX, e.clientY);
      }
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  /** x = strafe [-1,1], y = forward [-1,1]; called by the mobile joystick. */
  setJoystickVector(x, y) {
    this.joystick.x = x;
    this.joystick.y = y;
  }

  update(deltaSeconds) {
    this.camera.quaternion.setFromEuler(_euler.set(this.pitch, this.yaw, 0, "YXZ"));

    let inputX = this.joystick.x;
    let inputZ = -this.joystick.y;

    if (this.keys.forward) inputZ -= 1;
    if (this.keys.backward) inputZ += 1;
    if (this.keys.left) inputX -= 1;
    if (this.keys.right) inputX += 1;

    if (inputX !== 0 || inputZ !== 0) {
      _forward.set(0, 0, -1).applyEuler(_euler.set(0, this.yaw, 0, "YXZ"));
      _right.crossVectors(_forward, UP).normalize();

      const len = Math.hypot(inputX, inputZ);
      const normX = len > 1 ? inputX / len : inputX;
      const normZ = len > 1 ? inputZ / len : inputZ;

      this.camera.position.addScaledVector(_forward, -normZ * MOVE_SPEED * deltaSeconds);
      this.camera.position.addScaledVector(_right, normX * MOVE_SPEED * deltaSeconds);
    }

    // Fixed walking height — horizontal translation only.
    this.camera.position.y = this.walkHeight;
  }
}
