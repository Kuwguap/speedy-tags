/**
 * pdf-parse / pdfjs-dist expect browser globals (`DOMMatrix`, etc.). Node does not define them.
 * `pdf-parse` already depends on `@napi-rs/canvas`, which ships compatible implementations.
 */
export async function installPdfJsDomPolyfills (): Promise<void> {
  if (typeof globalThis.DOMMatrix !== 'undefined') return

  const ns = await import('@napi-rs/canvas')

  Object.assign(globalThis, {
    DOMMatrix: ns.DOMMatrix,
    DOMPoint: ns.DOMPoint,
    DOMRect: ns.DOMRect,
    ...(typeof globalThis.Path2D === 'undefined' && 'Path2D' in ns && ns.Path2D
      ? { Path2D: ns.Path2D as typeof globalThis.Path2D }
      : {}),
  })
}
