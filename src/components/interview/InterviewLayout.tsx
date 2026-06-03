import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Car } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { path: "/interview", label: "Overview", short: "1" },
  { path: "/interview/requirements", label: "Requirements", short: "2" },
  { path: "/interview/apply", label: "Application", short: "3" },
];

export function InterviewLayout({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pathname } = useLocation();
  let stepIndex = STEPS.findIndex((s) =>
    s.path === "/interview" ? pathname === "/interview" || pathname === "/interview/" : pathname.startsWith(s.path),
  );
  if (stepIndex < 0 && pathname.includes("telegram")) stepIndex = 1;

  return (
    <div className={cn("min-h-screen bg-[#fafafa] text-foreground", className)}>
      <header className="sticky top-0 z-50 border-b border-black/5 bg-white/80 backdrop-blur-md">
        <div className="container flex h-14 items-center justify-between gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            TriStateTags
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {STEPS.map((step, i) => {
              const active = i === stepIndex;
              return (
                <Link
                  key={step.path}
                  to={step.path}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-black/5",
                  )}
                >
                  {step.label}
                </Link>
              );
            })}
            <Link
              to="/interview/telegram"
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                pathname.includes("telegram")
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/5",
              )}
            >
              Telegram
            </Link>
          </nav>
          <Link
            to="/interview/apply"
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors"
          >
            Apply
            <Car className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <div className="container py-3">
        <div className="flex justify-center gap-2">
          {STEPS.map((step, i) => (
            <div
              key={step.path}
              className={cn(
                "h-1.5 flex-1 max-w-[120px] rounded-full transition-colors",
                i <= stepIndex ? "bg-violet-500" : "bg-black/10",
              )}
            />
          ))}
        </div>
      </div>

      <main className="container pb-20">{children}</main>
    </div>
  );
}

export function InterviewPillButton({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-8 py-3.5 text-base font-semibold text-background shadow-lg shadow-black/10 hover:bg-foreground/90 transition-all hover:scale-[1.02] active:scale-[0.98]",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

export function InterviewOutlineButton({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-6 py-3 text-sm font-semibold text-foreground hover:bg-black/[0.03] transition-colors",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
