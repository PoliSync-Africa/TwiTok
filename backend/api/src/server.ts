import express from "express";
import cors from "cors";
import helmet from "helmet";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({
    service: "twitok-api",
    status: "ok",
    platform: "TwiTok",
    version: "0.1.0"
  });
});

app.get("/api/v1/platform", (_req, res) => {
  res.json({
    name: "TwiTok",
    tagline: "Africa's Video Platform",
    ownerControlPlane: true,
    ordinaryUserIsOwner: false
  });
});

app.listen(port, () => {
  console.log(`TwiTok API listening on port ${port}`);
});
