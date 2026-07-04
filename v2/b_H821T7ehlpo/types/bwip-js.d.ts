/**
 * Minimal ambient type for `bwip-js`. The shipped `dist/bwip-js-node.d.ts`
 * isn't picked up by Next 15's `bundler` module resolution, so we declare
 * just the subset of the API we use.
 */
declare module 'bwip-js' {
  type ToBufferCallback = (err: Error | null, png: Buffer) => void

  interface ToBufferOptions {
    bcid: string
    text: string
    scale?: number
    scaleX?: number
    scaleY?: number
    width?: number
    height?: number
    eclevel?: number | string
    columns?: number
    includetext?: boolean
    backgroundcolor?: string
    barcolor?: string
    paddingleft?: number
    paddingright?: number
    paddingtop?: number
    paddingbottom?: number
  }

  interface BwipJs {
    toBuffer(opts: ToBufferOptions): Promise<Buffer>
    toBuffer(opts: ToBufferOptions, callback: ToBufferCallback): void
  }

  const bwipjs: BwipJs
  export default bwipjs
}
