import { collectionProviders, currencyForCountry } from "../money/providers/routing.js";

export type ShopPaymentMethodId =
  | "CARD"
  | "MOBILE_MONEY"
  | "BANK_TRANSFER"
  | "USSD";

export const TWITOK_DEFAULT_SHOP_PAYMENT_METHODS = [
  { id: "CARD", label: "Card" },
  { id: "MOBILE_MONEY", label: "Mobile Money" },
  { id: "BANK_TRANSFER", label: "Bank Transfer" },
  { id: "USSD", label: "USSD" }
] as const;

export function getShopPaymentMethods(countryCode: string) {
  const code = String(countryCode || "").toUpperCase();
  const providers = collectionProviders(code);
  const currency = currencyForCountry(code);

  return {
    countryCode: code,
    currency,
    providers,
    methods: TWITOK_DEFAULT_SHOP_PAYMENT_METHODS.filter((method) => {
      if (method.id === "MOBILE_MONEY" || method.id === "USSD") {
        return providers.length > 0;
      }
      return providers.length > 0;
    })
  };
}
