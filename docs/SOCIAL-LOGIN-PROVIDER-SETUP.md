# TwiTok social sign-in: provider setup and implementation gate

TwiTok uses its own Express API and MongoDB user store. Do not replace this with Supabase or a Lovable-managed database.

## Current verified behavior

- Email/phone/username and password sign-in use `POST /api/v1/auth/login`.
- Registration uses `POST /api/v1/auth/register`.
- Google, Apple, and Facebook buttons on the web login and registration pages are currently placeholders. They show a message instead of starting OAuth.
- There are no confirmed provider callback routes in the current auth router. Do not describe social sign-in as enabled until the end-to-end flow has been configured and tested.

## Required provider configuration

Create OAuth applications in the provider consoles and register exact HTTPS redirect URIs pointing to the deployed API. Use the actual production API hostname, not the web app hostname.

Suggested callback paths to implement in the API:
- `/api/v1/auth/oauth/google/callback`
- `/api/v1/auth/oauth/facebook/callback`
- `/api/v1/auth/oauth/apple/callback`

The corresponding authorization-start paths can be:
- `GET /api/v1/auth/oauth/google`
- `GET /api/v1/auth/oauth/facebook`
- `GET /api/v1/auth/oauth/apple`

Do not publish or guess the callback URLs in provider consoles until the API hostname and routes are confirmed.

### Environment variables (store only in Render/API secrets)

- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Facebook: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- Apple: `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`
- Shared: `TWITOK_OAUTH_CALLBACK_BASE_URL`, `TWITOK_WEB_ORIGIN`

Never put provider secrets in the Next.js `NEXT_PUBLIC_*` environment, source code, mobile bundle, or a chat message.

## Security and account rules for implementation

1. Use cryptographically random OAuth `state` and validate it on callback; use OIDC `nonce` and validate the ID token for Google/Apple.
2. Validate provider tokens/signatures server-side and verify issuer, audience, expiry, and (where available) email verification.
3. Store provider subject IDs in a dedicated provider-identity collection or a controlled `authProviders` field with a unique compound index. Never use display names as identifiers.
4. Do not automatically merge a provider identity into an existing email/password account based only on a matching email. Require the user to authenticate the existing account before linking.
5. Create or find the TwiTok account in MongoDB, issue the existing TwiTok session token via `issueUserToken`, and set the existing HTTP-only `twitok_user_session` cookie. Preserve the current user schema and session-version behavior.
6. Redirect only to an allow-listed local web path; reject arbitrary return URLs.
7. Add rate limits, failure logging without tokens/secrets, tests for state mismatch/replay/invalid tokens, and a graceful “provider not configured” response.

## Acceptance tests before calling this live

- Each provider completes consent and returns to the configured API callback.
- New user can complete profile setup; existing provider identity can sign in.
- Provider identity collision, unverified email, denied consent, expired token, state mismatch, and cancelled login are handled safely.
- API creates a valid TwiTok session accepted by `/api/v1/auth/me`.
- No secrets are present in client bundles or logs.
- API build, web build, automated auth tests, and a production smoke test pass.

## Important limitation

The presence of Google/Facebook/Apple buttons in the UI is not proof that the providers are configured. Provider applications, approved redirect URIs, server-side credentials, and end-to-end verification are required. This document is a setup/acceptance plan, not a claim that OAuth is already implemented or deployed.
