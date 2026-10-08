"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TWITOK_COUNTRIES, countryFlag, type TwiTokCountry } from "@twitok/types";

type Props = {
  value: string;
  onChange: (alpha2: string) => void;
  ariaLabel?: string;
};

export default function CountryCodePicker({ value, onChange, ariaLabel = "Country and international calling code" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => TWITOK_COUNTRIES.find(country => country.alpha2 === value),
    [value]
  );

  const countries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return TWITOK_COUNTRIES;
    return TWITOK_COUNTRIES.filter(country =>
      [country.name, country.alpha2, country.alpha3, country.dialCode].some(item =>
        item.toLowerCase().includes(normalized)
      )
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} style={styles.root}>
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        style={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span style={styles.triggerFlag}>{selected ? countryFlag(selected.alpha2) : "🌐"}</span>
        <span style={styles.triggerCode}>{selected ? selected.dialCode : "Code"}</span>
        <span style={styles.chevron}>⌄</span>
      </button>

      {open ? (
        <div style={styles.menu} role="listbox" aria-label={ariaLabel}>
          <input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search country or code"
            style={styles.search}
            aria-label="Search countries"
          />
          <div style={styles.list}>
            {countries.map(country => (
              <button
                key={country.alpha2}
                type="button"
                role="option"
                aria-selected={country.alpha2 === value}
                onClick={() => {
                  onChange(country.alpha2);
                  setQuery("");
                  setOpen(false);
                }}
                style={country.alpha2 === value ? { ...styles.option, ...styles.optionActive } : styles.option}
              >
                <span style={styles.flag}>{countryFlag(country.alpha2)}</span>
                <span style={styles.name}>{country.name}</span>
                <span style={styles.code}>{country.dialCode}</span>
              </button>
            ))}
            {!countries.length ? <div style={styles.empty}>No country found</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { position: "relative", minWidth: 0 },
  trigger: { width: "100%", height: 52, display: "grid", gridTemplateColumns: "30px auto 18px", alignItems: "center", gap: 5, border: "0", borderRadius: 14, background: "#181818", color: "#fff", padding: "0 10px", cursor: "pointer", fontSize: 16 },
  triggerFlag: { fontSize: 22, lineHeight: 1 },
  triggerCode: { textAlign: "left", whiteSpace: "nowrap", overflow: "hidden" },
  chevron: { color: "#aaa", fontSize: 20, lineHeight: 1, transform: "translateY(-2px)" },
  menu: { position: "absolute", zIndex: 100, left: 0, top: "calc(100% + 8px)", width: "min(360px, 82vw)", padding: 8, border: "1px solid #3a3a3a", borderRadius: 16, background: "#181818", boxShadow: "0 18px 50px rgba(0,0,0,.65)" },
  search: { width: "100%", boxSizing: "border-box", padding: "12px 13px", border: "1px solid #333", borderRadius: 12, outline: "none", background: "#101010", color: "#fff", fontSize: 15 },
  list: { marginTop: 7, maxHeight: 340, overflowY: "auto" },
  option: { width: "100%", display: "grid", gridTemplateColumns: "34px 1fr auto", alignItems: "center", gap: 9, border: 0, borderRadius: 10, padding: "11px 10px", background: "transparent", color: "#fff", textAlign: "left", cursor: "pointer", fontSize: 15 },
  optionActive: { background: "rgba(37,244,238,.10)" },
  flag: { fontSize: 23, textAlign: "center" },
  name: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  code: { color: "#25f4ee", fontWeight: 800, whiteSpace: "nowrap" },
  empty: { padding: 18, textAlign: "center", color: "#888" }
};
