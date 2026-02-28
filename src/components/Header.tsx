import { Link } from "react-router-dom";
import { Car, ShieldCheck } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-white/95 backdrop-blur-md shadow-sm">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 group shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Car className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold text-foreground group-hover:text-primary transition-colors">
            Speedy Tags
          </span>
        </Link>
        <div className="hidden lg:flex items-center gap-6 text-xs text-muted-foreground shrink-0">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            NJ Licensed Dealer
          </span>
          <span>DMV Verified</span>
          <span>Secure Payments</span>
        </div>
        <nav className="hidden md:flex items-center gap-8">
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
