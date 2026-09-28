import Purchases, { type CustomerInfo, type PurchasesPackage } from "@revenuecat/purchases-react-native";
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

export async function getCoinPackages(): Promise<PurchasesPackage[]> {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function purchaseCoinPackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const result = await Purchases.purchasePackage(pkg);
  return result.customerInfo;
}
