import { Router } from "express";
import { adminRouter } from "./admin.js";

export const apiRouter = Router();

apiRouter.use("/admin", adminRouter);
