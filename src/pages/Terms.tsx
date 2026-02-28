import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { ArrowLeft } from "lucide-react";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-16 max-w-3xl">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
        <h1 className="font-display text-2xl font-bold mb-4">Terms of Service</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Last updated: {new Date().toLocaleDateString()}
        </p>
        <div className="prose prose-sm text-muted-foreground space-y-4">
          <p>
            Speedy Tags provides temporary vehicle registration tags through our licensed dealer services.
            By using our website and services, you agree to these terms.
          </p>
          <p>
            All temporary tags are issued through the official NJ MVC system and comply with applicable
            regulations. You are responsible for providing accurate information and using tags only for
            lawful purposes.
          </p>
          <p>
            Refunds are subject to our refund policy. Contact us for support or questions.
          </p>
          <p>
            We reserve the right to update these terms. Continued use constitutes acceptance of changes.
          </p>
        </div>
      </div>
    </div>
  );
}
