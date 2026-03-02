import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { ArrowLeft } from "lucide-react";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-16 max-w-3xl">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
        <h1 className="font-display text-2xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Last updated: {new Date().toLocaleDateString()}
        </p>
        <div className="prose prose-sm text-muted-foreground space-y-4">
          <p>
            TriStateTags respects your privacy. We collect information necessary to process your temporary
            tag orders, including name, contact details, vehicle information, and delivery address.
          </p>
          <p>
            Your data is used solely for order processing, NJ MVC compliance, and delivery. We do not
            sell or share your information with third parties except as required for processing or by law.
          </p>
          <p>
            Payment information is handled by secure third-party processors. We retain order records
            as required by regulations.
          </p>
          <p>
            Contact us with any privacy questions or requests.
          </p>
        </div>
      </div>
    </div>
  );
}
