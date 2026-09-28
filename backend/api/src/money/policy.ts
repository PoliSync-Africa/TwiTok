export const PLATFORM_CURRENCY = "USD";
export const CREATOR_SHARE_BPS = 3000;
export const PLATFORM_SHARE_BPS = 7000;

export const MOBILE_MONEY_COUNTRIES = new Set(["GH", "ZA", "KE", "UG", "NG"]);

export function withdrawalMethods(countryCode: string) {
  const country = countryCode.toUpperCase();
  return MOBILE_MONEY_COUNTRIES.has(country)
    ? ["BANK", "MOBILE_MONEY"] as const
    : ["BANK"] as const;
}

export function splitRevenue(amountUsd: number) {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new Error("Revenue amount must be positive");
  const cents = Math.round(amountUsd * 100);
  const platformCents = Math.floor(cents * PLATFORM_SHARE_BPS / 10000);
  const creatorCents = cents - platformCents;
  return { platformUsd: platformCents / 100, creatorUsd: creatorCents / 100 };
}
