import { Router } from "express";
import { requireUser } from "../auth";
import { getPaymentRoutes, getSupportedPaymentMethods, getSupportedPayoutMethods } from "../money/payment-routing";

export const paymentRoutingRouter = Router();

paymentRoutingRouter.get("/options", requireUser, async (req, res) => {
  const countryCode = String(req.user?.countryCode || "").toUpperCase();
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
});
