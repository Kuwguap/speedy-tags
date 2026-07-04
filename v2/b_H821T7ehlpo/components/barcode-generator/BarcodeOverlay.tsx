'use client'

import * as React from 'react'
import { GripIcon, XIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { BarcodeStyleId } from '@/lib/barcode-generator/presets'

export interface BarcodePlacement {
  id: string
  style: BarcodeStyleId
  /** Position in *background pixels* (top-left origin). */
  xPx: number
  yPx: number
  widthPx: number
  heightPx: number
}

interface Props {
  placement: BarcodePlacement
  /** PNG data URL of the rendered barcode (re-rendered when payload/style changes). */
  imageUrl: string | null
  /** Pixel scale: how many CSS pixels per background pixel (preview is scaled to fit). */
  cssScale: number
  selected: boolean
  onSelect: () => void
  onChange: (next: BarcodePlacement) => void
  onRemove: () => void
}

export default function BarcodeOverlay ({
  placement,
  imageUrl,
  cssScale,
  selected,
  onSelect,
  onChange,
  onRemove,
}: Props) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const dragRef = React.useRef<{
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)
  const resizeRef = React.useRef<{
    startX: number
    startY: number
    origW: number
    origH: number
  } | null>(null)

  React.useEffect(() => {
    function move (e: PointerEvent) {
      if (dragRef.current) {
        const dx = (e.clientX - dragRef.current.startX) / cssScale
        const dy = (e.clientY - dragRef.current.startY) / cssScale
        onChange({
          ...placement,
          xPx: Math.max(0, dragRef.current.origX + dx),
          yPx: Math.max(0, dragRef.current.origY + dy),
        })
      } else if (resizeRef.current) {
        const dx = (e.clientX - resizeRef.current.startX) / cssScale
        const dy = (e.clientY - resizeRef.current.startY) / cssScale
        const aspect = resizeRef.current.origH / Math.max(1, resizeRef.current.origW)
        const newW = Math.max(40, resizeRef.current.origW + dx)
        const newH = Math.max(20, e.shiftKey
          ? resizeRef.current.origH + dy
          : newW * aspect)
        onChange({
          ...placement,
          widthPx: newW,
          heightPx: newH,
        })
      }
    }
    function up () {
      dragRef.current = null
      resizeRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [cssScale, onChange, placement])

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onPointerDown={e => {
        if ((e.target as HTMLElement).dataset.role === 'resize') return
        if ((e.target as HTMLElement).dataset.role === 'remove') return
        onSelect()
        dragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          origX: placement.xPx,
          origY: placement.yPx,
        }
        ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
      }}
      style={{
        position: 'absolute',
        left: placement.xPx * cssScale,
        top: placement.yPx * cssScale,
        width: placement.widthPx * cssScale,
        height: placement.heightPx * cssScale,
        cursor: 'grab',
        touchAction: 'none',
      }}
      className={cn(
        'group select-none rounded-sm bg-white/40',
        selected
          ? 'outline outline-2 outline-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.25)]'
          : 'outline outline-1 outline-blue-300/70 hover:outline-blue-500',
      )}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt="PDF417 barcode"
          draggable={false}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            background:
              'repeating-linear-gradient(90deg, #111 0 4px, #fff 4px 6px)',
          }}
        />
      )}

      <span
        className="pointer-events-none absolute -top-5 left-0 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow"
      >
        {placement.style}
        <span className="ml-1 font-mono opacity-80">
          {Math.round(placement.widthPx)}×{Math.round(placement.heightPx)}
        </span>
      </span>

      <button
        type="button"
        data-role="remove"
        onClick={e => {
          e.stopPropagation()
          onRemove()
        }}
        title="Remove barcode"
        className="absolute -right-2 -top-2 hidden size-5 items-center justify-center rounded-full bg-red-600 text-white shadow group-hover:flex"
      >
        <XIcon className="size-3" />
      </button>

      <div
        data-role="resize"
        title="Drag to resize (Shift to free-resize)"
        onPointerDown={e => {
          e.stopPropagation()
          onSelect()
          resizeRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origW: placement.widthPx,
            origH: placement.heightPx,
          }
          ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
        }}
        className="absolute right-0 bottom-0 flex size-3 translate-x-1/2 translate-y-1/2 cursor-nwse-resize items-center justify-center rounded-sm bg-blue-600 text-white"
      >
        <GripIcon className="size-2" />
      </div>
    </div>
  )
}
