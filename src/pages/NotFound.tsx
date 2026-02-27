import { Link } from "react-router-dom";
import { Home, Car } from "lucide-react";

const NotFound = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-muted/30 to-background">
      <div className="text-center px-6 max-w-md">
        <div className="inline-flex h-24 w-24 items-center justify-center rounded-2xl bg-muted mb-8">
          <Car className="h-12 w-12 text-muted-foreground" />
        </div>
        <h1 className="font-display text-6xl font-bold text-foreground mb-2">404</h1>
        <p className="text-xl text-muted-foreground mb-8">Oops! This road doesn't exist.</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Home className="h-4 w-4" />
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
