import { JOYSTICK_RADIUS_PX, JOYSTICK_KNOB_RADIUS_PX } from "./config.js";

const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

/**
 * Minimal fixed-base virtual joystick. Only rendered on touch-capable
 * devices. Reports a normalized (x, y) vector in [-1, 1] via onChange —
 * x = strafe, y = forward — matching Navigation.setJoystickVector.
 */
export function setupJoystick(zoneEl, onChange) {
  if (!isTouchDevice) {
    zoneEl.hidden = true;
    return;
  }

  zoneEl.hidden = false;
  zoneEl.style.setProperty("--joystick-radius", `${JOYSTICK_RADIUS_PX}px`);

  const knob = document.createElement("div");
  knob.className = "joystick-knob";
  knob.style.setProperty("--knob-radius", `${JOYSTICK_KNOB_RADIUS_PX}px`);
  zoneEl.appendChild(knob);

  let pointerId = null;
  let centerX = 0;
  let centerY = 0;

  function setKnob(x, y) {
    knob.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  }

  function handleMove(e) {
    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > JOYSTICK_RADIUS_PX) {
      dx = (dx / dist) * JOYSTICK_RADIUS_PX;
      dy = (dy / dist) * JOYSTICK_RADIUS_PX;
    }
    setKnob(dx, dy);
    onChange(dx / JOYSTICK_RADIUS_PX, -dy / JOYSTICK_RADIUS_PX);
  }

  zoneEl.addEventListener("pointerdown", (e) => {
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    const rect = zoneEl.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    try {
      zoneEl.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already released — safe to ignore.
    }
    zoneEl.classList.add("active");
    handleMove(e);
  });

  zoneEl.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointerId) return;
    handleMove(e);
  });

  const end = (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    setKnob(0, 0);
    onChange(0, 0);
    zoneEl.classList.remove("active");
  };
  zoneEl.addEventListener("pointerup", end);
  zoneEl.addEventListener("pointercancel", end);
}
