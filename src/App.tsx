import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CheckoutProvider } from "@/context/CheckoutContext";
import Index from "./pages/Index";
import CheckoutGuarantee from "./pages/CheckoutGuarantee";
import CheckoutProduct from "./pages/CheckoutProduct";
import CheckoutTagInfo from "./pages/CheckoutTagInfo";
import CheckoutDocuments from "./pages/CheckoutDocuments";
import CheckoutDone from "./pages/CheckoutDone";
import Admin from "./pages/Admin";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <CheckoutProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/checkout" element={<CheckoutGuarantee />} />
            <Route path="/checkout/product" element={<CheckoutProduct />} />
            <Route path="/checkout/tag-info" element={<CheckoutTagInfo />} />
            <Route path="/checkout/documents" element={<CheckoutDocuments />} />
            <Route path="/checkout/done" element={<CheckoutDone />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </CheckoutProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
