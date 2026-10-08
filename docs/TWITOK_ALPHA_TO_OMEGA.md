# TwiTok — Alpha-to-Omega Product & Architecture Parity

## Objective

TwiTok is being evolved into a global short-video social platform with **functional parity** across the major TikTok product surfaces. This means equivalent user outcomes and workflows, not copying TikTok source code, proprietary ranking weights, or private implementation details.

The architecture is modular, MongoDB-first, event-driven where appropriate, and designed so every product surface has:
1. a UI entry point,
2. an API contract,
3. a MongoDB domain model/index,
4. authorization and safety policy,
5. realtime events where needed,
6. analytics/observability,
7. admin controls,
8. graceful degradation when an optional provider is unavailable.

## Canonical product domains

| Domain | Target capability | TwiTok architecture |
|---|---|---|
| Identity | Sign up, login, logout, profile setup | `auth/*`, `routes/auth.ts` |
| Account security | Sessions, revocation, password security, OTP, recovery, device controls | `auth/*`, `security/*` |
| Profile | Username, nickname, bio, avatar, privacy, verification | `profile/*`, `verification/*` |
| Social graph | Follow, unfollow, followers/following, blocks, mutes | `social/follows.ts`, `safety/*` |
| Feed | For You, Following, discovery, not interested, feed tuning | `feed/*` |
| Search | People, videos, hashtags, sounds, suggested searches | `search/*` |
| Creation | Camera, gallery, photo mode, video, text, LIVE entry | `video/*`, web composer |
| Editing | Trim, clips, speed, effects, stickers, overlays, captions, sound | `video/*`, `ai-media/*` |
| Media pipeline | Upload sessions, validation, processing, thumbnails, playback | `media/*`, `video/processing.ts` |
| Stories | 24-hour photo/video stories and replies | `social/stories.ts` |
| LIVE | Host, guests/co-hosts, moderators, chat, gifts, replay | `live/*`, realtime WS |
| Engagement | Like, comment, repost, save, share, mentions | `social/engagement.ts` |
| Messaging | DMs, delivery/read state, voice messages, blocks | `social/messaging.ts` |
| Notifications | Social, security, creator, system notifications | `social/notifications.ts` |
| Playlists | Creator video playlists/series | `social/playlists.ts` |
| Creator Studio | Content management, analytics, comments, monetization | `creator/*`, `analytics/*` |
| Monetization | Coins, gifts, subscriptions, rewards, marketplace, payouts | `money/*`, `monetization/*` |
| Promotions | Boost/promote workflows and billing | `promotions/*` |
| Safety | Reports, moderation, blocks, restricted content, age policy | `safety/*` |
| Admin | Users, content, reports, announcements, staff roles, audit | `routes/admin*` |
| Verification | Application/review/status/badges | `verification/*` |
| AI Media | Background, relight, object removal, enhancement, captions | `ai-media/*` |

## End-to-end user lifecycle

### A. Acquisition
Landing → install/open → country/language → sign up or sign in → consent/age gate.

### B. Authentication
Supported identifiers: email, phone, username.
Password minimum: 8 characters.
Registration accepts **one contact method** (email OR phone).
A new account receives a session and is redirected to mandatory profile setup.

### C. Profile completion
Username availability → nickname → avatar → bio → privacy → interests/topics → onboarding → For You.

### D. Core loop
For You → watch → like/comment/repost/save/share → follow → search → profile → create → publish → analytics.

### E. Creation loop
Create → camera/gallery/photo/text → edit → sound → effects → captions → cover → privacy/comment/duet/stitch controls → safety pre-check → publish → processing → distribution → analytics.

### F. Creator loop
Studio → content → analytics → comments → LIVE → monetization → payouts → verification → creator marketplace.

### G. Social loop
Inbox → DMs → notifications → shared content → profiles → follow graph → recommendations.

### H. Trust loop
Report/block/mute → automated safety → human review → enforcement → appeal → audit trail.

### I. Exit
Settings → account/security → sessions/devices → download data → deactivate/delete → revoke sessions → sign out.

## Feed architecture

Do not implement the For You feed as a simple chronological query.

Every recommendation candidate should carry:
- creator quality/safety state,
- viewer eligibility,
- freshness,
- watch behavior,
- completion/rewatch,
- skips/not-interested,
- likes/comments/shares/saves,
- follow relationship,
- topic/sound/hashtag affinity,
- language/region,
- repetition/diversity controls,
- policy eligibility.

The ranking implementation remains TwiTok-owned; no TikTok proprietary weights are copied.

## Realtime architecture

Use the existing WebSocket layer for:
- message:new
- message:sent
- message:delivered
- message:read
- notification:new
- live:viewer-count
- live:chat
- live:gift
- live:guest-invite
- live:moderation

Redis is the ephemeral coordination/cache layer. MongoDB remains the system of record.

## Media architecture

Use a provider abstraction:

Client → upload session → signed/direct upload → evidence/integrity check → processing queue → transcoding → thumbnails/captions → moderation → publish → CDN playback.

Cloudflare Stream/R2 can be used behind the abstraction without coupling product code to a single provider.

## Payments architecture

All money movement goes through a ledger:

intent → provider payment → verified webhook → immutable ledger entry → wallet balance → gift/subscription/reward → withdrawal request → compliance/risk checks → payout → reconciliation.

Never derive balances from UI events.

## Safety architecture

Every user-generated object has a safety lifecycle:

created → scanned → allowed/restricted/blocked → published → reported → reviewed → actioned → appealable → audited.

Safety decisions must be independent from feed ranking.

## Admin architecture

Admin actions require:
- authenticated staff identity,
- explicit permission,
- target resource,
- reason,
- audit event,
- reversible action where possible.

Owner, admin, moderator, support and analyst privileges remain separated.

## Parity completion gates

A domain is **DONE** only when UI + API + persistence + authorization + safety + analytics + admin + failure handling are all present.

The deployment gate should fail if:
- TypeScript fails,
- route contract tests fail,
- auth/session tests fail,
- security checks fail,
- critical Mongo indexes fail,
- web build fails,
- API health fails.

## Rollout order

1. Identity/session foundation
2. Profile/onboarding
3. Feed/recommendation contracts
4. Social graph + engagement
5. Creation/media pipeline
6. Search/discovery
7. Stories
8. Messaging/realtime
9. LIVE
10. Creator Studio/analytics
11. Monetization/payments/withdrawals
12. Safety/moderation/appeals
13. Admin/observability
14. AI media and advanced creator tools
15. Performance, CDN, regionalization and reliability
16. Full regression + production launch gate
