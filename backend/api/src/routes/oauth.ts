import { Router } from "express";

export const oauthRouter = Router();

type Provider = "google" | "facebook" | "apple";

function providerConfigured(provider: Provider): boolean {
  if (provider === "google") return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (provider === "facebook") return Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
  return Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
}

/**
 * Public capability endpoint for clients. It intentionally exposes only whether a
 * provider has the minimum server-side configuration, never credential values.
 * This is not an OAuth implementation or proof that provider-console settings work.
 */
oauthRouter.get("/providers", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    providers: {
      google: { configured: providerConfigured("google"), enabled: false },
      facebook: { configured: providerConfigured("facebook"), enabled: false },
      apple: { configured: providerConfigured("apple"), enabled: false }
    },
    message: "Social sign-in is not enabled until server-side OAuth handlers and provider callback verification are deployed."
  });
});
