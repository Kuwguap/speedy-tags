import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { CheckoutProvider } from "@/context/CheckoutContext";
import { BackgroundMusic } from "@/components/BackgroundMusic";
import FridayPayday from "./pages/FridayPayday";
import Index from "./pages/Index";
import CheckoutGuarantee from "./pages/CheckoutGuarantee";
import CheckoutProduct from "./pages/CheckoutProduct";
import CheckoutTagInfo from "./pages/CheckoutTagInfo";
import CheckoutDone from "./pages/CheckoutDone";
import Admin from "./pages/Admin";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Payments from "./pages/Payments";
import SecurePhone from "./pages/SecurePhone";
import NotFound from "./pages/NotFound";
import ReferralLanding from "./pages/ReferralLanding";
import InterviewLanding from "./pages/interview/InterviewLanding";
import InterviewRequirements from "./pages/interview/InterviewRequirements";
import InterviewApply from "./pages/interview/InterviewApply";
import InterviewTelegram from "./pages/interview/InterviewTelegram";
import Tag from "./pages/Tag";
import TagSuccess from "./pages/TagSuccess";

const queryClient = new QueryClient();

/** The old "upload your documents" step, now folded into /checkout/tag-info.
 *
 * That page takes the licence, title and insurance card together, so asking for
 * them again by category afterwards was the same work twice. This stays as a
 * redirect rather than a deleted route because paid orders carry the URL in
 * flight and in email -- a 404 on it reads as a lost order. The query string
 * comes along: /checkout/done needs the orderId that is sitting in it.
 */
function DocumentsRetired() {
  const { search } = useLocation();
  return <Navigate to={`/checkout/done${search}`} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <CheckoutProvider>
          <BackgroundMusic />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/checkout" element={<CheckoutGuarantee />} />
            <Route path="/checkout/product" element={<CheckoutProduct />} />
            <Route path="/checkout/tag-info" element={<CheckoutTagInfo />} />
            <Route path="/checkout/documents" element={<DocumentsRetired />} />
            <Route path="/checkout/done" element={<CheckoutDone />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/FridayPayday" element={<FridayPayday />} />
            <Route path="/fridaypayday/:dispatcherSlug" element={<FridayPayday />} />
            <Route path="/fridaypayday" element={<FridayPayday />} />
            <Route path="/payment" element={<Payments />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/secure/phone/:orderId" element={<SecurePhone />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/interview" element={<InterviewLanding />} />
            <Route path="/interview/requirements" element={<InterviewRequirements />} />
            <Route path="/interview/apply" element={<InterviewApply />} />
            <Route path="/interview/telegram" element={<InterviewTelegram />} />
            <Route path="/interview/*" element={<InterviewLanding />} />
            {/* NJ temp-tag generator (reuses the krab-tag-bot generator). */}
            <Route path="/tag" element={<Tag />} />
            <Route path="/tag/success" element={<TagSuccess />} />
            {/* Affiliate links: tristatetags.com/<slug>. Must stay last before the catch-all. */}
            <Route path="/:refCode" element={<ReferralLanding />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </CheckoutProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
