export type PaymentMethod = "BANK" | "MOBILE_MONEY" | "CARD" | "USSD" | "TRANSFER" | "OTHER";

export type PaymentProviderId = "PAYSTACK" | "FLUTTERWAVE";

export type PaymentRoute = {
  provider: PaymentProviderId;
  countryCode: string;
  currency: string;
  collectionMethods: PaymentMethod[];
  payoutMethods: PaymentMethod[];
};

const AFRICA_CURRENCIES: Record<string, string> = {
  GH: "GHS", NG: "NGN", KE: "KES", UG: "UGX", ZA: "ZAR", RW: "RWF",
  TZ: "TZS", ZM: "ZMW", CM: "XAF", CI: "XOF", SN: "XOF", BJ: "XOF",
  TG: "XOF", BF: "XOF", ML: "XOF", NE: "XOF", GN: "GNF", SL: "SLE",
  LR: "LRD", MW: "MWK", MZ: "MZN", ET: "ETB",
};

const PAYSTACK_COUNTRIES = new Set(["GH", "NG", "KE", "ZA"]);

const FLUTTERWAVE_COUNTRIES = new Set([
  "NG", "GH", "KE", "UG", "ZA", "RW", "ZM", "TZ", "CM", "CI", "SN", "BJ", "TG",
]);

export function normalizeCountryCode(countryCode?: string): string {
  return String(countryCode || "").trim().toUpperCase();
}

export function getCountryCurrency(countryCode: string): string | null {
  return AFRICA_CURRENCIES[normalizeCountryCode(countryCode)] ?? null;
}

export function getPaymentRoutes(countryCode: string): PaymentRoute[] {
  const code = normalizeCountryCode(countryCode);
  const currency = getCountryCurrency(code);
  if (!currency) return [];

  const routes: PaymentRoute[] = [];

  if (PAYSTACK_COUNTRIES.has(code)) {
    routes.push({
      provider: "PAYSTACK",
      countryCode: code,
      currency,
      collectionMethods: ["CARD", "BANK", "MOBILE_MONEY", "USSD", "TRANSFER"],
      payoutMethods: ["BANK", "MOBILE_MONEY"],
    });
  }

  if (FLUTTERWAVE_COUNTRIES.has(code)) {
    routes.push({
      provider: "FLUTTERWAVE",
      countryCode: code,
      currency,
      collectionMethods: ["CARD", "BANK", "MOBILE_MONEY", "USSD", "TRANSFER"],
      payoutMethods: ["BANK", "MOBILE_MONEY"],
    });
  }

  return routes;
}

export function getSupportedPaymentMethods(countryCode: string): PaymentMethod[] {
  const methods = new Set<PaymentMethod>();
  for (const route of getPaymentRoutes(countryCode)) {
    route.collectionMethods.forEach((method) => methods.add(method));
  }
  return [...methods];
}

export function getSupportedPayoutMethods(countryCode: string): PaymentMethod[] {
  const methods = new Set<PaymentMethod>();
  for (const route of getPaymentRoutes(countryCode)) {
    route.payoutMethods.forEach((method) => methods.add(method));
  }
  return [...methods];
}
