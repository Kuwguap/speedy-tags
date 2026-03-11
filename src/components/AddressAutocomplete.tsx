import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  error?: boolean;
}

const DEBOUNCE_MS = 500;
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

async function fetchAddressSuggestions(query: string): Promise<string[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({
    format: "json",
    addressdetails: "1",
    limit: "5",
    countrycodes: "us",
    q,
  });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { "Accept-Language": "en", "User-Agent": "TriStateTags/1.0 (address-autocomplete)" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data as { display_name?: string }[])
    .map((r) => r.display_name)
    .filter(Boolean)
    .slice(0, 5);
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

  const search = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const results = await fetchAddressSuggestions(q);
      setSuggestions(results);
      setOpen(results.length > 0);
    } catch {
      setSuggestions([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 3) {
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
    </div>
  );
}
