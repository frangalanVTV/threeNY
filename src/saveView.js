/**
 * "SAVE VIEW" — captures exactly what the WebGL canvas shows (camera +
 * wireframe + current wall rotations), with none of the HTML overlay UI,
 * since the UI is never drawn into the canvas in the first place.
 */
export function setupSaveView({ renderer, scene, camera, button, modal, image, downloadBtn, closeBtn }) {
  button.addEventListener("click", capture);

  function capture() {
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");
    image.src = dataUrl;
    modal.hidden = false;

    const canShareFiles = !!(navigator.share && navigator.canShare);
    downloadBtn.textContent = canShareFiles ? "SHARE" : "DOWNLOAD";
    downloadBtn.onclick = () => handleExport(dataUrl, canShareFiles);
  }

  async function handleExport(dataUrl, canShareFiles) {
    if (canShareFiles) {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "node-ny-view.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "NODE NY" });
          return;
        }
      } catch (err) {
        // User cancelled the share sheet, or it failed — fall back to download.
      }
    }
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = "node-ny-view.png";
    link.click();
  }

  closeBtn.addEventListener("click", () => {
    modal.hidden = true;
  });
}
