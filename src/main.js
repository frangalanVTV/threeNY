import * as THREE from "three";
import { loadModel } from "./loadModel.js";
import { Navigation } from "./navigation.js";
import { setupJoystick } from "./joystick.js";
import { WallInteraction } from "./wallsInteraction.js";
import { setupSaveView } from "./saveView.js";
import { MAX_PIXEL_RATIO, BACKGROUND_COLOR, SHOW_FPS_OVERLAY } from "./config.js";

const canvas = document.getElementById("viewport");
const loadingScreen = document.getElementById("loading-screen");
const fpsOverlay = document.getElementById("fps-overlay");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(BACKGROUND_COLOR, 1);

window.addEventListener("resize", onResize);

let navigation;
let wallInteraction;
let camera;

init();

async function init() {
  const { scene, camera: loadedCamera, walkHeight, walls } = await loadModel();
  camera = loadedCamera;
  onResize();

  navigation = new Navigation(camera, walkHeight, canvas);

  wallInteraction = new WallInteraction({
    camera,
    domElement: canvas,
    walls,
    panel: document.getElementById("wall-slider-panel"),
    slider: document.getElementById("wall-slider"),
    valueLabel: document.getElementById("wall-slider-value"),
    label: document.getElementById("wall-slider-label"),
  });
  navigation.onTap = (x, y) => wallInteraction.handleTap(x, y);

  setupJoystick(document.getElementById("joystick-zone"), (x, y) =>
    navigation.setJoystickVector(x, y)
  );

  setupSaveView({
    renderer,
    scene,
    camera,
    button: document.getElementById("save-view-btn"),
    modal: document.getElementById("save-view-modal"),
    image: document.getElementById("save-view-image"),
    downloadBtn: document.getElementById("save-view-download"),
    closeBtn: document.getElementById("save-view-close"),
  });

  if (SHOW_FPS_OVERLAY) fpsOverlay.hidden = false;

  loadingScreen.classList.add("hidden");

  const clock = new THREE.Clock();
  let fpsAccum = 0;
  let fpsFrames = 0;

  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.1);

    navigation.update(delta);
    wallInteraction.update(delta);

    renderer.render(scene, camera);

    if (SHOW_FPS_OVERLAY) {
      fpsAccum += delta;
      fpsFrames += 1;
      if (fpsAccum >= 0.5) {
        fpsOverlay.textContent = `${Math.round(fpsFrames / fpsAccum)} fps`;
        fpsAccum = 0;
        fpsFrames = 0;
      }
    }
  });
}

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  if (camera) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}
