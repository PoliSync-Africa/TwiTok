import { Db } from "mongodb";

export const MONETIZATION_PROGRAMS = [
  "CREATOR_REWARDS",
  "LIVE_GIFTS",
  "VIDEO_GIFTS",
  "SUBSCRIPTIONS",
  "PREMIUM_SERIES",
  "CREATOR_MARKETPLACE",
  "AFFILIATE_COMMERCE",
  "AD_REVENUE"
] as const;

export async function initializeMonetizationIndexes(db: Db) {
  await Promise.all([
    db.collection("monetization_programs").createIndex({ program: 1 }, { unique: true }),
    db.collection("monetization_eligibility").createIndex({ userId: 1, program: 1 }, { unique: true }),
    db.collection("monetization_events").createIndex({ userId: 1, createdAt: -1 })
  ]);
}

export function evaluateEligibility(input: {
  age: number;
  countryCode: string;
  accountInGoodStanding: boolean;
  verifiedIdentity: boolean;
  followers?: number;
  publicPosts30d?: number;
  views30d?: number;
}) {
  const age = Number(input.age);
  const followers = Number(input.followers ?? 0);
  const posts = Number(input.publicPosts30d ?? 0);
  const views = Number(input.views30d ?? 0);
  const good = input.accountInGoodStanding;
  const identity = input.verifiedIdentity;

  return {
    CREATOR_REWARDS: age >= 18 && good && identity && followers >= 10000 && posts >= 3 && views >= 100000,
    LIVE_GIFTS: age >= 18 && good && identity,
    VIDEO_GIFTS: age >= 18 && good && identity && followers >= 10000 && posts >= 1,
    SUBSCRIPTIONS: age >= 18 && good && identity,
    PREMIUM_SERIES: age >= 18 && good && identity,
    CREATOR_MARKETPLACE: age >= 18 && good && identity && followers >= 1000,
    AFFILIATE_COMMERCE: age >= 18 && good && identity,
    AD_REVENUE: age >= 18 && good && identity
  };
}

export async function getEligibility(db: Db, userId: string) {
  return db.collection("monetization_eligibility").find({ userId }).toArray();
}