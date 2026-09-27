import express from "express";
import cors from "cors";
import helmet from "helmet";
import { getDb } from "./db/mongo.js";
import { apiRouter } from "./routes/index.js";
import { ensureOwnerAccount } from "./auth/owner.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(helmet());
app.use(cors({
  origin: process.env.ADMIN_WEB_ORIGIN?.split(",").map((origin) => origin.trim()) ?? true,
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({
    service: "twitok-api",
    status: "ok",
    platform: "TwiTok",
    version: "0.1.0"
  });
});

app.use("/api/v1", apiRouter);

async function start() {
  if (process.env.MONGODB_URI) {
    const db = await getDb();
    await ensureOwnerAccount(db);
  } else {
    console.warn("MONGODB_URI is not configured. Database features are disabled.");
  }

  app.listen(port, () => {
    console.log(`TwiTok API listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error("TwiTok API failed to start", error);
  process.exit(1);
});
