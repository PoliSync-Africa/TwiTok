export const TWITOK_PROMOTION_DISCOUNT = 0.08;

export const TWITOK_DURATION_OPTIONS = [
  { days: 1, priceIncreasePercent: 0, audienceIncreasePercent: 0 },
  { days: 7, priceIncreasePercent: 80, audienceIncreasePercent: 30 },
  { days: 14, priceIncreasePercent: 75, audienceIncreasePercent: 35 },
  { days: 30, priceIncreasePercent: 70, audienceIncreasePercent: 37 },
  { days: 60, priceIncreasePercent: 60, audienceIncreasePercent: 40 }
] as const;

export const TWITOK_DEFAULT_DURATION_DAYS = 1;

export function getDurationOption(days: number) {
  return TWITOK_DURATION_OPTIONS.find(option => option.days === days) ?? TWITOK_DURATION_OPTIONS[0];
}

export function durationAdjustedPrice(benchmarkUsd: number, days: number) {
  const option = getDurationOption(days);
  return Number((benchmarkUsd * (1 + option.priceIncreasePercent / 100)).toFixed(2));
}

export function durationAdjustedAudience(baseAudience: number, days: number) {
  const option = getDurationOption(days);
  return Math.round(baseAudience * (1 + option.audienceIncreasePercent / 100));
}

export const TWITOK_VIEW_PACKS = [
  { id: "VIEWS_800", views: 800, benchmarkUsd: 5.00 },
  { id: "VIEWS_1600", views: 1600, benchmarkUsd: 10.00, recommended: true },
  { id: "VIEWS_3200", views: 3200, benchmarkUsd: 20.06 },
  { id: "VIEWS_5000", views: 5000, benchmarkUsd: 31.34 },
  { id: "VIEWS_10000", views: 10000, benchmarkUsd: 62.69 },
  { id: "VIEWS_50000", views: 50000, benchmarkUsd: 313.44 },
  { id: "VIEWS_100000", views: 100000, benchmarkUsd: 626.88 },
  { id: "VIEWS_500000", views: 500000, benchmarkUsd: 3134.40 },
  { id: "VIEWS_1000000", views: 1000000, benchmarkUsd: 6268.80 }
] as const;

export const TWITOK_OBJECTIVES = [
  "MORE_VIEWS",
  "MORE_FOLLOWERS",
  "MORE_PROFILE_VISITS",
  "WEBSITE_TRAFFIC",
  "LIVE_AUDIENCE"
] as const;

export const TWITOK_PARTNERSHIP_PACKS = [
  { id: "PARTNERSHIP_STARTER", benchmarkUsd: 25, durationDays: 7, deliverables: "1 sponsored post + campaign distribution" },
  { id: "PARTNERSHIP_GROWTH", benchmarkUsd: 100, durationDays: 14, deliverables: "3 sponsored posts + campaign distribution", recommended: true },
  { id: "PARTNERSHIP_PRO", benchmarkUsd: 500, durationDays: 30, deliverables: "10 sponsored posts + campaign distribution" },
  { id: "PARTNERSHIP_BRAND", benchmarkUsd: 1000, durationDays: 30, deliverables: "20 sponsored posts + campaign distribution" }
] as const;

export const TWITOK_SUBSCRIBER_REACH_PACKS = [
  { id: "SUBSCRIBER_1000", audience: 1000, benchmarkUsd: 10 },
  { id: "SUBSCRIBER_5000", audience: 5000, benchmarkUsd: 40 },
  { id: "SUBSCRIBER_10000", audience: 10000, benchmarkUsd: 75, recommended: true },
  { id: "SUBSCRIBER_50000", audience: 50000, benchmarkUsd: 350 },
  { id: "SUBSCRIBER_100000", audience: 100000, benchmarkUsd: 650 }
] as const;

export const TWITOK_OBJECTIVE_BUDGET_PACKS = [
  { id: "BUDGET_5", benchmarkUsd: 5.00 },
  { id: "BUDGET_10", benchmarkUsd: 10.00, recommended: true },
  { id: "BUDGET_20", benchmarkUsd: 20.06 },
  { id: "BUDGET_50", benchmarkUsd: 50.00 },
  { id: "BUDGET_100", benchmarkUsd: 100.00 },
  { id: "BUDGET_500", benchmarkUsd: 500.00 },
  { id: "BUDGET_1000", benchmarkUsd: 1000.00 }
] as const;

export function discountedPromotionPrice(benchmarkUsd: number) {
  return Number((benchmarkUsd * (1 - TWITOK_PROMOTION_DISCOUNT)).toFixed(2));
}

export function getViewPack(id: string) {
  return TWITOK_VIEW_PACKS.find(pack => pack.id === id) ?? null;
}
