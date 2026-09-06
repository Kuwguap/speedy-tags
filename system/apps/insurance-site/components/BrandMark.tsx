import Link from 'next/link'

type BrandMarkProps = {
  href?: string
  size?: 'sm' | 'md'
  showWordmark?: boolean
  /** Dark backgrounds: white wordmark */
  invert?: boolean
  className?: string
}

export default function BrandMark ({
  href = '/',
  size = 'md',
  showWordmark = true,
  invert = false,
  className = '',
}: BrandMarkProps) {
  const box =
    size === 'sm'
      ? 'h-9 min-w-9 w-auto rounded-lg px-1'
      : 'h-11 min-w-11 w-auto rounded-xl px-1.5'
  const initialsClass =
    size === 'sm'
      ? 'text-[9px] font-bold tracking-tight text-white'
      : 'brand-logo-text text-white'

  const inner = (
    <>
      <div className={`brand-logo-box ${box} flex items-center justify-center gap-0.5`}>
        <svg
          className="h-3.5 w-3.5 shrink-0 text-white/95"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 2.5c-2.7 0-5.1.4-5.1.4L6 3.2v7.1c0 3.2 1.2 5.3 2.3 6.6 1.1 1.3 2.1 1.7 2.1 1.7l.6.3.6-.3s1-.4 2.1-1.7c1.1-1.3 2.3-3.4 2.3-6.6V3.2l-.9-.3s-2.4-.4-5.1-.4Z" />
        </svg>
        <span className={initialsClass}>NJ</span>
      </div>
      {showWordmark && (
        <span
          className={`text-lg font-bold tracking-tight md:text-xl ${
            invert ? 'text-white' : 'text-slate-900'
          }`}
        >
          NJ Coverage
        </span>
      )}
    </>
  )

  const cls = `flex items-center gap-3 ${className}`

  if (href) {
    return (
      <Link href={href} className={`${cls} group`}>
        {inner}
      </Link>
    )
  }

  return <div className={cls}>{inner}</div>
}
