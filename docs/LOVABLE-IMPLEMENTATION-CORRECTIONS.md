# TwiTok implementation corrections from Lovable review

This document applies the approved Lovable product direction to the canonical repository `PoliSync-Africa/TwiTok`. It is a requirements and verification checklist, not a claim that every feature below is implemented.

## Canonical app and framework

- The production/canonical app is the existing `PoliSync-Africa/TwiTok` monorepo (Next.js web in `apps/web`, Expo app in `apps/mobile`, Express/TypeScript API in `backend/api`).
- Do not transplant the separate Lovable TanStack Start implementation into this repository. Reuse its product requirements and compatible assets only.
- Keep existing MongoDB/Redis/API/Render integrations. Do not silently switch databases to Lovable Cloud or introduce a second competing account/post store.
- Never claim a feature is deployed until the relevant CI/deployment and live behavior are verified.

## Brand and loading

- Preserve the supplied TwiTok combined emblem/wordmark and black-and-metallic-gold identity with red and green accents.
- Use the combined logo for splash/loading screens, wordmark in main navigation, emblem in compact/icon contexts.
- Keep the “Connecting Africa” splash treatment consistent with the provided reference.
- Use a full branded splash only for initial app load and substantial route transitions. Use compact indicators for video buffering, upload progress, and small background refreshes.
- Treat supplied phone screenshots and gift catalogue screenshots as visual references, not full-screen UI backgrounds.

## First milestone: working browser experience

### Watch
- Full-height vertical short-video feed; For You and Following views.
- Real media playback, sound/mute control, creator identity, like, save, comment, share, and follow.
- Proper loading, empty, signed-out, and error states.
- Demo starter content must be explicitly labelled DEMO. Never present invented counts, fake users, or fake engagement as real.

### Discover
- Search creators and posts, browse topics, and open public profiles and individual shareable post routes.
- Every profile and post should have unique page title and social-sharing metadata.
- Public viewing remains available when signed out.

### Create and social data
- Working sign-in, profile editing, photo/video posting, captions, and upload progress.
- Accounts, posts, and social interactions must persist in the existing backend/database with authorization/ownership checks. Do not replace this with browser-only localStorage.
- Follow, like, save, comment, and notification actions must use real persisted records.
- Empty inboxes should be honest; do not fabricate direct-message conversations.

### Gifts
- Build a browsable, category-filtered gift catalogue with individual gift artwork.
- The two supplied gift references show conflicting prices. Neither is an authoritative price list.
- Keep coin purchases, gift transfers, and creator withdrawals disabled until pricing, payments, accounting/reconciliation, fraud controls, and payout configuration are implemented and verified. Clearly label these as unavailable/coming later.

## Follow-up features from the Lovable request backlog

Track these as not complete until code and behavior are verified:
- AI Gateway caption/hashtag suggestions for uploaded videos.
- AI Gateway accessible video descriptions, subtitles, searchable transcripts, and viewer natural-language video discovery.
- Creator analytics grounded in real views, watch time, follower growth, and gift earnings.
- Resumable uploads with progress and recovery.
- Creator drafts/content calendar and scheduled publishing.
- Viewer playlists/collections.
- Comment pinning, keyword filters, and per-video comment permissions.
- Directly shareable post links and native/browser share options.
- Activity inbox based on real follows and post interactions.
- Video remix/response publishing with source attribution and creator-controlled remix permission, including revocation.
- Reporting, account blocking, restricted-content controls, moderation and appeals.
- LIVE streaming requires a configured streaming provider and must not be represented as operational until tested.
- Native iOS/Android builds are separate from the web deployment.

## Production readiness

Twenty million users in three years is an ambition, not a capacity guarantee. Before scale claims or broad launch, verify security and ownership rules, moderation operations, video delivery and storage costs, observability/alerts, disaster recovery, and staged load/performance tests.

## Acceptance checklist for each implementation

- Run the applicable typecheck, tests, and build.
- Verify actual behavior in a deployed preview on mobile and desktop.
- Verify signed-out and signed-in flows, ownership checks, and empty/error states.
- Verify asset loading, media playback, shareable routes, and page metadata.
- Report clearly what is implemented, what was tested, and what remains blocked by service configuration.
