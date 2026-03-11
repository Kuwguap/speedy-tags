import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

declare const google: any;

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  error?: boolean;
}

const DEBOUNCE_MS = 300;

let placesScriptPromise: Promise<void> | null = null;

function loadGooglePlacesScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (placesScriptPromise) return placesScriptPromise;
  if ((window as any).google?.maps?.places) return Promise.resolve();

  placesScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-places="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Places")));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googlePlaces = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Places"));
    document.head.appendChild(script);
  });
  return placesScriptPromise;
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Start typing address...",
  id,
  className,
  error,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const placesServiceRef = useRef<any | null>(null);

  const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
  const hasApiKey = typeof apiKey === "string" && apiKey.trim().length > 0;

  const ensureService = useCallback(async () => {
    if (!hasApiKey) return null;
    if (placesServiceRef.current) return placesServiceRef.current;
    await loadGooglePlacesScript(apiKey!);
    if (!(window as any).google?.maps?.places) return null;
    placesServiceRef.current = new google.maps.places.AutocompleteService();
    return placesServiceRef.current;
  }, [apiKey, hasApiKey]);

  const search = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (q.length < 3 || !hasApiKey) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const service = await ensureService();
        if (!service) {
          setSuggestions([]);
          setOpen(false);
          return;
        }
        service.getPlacePredictions(
          {
            input: q,
            types: ["address"],
            componentRestrictions: { country: "us" },
          },
          (predictions: any[], status: string) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
              setSuggestions([]);
              setOpen(false);
              setLoading(false);
              return;
            }
            const list = predictions
              .map((p) => p.description as string)
              .filter(Boolean)
              .slice(0, 5);
            setSuggestions(list);
            setOpen(list.length > 0);
            setLoading(false);
          },
        );
      } catch {
        setSuggestions([]);
        setOpen(false);
        setLoading(false);
      }
    },
    [ensureService, hasApiKey],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!hasApiKey || v.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => search(v), DEBOUNCE_MS);
  };

  const handleSelect = (s: string) => {
    onChange(s);
    setSuggestions([]);
    setOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        id={id}
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={handleInputChange}
        onFocus={() => value.trim().length >= 3 && suggestions.length > 0 && setOpen(true)}
        className={cn(error && "border-destructive", className)}
      />
      {open && (suggestions.length > 0 || loading) && (
        <ul
          className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md"
          role="listbox"
        >
          {loading && suggestions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Searching...</li>
          ) : (
            suggestions.map((s, i) => (
              <li
                key={`${s}-${i}`}
                role="option"
                tabIndex={0}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                onMouseDown={() => handleSelect(s)}
                onKeyDown={(e) => e.key === "Enter" && handleSelect(s)}
              >
                {s}
              </li>
            ))
          )}
        </ul>
      )}
      {!hasApiKey && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          (Admin note: set <code>VITE_GOOGLE_PLACES_API_KEY</code> for address suggestions)
        </p>
      )}
    </div>
  );
}
