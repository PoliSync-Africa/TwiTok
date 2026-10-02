export type CollectionProvider = "PAYSTACK" | "FLUTTERWAVE";

export const FLUTTERWAVE_COLLECTION_COUNTRIES = new Set([
  "GH", "NG", "KE", "UG", "ZA", "RW", "TZ", "MW", "ZM", "CM", "CI", "SN", "EG"
]);

export const PAYSTACK_COLLECTION_COUNTRIES = new Set(["GH", "NG", "KE", "ZA"]);

export const COUNTRY_CURRENCIES: Record<string, string> = {
  GH: "GHS", NG: "NGN", KE: "KES", UG: "UGX", ZA: "ZAR",
  RW: "RWF", TZ: "TZS", MW: "MWK", ZM: "ZMW", CM: "XAF",
  CI: "XOF", SN: "XOF", EG: "EGP", SL: "SLL", BF: "XOF", GN: "GNF",
  GW: "XOF", ML: "XOF", TN: "TND"
};

export function collectionProviders(countryCode: string): CollectionProvider[] {
  const country = countryCode.toUpperCase();
  const providers: CollectionProvider[] = [];
  if (PAYSTACK_COLLECTION_COUNTRIES.has(country)) providers.push("PAYSTACK");
  if (FLUTTERWAVE_COLLECTION_COUNTRIES.has(country)) providers.push("FLUTTERWAVE");
  return providers;
}

export function currencyForCountry(countryCode: string) {
  return COUNTRY_CURRENCIES[countryCode.toUpperCase()] ?? null;
}

export function exchangeRateEnvName(currency: string) {
  return "TWITOK_USD_" + currency.toUpperCase() + "_RATE";
}

export function resolveCollectionProvider(countryCode: string, requested?: string): CollectionProvider {
  const providers = collectionProviders(countryCode);
  if (!providers.length) throw new Error("No Coin collection provider is enabled for this country");
  if (requested) {
    const normalized = requested.toUpperCase() as CollectionProvider;
    if (!providers.includes(normalized)) throw new Error("Requested payment provider is not enabled for this country");
    if (normalized === "FLUTTERWAVE" && !process.env.FLUTTERWAVE_SECRET_KEY) {
      throw new Error("Flutterwave is not configured");
    }
    if (normalized === "PAYSTACK" && !process.env.PAYSTACK_SECRET_KEY) {
      throw new Error("Paystack is not configured");
    }
    return normalized;
  }
  if (providers.includes("PAYSTACK") && process.env.PAYSTACK_SECRET_KEY) return "PAYSTACK";
  if (providers.includes("FLUTTERWAVE") && process.env.FLUTTERWAVE_SECRET_KEY) return "FLUTTERWAVE";
  throw new Error("No configured Coin collection provider is available");
}


export type PayoutProvider = "PAYSTACK" | "FLUTTERWAVE";

export const FLUTTERWAVE_PAYOUT_COUNTRIES = new Set([
  "GH", "NG", "KE", "UG", "ZA", "RW", "TZ", "MW", "ZM", "CM", "CI", "SN", "SL", "BF", "GN", "GW", "ML", "TN"
]);

export function payoutProviders(countryCode: string): PayoutProvider[] {
  const country = countryCode.toUpperCase();
  const providers: PayoutProvider[] = [];
  if (country === "GH" && process.env.PAYSTACK_SECRET_KEY) providers.push("PAYSTACK");
  if (FLUTTERWAVE_PAYOUT_COUNTRIES.has(country) && process.env.FLUTTERWAVE_SECRET_KEY) providers.push("FLUTTERWAVE");
  return providers;
}

export function resolvePayoutProvider(countryCode: string, requested?: string): PayoutProvider {
  const providers = payoutProviders(countryCode);
  if (!providers.length) throw new Error("No configured creator payout provider is available for this country");
  if (requested) {
    const normalized = requested.toUpperCase() as PayoutProvider;
    if (!providers.includes(normalized)) throw new Error("Requested payout provider is not enabled for this country");
    return normalized;
  }
  if (providers.includes("PAYSTACK")) return "PAYSTACK";
  return "FLUTTERWAVE";
}
