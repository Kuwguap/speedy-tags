import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import Index from "./Index";
import NotFound from "./NotFound";
import { api } from "@/lib/api";
import { isCapturableSlug, normalizeRefSlug, setReferralCode } from "@/lib/referral";

/**
 * Handles tristatetags.com/<affiliate-slug>. Stores the referral (first-touch),
 * confirms it if it maps to a real affiliate, then renders the normal landing
 * page in place so the URL stays on the affiliate's link.
 */
export default function ReferralLanding() {
  const { refCode } = useParams();
  const slug = normalizeRefSlug(refCode);
  const capturable = isCapturableSlug(slug);

  useEffect(() => {
    if (!capturable) return;
    setReferralCode(slug);
    // Confirm the link is live (nice feedback when an affiliate tests their own).
    api
      .checkAffiliate(slug)
      .then((r) => {
        if (r.exists) toast.success(`You're shopping with ${r.label || slug}'s link`);
      })
      .catch(() => {});
  }, [slug, capturable]);

  if (!capturable) return <NotFound />;
  return <Index />;
}
