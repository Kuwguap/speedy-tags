import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Car, Menu, ShieldCheck } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** The header's links, in one list so the phone menu and the desktop bar can
 *  never drift apart. */
const NAV = [
  { label: "Home", href: "/" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Services", href: "/#services" },
  { label: "FAQ", href: "/#faq" },
] as const;

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
              TriStateTags
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
        {/* Phones: the whole nav lives behind one control, and BUY IT NOW stays
            on screen. Below md the bar used to be a logo and nothing else --
            no links, no menu, and no way to buy without hunting down the page. */}
        <div className="flex items-center gap-2 md:hidden shrink-0">
          <a
            href="/checkout"
            className="inline-flex items-center rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground active:brightness-95"
          >
            BUY NOW
          </a>
          <Sheet>
            <SheetTrigger
              aria-label="Open menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border/60 text-foreground"
            >
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(20rem,85vw)]">
              <SheetTitle className="font-display text-primary text-lg">
                TriStateTags
              </SheetTitle>
              <nav className="mt-6 flex flex-col">
                {NAV.map((item) => (
                  <SheetClose asChild key={item.href}>
                    <a
                      href={item.href}
                      className="border-b border-border/40 py-4 text-base font-medium text-foreground"
                    >
                      {item.label}
                    </a>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <Link
                    to="/interview"
                    className="border-b border-border/40 py-4 text-base font-medium text-foreground"
                  >
                    Become a driver
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <a
                    href="/checkout"
                    className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground"
                  >
                    BUY IT NOW
                  </a>
                </SheetClose>
              </nav>
              <p className="mt-8 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                NJ Licensed Dealer &middot; DMV Verified
              </p>
            </SheetContent>
          </Sheet>
        </div>

        <nav className="hidden md:flex items-center gap-8 shrink-0">
          <a href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">Home</a>
          <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground">Pricing</a>
          <a href="#services" className="text-sm font-medium text-muted-foreground hover:text-foreground">Services</a>
          <a href="#faq" className="text-sm font-medium text-muted-foreground hover:text-foreground">FAQ</a>
          <Link to="/interview" className="text-sm font-medium text-muted-foreground hover:text-foreground">Become a driver</Link>
          <a href="/checkout" className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all">
            BUY IT NOW
          </a>
        </nav>
      </div>
    </header>
  );
}
