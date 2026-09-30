import { Router } from "express";
import { getShopBenchmarkFeatureGroups, TWITOK_SHOP_BENCHMARK_VERSION } from "../config/shop-benchmark.js";

export const shopRouter = Router();

shopRouter.get("/benchmark", (_req, res) => {
  res.json({
    version: TWITOK_SHOP_BENCHMARK_VERSION,
    featureGroups: getShopBenchmarkFeatureGroups()
  });
});
