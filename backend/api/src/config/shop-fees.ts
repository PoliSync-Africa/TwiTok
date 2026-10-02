export const TWITOK_SHOP_PLATFORM_FEE_PERCENT = 8;

export function calculateTwiTokShopFee(grossMinor: number) {
  return Math.round(grossMinor * TWITOK_SHOP_PLATFORM_FEE_PERCENT / 100);
}

export function calculateSellerSettlement(grossMinor: number, creatorCommissionMinor = 0, paymentProviderFeeMinor = 0) {
  const shopFeeMinor = calculateTwiTokShopFee(grossMinor);
  return Math.max(0, grossMinor - shopFeeMinor - creatorCommissionMinor - paymentProviderFeeMinor);
}
