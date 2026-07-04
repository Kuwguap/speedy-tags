'use client'

import BrandMark from '@/components/BrandMark'

interface User {
  id: string
  email: string
  name: string
  phone: string
}

interface HeaderProps {
  user: User
  onLogout: () => void | Promise<void>
}

export default function Header ({ user, onLogout }: HeaderProps) {
  const handleLogout = async () => {
    try {
      await onLogout()
    } finally {
      if (typeof window !== 'undefined') {
        window.location.assign('/login')
      }
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/90 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5">
        <BrandMark href="/dashboard" />

        <div className="flex items-center gap-3">
          <span className="hidden max-w-[140px] truncate text-sm font-medium text-slate-600 sm:inline sm:max-w-[200px]">
            {user.name}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
