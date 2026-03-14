import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Wallet, Share2, ExternalLink, Copy } from "lucide-react";

const PAYMENT_OPTIONS = [
  { id: "venmo" as const, label: "Venmo" },
  { id: "cashApp" as const, label: "Cash App" },
  { id: "paypal" as const, label: "PayPal" },
  { id: "zelle" as const, label: "Zelle" },
  { id: "bitcoin" as const, label: "Bitcoin" },
];

export default function Payments() {
  const [logoError, setLogoError] = useState(false);
  const [data, setData] = useState<{
    venmo: string;
    cashApp: string;
    paypal: string;
    zelle: string;
    bitcoin: string;
    display: { venmo: string; cashApp: string; paypal: string; zelle: string; bitcoin: string };
  } | null>(null);
  const [bitcoinCopied, setBitcoinCopied] = useState(false);

  useEffect(() => {
    api.getPaymentLinks().then(setData).catch(() => setData(null));
  }, []);

  const copyBitcoinAddress = useCallback((href: string) => {
    const address = href.replace(/^bitcoin:/i, "").split("?")[0].trim();
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => {
      setBitcoinCopied(true);
      setTimeout(() => setBitcoinCopied(false), 2000);
    }).catch(() => {});
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
              const href = data[id];
              if (!href) return null;
              const isBitcoin = id === "bitcoin" && href.startsWith("bitcoin:");
              const displayText = data.display?.[id];

              if (isBitcoin) {
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => copyBitcoinAddress(href)}
                    className="w-full rounded-2xl border border-gray-200 bg-white shadow-sm hover:border-teal-200 hover:shadow transition-all overflow-hidden flex items-center justify-between py-4 px-5 text-left cursor-pointer"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-gray-800">{label}</span>
                      {displayText ? (
                        <span className="text-sm text-gray-500 font-mono">{displayText}</span>
                      ) : null}
                      {bitcoinCopied ? (
                        <span className="text-xs text-teal-600 font-medium mt-1">Copied!</span>
                      ) : null}
                    </div>
                    <Copy className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />
                  </button>
                );
              }

              return (
                <div key={id} className="rounded-2xl border border-gray-200 bg-white shadow-sm hover:border-teal-200 hover:shadow transition-all overflow-hidden">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between w-full py-4 px-5 text-left"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-gray-800">{label}</span>
                      {displayText ? (
                        <span className="text-sm text-gray-500 font-mono">{displayText}</span>
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
