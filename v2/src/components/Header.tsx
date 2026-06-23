import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { getSession } from "../lib/auth";

export function Header() {
  const { pathname } = useLocation();
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(!!getSession());
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 bg-cream/85 backdrop-blur border-b border-line">
      <div className="container-x flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group">
          <Logo />
          <span className="font-display text-lg font-bold tracking-tight text-navy group-hover:text-gold-dark transition-colors">
            Kingsman&nbsp;Tags
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          {hasSession ? (
            <Link
              to="/account"
              className={`hidden sm:inline-flex h-10 items-center px-3.5 rounded-lg text-sm font-semibold text-navy hover:bg-navy/5 transition-colors ${
                pathname === "/account" ? "bg-navy/5" : ""
              }`}
            >
              My account
            </Link>
          ) : (
            <Link
              to="/login"
              className={`hidden sm:inline-flex h-10 items-center px-3.5 rounded-lg text-sm font-semibold text-navy hover:bg-navy/5 transition-colors ${
                pathname === "/login" ? "bg-navy/5" : ""
              }`}
            >
              Sign in
            </Link>
          )}
          {pathname !== "/checkout" && (
            <Link to="/checkout" className="btn-gold h-10 px-4">
              Get my tag
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
