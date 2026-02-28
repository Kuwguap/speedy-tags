import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Car, ShieldCheck } from "lucide-react";

const SCROLL_THRESHOLD = 120;

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (scrolled) return; // Once set, never reset until reload
      if (window.scrollY > SCROLL_THRESHOLD) {
        setScrolled(true);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Check initial position
    return () => window.removeEventListener("scroll", handleScroll);
  }, [scrolled]);

  return (
    <header className="sticky top-0 z-50 border-b border-border/20 bg-transparent">
      <div className="container flex h-16 items-center justify-between gap-4">
        <div className={`flex items-center gap-4 relative ${scrolled ? "flex-1 min-w-0" : ""}`}>
          {/* Car: drives off left-to-right on scroll */}
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center text-primary ${
              scrolled
                ? "absolute left-0 animate-car-drive-off pointer-events-none"
                : ""
            }`}
          >
            <Car className="h-6 w-6" />
          </div>
          <Link
            to="/"
            className={`flex items-center gap-2.5 group shrink-0 transition-all duration-[2000ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
              scrolled ? "absolute left-1/2 -translate-x-1/2" : ""
            }`}
          >
            <span className="font-display text-xl font-bold text-primary group-hover:text-primary/90 transition-colors">
              Speedy Tags
            </span>
          </Link>
          <div className={`hidden lg:flex items-center gap-6 text-xs text-muted-foreground shrink-0 transition-all duration-[1200ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)] ${scrolled ? "opacity-0 w-0 overflow-hidden" : ""}`}>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              NJ Licensed Dealer
            </span>
            <span>DMV Verified</span>
            <span>Secure Payments</span>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-8 shrink-0">
          <a href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">Home</a>
          <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground">Pricing</a>
          <a href="#services" className="text-sm font-medium text-muted-foreground hover:text-foreground">Services</a>
          <a href="#faq" className="text-sm font-medium text-muted-foreground hover:text-foreground">FAQ</a>
          <a href="#services" className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all">
            BUY IT NOW
          </a>
        </nav>
      </div>
    </header>
  );
}
