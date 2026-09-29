import Purchases, { type CustomerInfo, type PurchasesPackage } from "react-native-purchases";
import { Platform } from "react-native";

let configured = false;

export function configureRevenueCat(appUserId: string) {
  if (configured || !appUserId) return;
  const apiKey = Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  if (!apiKey) return;
  Purchases.configure({ apiKey, appUserID: appUserId });
  configured = true;
}

export const COIN_SKUS = [
  "100_twitok_coins",
  "500_twitok_coins",
  "1000_twitok_coins",
  "5000_twitok_coins",
  "10000_twitok_coins"
] as const;

export async function getCoinPackages(): Promise<PurchasesPackage[]> {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  return packages
    .filter((pkg) => COIN_SKUS.includes(pkg.product.identifier as (typeof COIN_SKUS)[number]))
    .sort((a, b) => COIN_SKUS.indexOf(a.product.identifier as (typeof COIN_SKUS)[number]) - COIN_SKUS.indexOf(b.product.identifier as (typeof COIN_SKUS)[number]));
}

export async function purchaseCoinPackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const result = await Purchases.purchasePackage(pkg);
  return result.customerInfo;
}
