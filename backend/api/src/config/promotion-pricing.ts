export const TWITOK_PROMOTION_DISCOUNT = 0.08;

export const TWITOK_VIEW_PACKS = [
  { id: "VIEWS_800", views: 800, benchmarkUsd: 5.00, durationDays: 1 },
  { id: "VIEWS_1600", views: 1600, benchmarkUsd: 10.00, durationDays: 1, recommended: true },
  { id: "VIEWS_3200", views: 3200, benchmarkUsd: 20.06, durationDays: 1 }
] as const;

export function discountedPromotionPrice(benchmarkUsd: number) {
  return Number((benchmarkUsd * (1 - TWITOK_PROMOTION_DISCOUNT)).toFixed(2));
}

export function getViewPack(id: string) {
  return TWITOK_VIEW_PACKS.find(pack => pack.id === id) ?? null;
}
