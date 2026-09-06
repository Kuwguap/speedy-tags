import { Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home";
import Checkout from "./pages/Checkout";
import Success from "./pages/Success";

function Header() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
      <Link to="/" className="font-display text-xl font-700 uppercase tracking-[0.06em] text-ink">
        <span className="text-issued-deep">NJ</span> Temporary Tag
      </Link>
      <nav className="flex items-center gap-3">
        <a href="#how" className="hidden font-display text-sm font-500 text-slate hover:text-ink sm:block">
          How it works
        </a>
        <Link to="/checkout" className="btn-primary !px-5 !py-2.5 text-sm">
          Get my tag
        </Link>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-5 py-10 text-sm text-slate">
      <div className="flex flex-col items-start justify-between gap-3 border-t border-ink/10 pt-6 sm:flex-row sm:items-center">
        <span>© {new Date().getFullYear()} NJ Temporary Tag</span>
        <span className="text-slate-light">Temporary registration document service.</span>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/success" element={<Success />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
