export type ShopPaymentMethodId = "CARD" | "MOBILE_MONEY" | "BANK_TRANSFER" | "USSD" | "CASH_ON_DELIVERY" | "TWITOK_BALANCE";

export const TWITOK_SHOP_PAYMENT_METHODS = [
  { id: "CARD", label: "Card", requiresProvider: true },
  { id: "MOBILE_MONEY", label: "Mobile Money", requiresProvider: true },
  { id: "BANK_TRANSFER", label: "Bank Transfer", requiresProvider: true },
  { id: "USSD", label: "USSD", requiresProvider: true },
  { id: "CASH_ON_DELIVERY", label: "Cash on Delivery", requiresProvider: false },
  { id: "TWITOK_BALANCE", label: "TwiTok Balance", requiresProvider: false }
] as const;

export function getShopPaymentMethods(countryCode: string) {
  const code = String(countryCode || "").toUpperCase();
  const africa = ["GH", "NG", "KE", "UG", "ZA", "RW", "ZM", "TZ", "CM", "CI", "SN", "BJ", "TG"].includes(code);
  return TWITOK_SHOP_PAYMENT_METHODS.filter((method) => {
    if (method.id === "CASH_ON_DELIVERY") return ["GH", "NG", "KE", "UG", "TZ", "ZA"].includes(code);
    if (method.id === "MOBILE_MONEY" || method.id === "USSD" || method.id === "BANK_TRANSFER") return africa;
    return true;
  });
}
