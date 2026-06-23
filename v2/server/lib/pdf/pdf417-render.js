/**
 * Render an AAMVA PDF417 payload to a PNG buffer using bwip-js.
 * Used by the NY insurance card builder for the on-card barcode and the
 * larger DMV-fax barcode at the bottom of the page.
 */

import bwipjs from "bwip-js";

export async function renderPdf417Png(text, options = {}) {
  const payload = text.length > 1800 ? text.slice(0, 1800) : text;
  const scale = options.scale ?? 3;
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      {
        bcid: "pdf417",
        text: payload,
        scale,
        includetext: false,
        eclevel: options.eclevel ?? 4,
        ...(options.columns != null ? { columns: options.columns } : {}),
        ...(options.widthMm != null ? { width: options.widthMm } : {}),
        ...(options.heightMm != null ? { height: options.heightMm } : {}),
      },
      (err, png) => (err ? reject(err) : resolve(png)),
    );
  });
}
