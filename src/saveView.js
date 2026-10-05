import { exportViewVectors, toSVG, toPDF } from "./vectorExport.js";

/**
 * "SAVE VIEW" — captures exactly what the WebGL canvas shows (camera +
 * wireframe + current wall rotations), with none of the HTML overlay UI,
 * since the UI is never drawn into the canvas in the first place.
 *
 * The modal exports that view as PNG (the capture itself) or, via SVG /
 * PDF, as real vector strokes for plotters / Illustrator (see
 * vectorExport.js). The vectors are computed once per capture, from the
 * camera as it was when SAVE VIEW was pressed, and shared by both formats.
 */
export function setupSaveView({ renderer, scene, camera, button, modal, image, downloadBtn, svgBtn, pdfBtn, closeBtn }) {
  button.addEventListener("click", capture);

  const canShareFiles = !!(navigator.share && navigator.canShare);

  function capture() {
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");
    image.src = dataUrl;
    modal.hidden = false;

    downloadBtn.onclick = async () => {
      const blob = await (await fetch(dataUrl)).blob();
      exportFile(blob, "node-ny-view.png");
    };

    let vectors = null;
    const vectorButton = (btn, label, write, type, filename) => {
      btn.textContent = label;
      btn.disabled = false;
      btn.onclick = () => {
        btn.textContent = "…";
        btn.disabled = true;
        // Let the button repaint before the (blocking) export runs.
        setTimeout(() => {
          try {
            vectors ??= exportViewVectors({ renderer, scene, camera });
            exportFile(new Blob([write(vectors)], { type }), filename);
          } finally {
            btn.textContent = label;
            btn.disabled = false;
          }
        }, 30);
      };
    };
    vectorButton(svgBtn, "SVG", toSVG, "image/svg+xml", "node-ny-view.svg");
    vectorButton(pdfBtn, "PDF", toPDF, "application/pdf", "node-ny-view.pdf");
  }

  async function exportFile(blob, filename) {
    if (canShareFiles) {
      try {
        const file = new File([blob], filename, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "NODE NY" });
          return;
        }
      } catch (err) {
        // User cancelled the share sheet, or it failed — fall back to download.
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  closeBtn.addEventListener("click", () => {
    modal.hidden = true;
  });
}
