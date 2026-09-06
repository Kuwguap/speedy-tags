import { useEffect, useState } from "react";
import { getConfig, type PublicConfig } from "../lib/api";
import TagForm from "../components/TagForm";

export default function Checkout() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const canceled = new URLSearchParams(window.location.search).get("canceled");

  useEffect(() => {
    getConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-8 max-w-xl animate-riseIn">
        <span className="eyebrow">Checkout</span>
        <h1 className="mt-3 font-display text-3xl font-700 tracking-tight text-ink sm:text-4xl">
          Let's build your tag.
        </h1>
        <p className="mt-2 text-slate">
          Fill in the vehicle and owner details. You'll pay securely on the next screen.
        </p>
      </div>

      {canceled && (
        <p className="mb-6 rounded-lg border border-issued/40 bg-issued/10 px-4 py-3 text-sm text-issued-deep">
          Payment canceled — your details are still here. Continue whenever you're ready.
        </p>
      )}

      <TagForm config={config} />
    </div>
  );
}
