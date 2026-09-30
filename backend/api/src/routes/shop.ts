import { Router } from "express";
import { getShopPaymentMethods } from "../config/shop-payments.js";
import { getShopBenchmarkFeatureGroups, TWITOK_SHOP_BENCHMARK_VERSION, TWITOK_SHOP_ORDER_STATUSES, TWITOK_SHOP_PRODUCT_STATUSES, TWITOK_SHOP_ROLES, TWITOK_SHOP_SURFACES } from "../config/shop-benchmark.js";

export const shopRouter = Router();

shopRouter.get("/payment-methods/:countryCode", (req, res) => {
  res.json({ countryCode: String(req.params.countryCode).toUpperCase(), methods: getShopPaymentMethods(req.params.countryCode) });
});

shopRouter.get("/benchmark", (_req, res) => {
  res.json({
    version: TWITOK_SHOP_BENCHMARK_VERSION,
    surfaces: TWITOK_SHOP_SURFACES,
    featureGroups: getShopBenchmarkFeatureGroups(),
    roles: TWITOK_SHOP_ROLES,
    productStatuses: TWITOK_SHOP_PRODUCT_STATUSES,
    orderStatuses: TWITOK_SHOP_ORDER_STATUSES
  });
});
