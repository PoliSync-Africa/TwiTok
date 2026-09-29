import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { getPaymentRoutes, getSupportedPaymentMethods, getSupportedPayoutMethods } from "../money/payment-routing.js";

export const paymentRoutingRouter = Router();

paymentRoutingRouter.get("/options", requireUser, async (req, res) => {
  try {
    const user = await (await getDb()).collection("users").findOne(
      { _id: req.userId! },
      { projection: { countryCode: 1 } }
    );
    const countryCode = String(user?.countryCode ?? "").toUpperCase();
    const routes = getPaymentRoutes(countryCode);

    return res.json({
      countryCode,
      providers: routes.map((route) => ({
        provider: route.provider,
        currency: route.currency,
        collectionMethods: route.collectionMethods,
        payoutMethods: route.payoutMethods,
      })),
      collectionMethods: getSupportedPaymentMethods(countryCode),
      payoutMethods: getSupportedPayoutMethods(countryCode),
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Payment options lookup failed",
    });
  }
});
