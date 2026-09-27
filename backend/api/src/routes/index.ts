import { Router } from "express";
import { adminRouter } from "./admin.js";
import { moneyRouter } from "./money.js";

export const apiRouter = Router();

apiRouter.use("/admin", adminRouter);
apiRouter.use("/money", moneyRouter);
