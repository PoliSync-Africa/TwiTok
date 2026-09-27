import { Router } from "express";
import { adminRouter } from "./admin.js";
import { moneyRouter } from "./money.js";
import { creatorRouter } from "./creator.js";
import { liveRouter } from "./live.js";
import { safetyRouter } from "./safety.js";
import { monetizationRouter } from "./monetization.js";
import { authRouter } from "./auth.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/money", moneyRouter);
apiRouter.use("/creator", creatorRouter);
apiRouter.use("/live", liveRouter);
apiRouter.use("/safety", safetyRouter);
apiRouter.use("/monetization", monetizationRouter);
