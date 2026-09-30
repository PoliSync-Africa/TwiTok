import { Router } from "express";
import { rateLimit as expressRateLimit } from "express-rate-limit";
import { adminRouter } from "./admin.js";
import { moneyRouter } from "./money.js";
import { creatorRouter } from "./creator.js";
import { liveRouter } from "./live.js";
import { safetyRouter } from "./safety.js";
import { monetizationRouter } from "./monetization.js";
import { authRouter } from "./auth.js";
import { profileRouter } from "./profile.js";
import { videoRouter } from "./video.js";
import { feedRouter } from "./feed.js";
import { mediaRouter } from "./media.js";
import musicRouter from "./music.js";
import { messagesRouter } from "./messages.js";
import { engagementRouter } from "./engagement.js";
import { notificationsRouter } from "./notifications.js";
import { searchRouter } from "./search.js";
import { playlistsRouter } from "./playlists.js";
import { storiesRouter } from "./stories.js";
import { promotionsRouter } from "./promotions.js";
import { walletRouter } from "./wallet.js";
import { paymentRoutingRouter } from "./payment-routing.js";
import { analyticsRouter } from "./analytics.js";
import { verificationRouter } from "./verification.js";
import { aiMediaRouter } from "./ai-media.js";
import { shopRouter } from "./shop.js";
import { shopCommerceRouter } from "./shop-commerce.js";
import { shopOrdersRouter } from "./shop-orders.js";
import { shopPaymentsRouter } from "./shop-payments.js";
import { shopSellerRouter } from "./shop-seller.js";
import { shopReturnsRouter } from "./shop-returns.js";
import { shopFinanceRouter } from "./shop-finance.js";
import { shopAffiliateRouter } from "./shop-affiliate.js";

export const apiRouter = Router();

// CodeQL-recognized global API guard. Individual sensitive routes may also
// apply stricter per-user limits for expensive or abuse-prone operations.
apiRouter.use(expressRateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false
}));

apiRouter.use("/auth", authRouter);
apiRouter.use("/profile", profileRouter);
apiRouter.use("/video", videoRouter);
apiRouter.use("/feed", feedRouter);
apiRouter.use("/media", mediaRouter);
apiRouter.use("/music", musicRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/money", moneyRouter);
apiRouter.use("/creator", creatorRouter);
apiRouter.use("/live", liveRouter);
apiRouter.use("/safety", safetyRouter);
apiRouter.use("/monetization", monetizationRouter);
apiRouter.use("/messages", messagesRouter);
apiRouter.use("/engagement", engagementRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/search", searchRouter);
apiRouter.use("/playlists", playlistsRouter);
apiRouter.use("/stories", storiesRouter);
apiRouter.use("/promotions", promotionsRouter);
apiRouter.use("/wallet", walletRouter);
apiRouter.use("/payments", paymentRoutingRouter);
apiRouter.use("/analytics", analyticsRouter);
apiRouter.use("/verification", verificationRouter);
apiRouter.use("/ai-media", aiMediaRouter);
apiRouter.use("/shop", shopRouter);
apiRouter.use("/shop/commerce", shopCommerceRouter);
apiRouter.use("/shop", shopOrdersRouter);
apiRouter.use("/shop", shopPaymentsRouter);
apiRouter.use("/shop", shopSellerRouter);
apiRouter.use("/shop", shopReturnsRouter);
apiRouter.use("/shop", shopFinanceRouter);
apiRouter.use("/shop", shopAffiliateRouter);
