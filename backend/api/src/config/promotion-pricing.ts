export const TWITOK_PROMOTION_DISCOUNT = 0.08;

export const TWITOK_VIEW_PACKS = [
  { id: "VIEWS_800", views: 800, benchmarkUsd: 5.00, durationDays: 1 },
  { id: "VIEWS_1600", views: 1600, benchmarkUsd: 10.00, durationDays: 1, recommended: true },
  { id: "VIEWS_3200", views: 3200, benchmarkUsd: 20.06, durationDays: 1 },
  { id: "VIEWS_5000", views: 5000, benchmarkUsd: 31.34, durationDays: 1 },
  { id: "VIEWS_10000", views: 10000, benchmarkUsd: 62.69, durationDays: 1 },
  { id: "VIEWS_50000", views: 50000, benchmarkUsd: 313.44, durationDays: 3 },
  { id: "VIEWS_100000", views: 100000, benchmarkUsd: 626.88, durationDays: 7 },
  { id: "VIEWS_500000", views: 500000, benchmarkUsd: 3134.40, durationDays: 14 },
  { id: "VIEWS_1000000", views: 1000000, benchmarkUsd: 6268.80, durationDays: 30 }
] as const;

export const TWITOK_OBJECTIVES = [
  "MORE_VIEWS",
  "MORE_FOLLOWERS",
  "MORE_PROFILE_VISITS",
  "WEBSITE_TRAFFIC",
  "LIVE_AUDIENCE"
] as const;

export const TWITOK_OBJECTIVE_BUDGET_PACKS = [
  { id: "BUDGET_5", benchmarkUsd: 5.00, durationDays: 1 },
  { id: "BUDGET_10", benchmarkUsd: 10.00, durationDays: 1, recommended: true },
  { id: "BUDGET_20", benchmarkUsd: 20.06, durationDays: 1 },
  { id: "BUDGET_50", benchmarkUsd: 50.00, durationDays: 3 },
  { id: "BUDGET_100", benchmarkUsd: 100.00, durationDays: 7 },
  { id: "BUDGET_500", benchmarkUsd: 500.00, durationDays: 14 },
  { id: "BUDGET_1000", benchmarkUsd: 1000.00, durationDays: 30 }
] as const;

export function discountedPromotionPrice(benchmarkUsd: number) {
  return Number((benchmarkUsd * (1 - TWITOK_PROMOTION_DISCOUNT)).toFixed(2));
}

export function getViewPack(id: string) {
  return TWITOK_VIEW_PACKS.find(pack => pack.id === id) ?? null;
}
