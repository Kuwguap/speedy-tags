import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Wallet, Share2, ExternalLink } from "lucide-react";

const PAYMENT_OPTIONS = [
  { id: "venmo" as const, label: "Venmo" },
  { id: "cashApp" as const, label: "Cash App" },
  { id: "paypal" as const, label: "PayPal" },
  { id: "zelle" as const, label: "Zelle" },
  { id: "applePay" as const, label: "Apple Pay" },
];

export default function Payments() {
  const [logoError, setLogoError] = useState(false);
  const [applePayCopied, setApplePayCopied] = useState(false);
  const [data, setData] = useState<{
    venmo: string;
    cashApp: string;
    paypal: string;
    zelle: string;
    applePay: string;
    bitcoin?: string;
    display: { venmo: string; cashApp: string; paypal: string; zelle: string; applePay: string; bitcoin?: string };
  } | null>(null);

  useEffect(() => {
    api.getPaymentLinks().then(setData).catch(() => setData(null));
  }, []);

  const handleShare = () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({
        title: "Tri State Tags",
        text: "Pay Tri State Tags",
        url: window.location.href,
      }).catch(() => {});
    }
  };

  const normalizePaymentHref = (href: string) => {
    const value = href.trim();
    if (!value) return "";
    const cleaned = value.replace(/^https?:\/\/tristatetag\.com\//i, "");
    if (/^paypal\.me\//i.test(cleaned)) return `https://${cleaned}`;
    if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
    return `https://${cleaned.replace(/^\/+/, "")}`;
  };

  const copyApplePay = () => {
    navigator.clipboard.writeText("5513740027").then(() => {
      setApplePayCopied(true);
      setTimeout(() => setApplePayCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center py-8 px-4 border-x border-teal-100/80 max-w-lg mx-auto">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Top icons */}
        <div className="w-full flex justify-between items-center mb-6">
          <button
            type="button"
            className="w-10 h-10 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-teal-600"
            aria-label="Wallet"
          >
            <Wallet className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="w-10 h-10 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-500"
            aria-label="Share"
          >
            <Share2 className="h-5 w-5" />
          </button>
        </div>

        {/* Logo (add temp.png to public for the car/tag image) */}
        {logoError ? (
          <div className="w-24 h-24 rounded-full border-2 border-teal-200 bg-teal-50 flex items-center justify-center text-teal-700 font-bold text-xl mb-4">
            TS
          </div>
        ) : (
          <img
            src="/temp.png"
            alt="Tri State Tags"
            className="w-24 h-24 rounded-full object-cover border-2 border-teal-100 mb-4 bg-teal-50"
            onError={() => setLogoError(true)}
          />
        )}

        {/* Branding */}
        <h1 className="text-2xl font-bold text-[#0d5c4a] tracking-tight">
          Tri State Tags
        </h1>
        <p className="text-sm text-gray-500 mt-1">@tristatetags</p>

        {/* Section heading */}
        <p className="text-gray-600 font-medium mt-8 mb-4 w-full text-center">
          Choose your preferred payment method
        </p>

        {/* Payment buttons */}
        <div className="w-full space-y-3">
          {!data ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              Loading…
            </div>
          ) : (
            PAYMENT_OPTIONS.map(({ id, label }) => {
              const rawHref = data[id];
              const href = rawHref ? normalizePaymentHref(rawHref) : "";
              const displayText = id === "applePay"
                ? "5513740027"
                : data.display?.[id];

              const paymentImages: Record<string, string> = {
                venmo: "/Venmo.png",
                cashApp: "/cashapp.png",
                paypal: "/paypal.png",
                zelle: "/zelle.png",
                applePay: "/applepay.png",
              };
              const imgSrc = paymentImages[id];

              if (id === "applePay") {
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={copyApplePay}
                    className="w-full rounded-2xl border border-gray-200 bg-white shadow-sm hover:border-teal-200 hover:shadow transition-all overflow-hidden flex items-center gap-4 py-4 px-5 text-left"
                  >
                    <img
                      src={imgSrc}
                      alt=""
                      className="w-12 h-12 rounded-xl object-contain shrink-0 bg-transparent"
                    />
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="font-medium text-gray-800">{label}</span>
                      <span className="text-sm text-gray-500 font-mono truncate">{displayText}</span>
                      {applePayCopied ? <span className="text-xs text-teal-600 font-medium">Copied!</span> : null}
                    </div>
                    <ExternalLink className="h-4 w-4 text-gray-400 shrink-0" />
                  </button>
                );
              }

              if (!href) return null;
              return (
                <div key={id} className="rounded-2xl border border-gray-200 bg-white shadow-sm hover:border-teal-200 hover:shadow transition-all overflow-hidden">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 w-full py-4 px-5 text-left"
                  >
                    <img
                      src={imgSrc}
                      alt=""
                      className="w-12 h-12 rounded-xl object-contain shrink-0 bg-transparent"
                    />
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="font-medium text-gray-800">{label}</span>
                      {displayText ? (
                        <span className="text-sm text-gray-500 font-mono truncate">{displayText}</span>
                      ) : null}
                    </div>
                    <ExternalLink className="h-4 w-4 text-gray-400 shrink-0" />
                  </a>
                </div>
              );
            })
          )}
        </div>

        <p className="text-xs text-gray-400 mt-8 text-center">
          Opens app or site ready to enter amount and send
        </p>
      </div>
    </div>
  );
}
