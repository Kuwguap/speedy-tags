import { Link, useLocation } from "react-router-dom";

export function Header() {
  const { pathname } = useLocation();
  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-line">
      <div className="container-x flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white shadow-card">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <rect x="3" y="6" width="18" height="12" rx="2" />
              <path d="M7 10h10M7 14h6" />
            </svg>
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-ink group-hover:text-primary transition-colors">
            TriStateTags
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {pathname !== "/checkout" && (
            <Link to="/checkout" className="btn-cta h-10 px-4">
              Get my tag
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
