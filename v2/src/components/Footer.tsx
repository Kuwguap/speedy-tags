import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-cream">
      <div className="container-x flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-8 text-sm text-muted">
        <p>&copy; {new Date().getFullYear()} Kingsman Tags. Instant inbox delivery.</p>
        <div className="flex items-center gap-4 text-xs">
          <Link to="/login" className="hover:text-navy transition-colors">
            Sign in
          </Link>
          <Link to="/account" className="hover:text-navy transition-colors">
            Account
          </Link>
        </div>
      </div>
    </footer>
  );
}
