import { TWITOK_COUNTRIES } from "@twitok/types";

export const COUNTRY_DIAL_CODES: Record<string, string> = Object.fromEntries(
  TWITOK_COUNTRIES.map(country => [country.alpha2, country.dialCode])
);

export function normalizeInternationalPhone(value: unknown, country?: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const cleaned = raw.replace(/[\\s().-]/g, "");
  const iso = String(country ?? "").trim().toUpperCase();
  const dial = COUNTRY_DIAL_CODES[iso];
  const withCode = cleaned.startsWith("+") ? cleaned : dial ? dial + cleaned.replace(/^0+/, "") : cleaned;
  if (!/^\\+[0-9]{7,15}$/.test(withCode)) throw new Error("Enter a valid international phone number");
  return withCode;
}

export function countryDialCode(country?: string) {
  return COUNTRY_DIAL_CODES[String(country ?? "").trim().toUpperCase()] ?? "";
}
