# TwiTok implementation corrections from Lovable review

This document applies the approved product direction and supplied UI references to the canonical repository `PoliSync-Africa/TwiTok`. It is a requirements and verification checklist, not a claim that every feature below is implemented.

## Canonical app and framework

- The canonical app is the existing `PoliSync-Africa/TwiTok` monorepo (Next.js web in `apps/web`, Expo app in `apps/mobile`, Express/TypeScript API in `backend/api`).
- Do not transplant the separate Lovable TanStack Start implementation into this repository. Reuse product requirements and compatible assets only.
- Keep existing MongoDB/Redis/API/Render integrations. Do not silently switch databases to Lovable Cloud or introduce a competing account/post store.
- Never claim a feature is deployed until the relevant CI/deployment and live behavior are verified.

## Brand and loading

- Preserve the supplied TwiTok combined emblem/wordmark and black-and-metallic-gold identity with red and green accents.
- Use the combined logo for splash/loading screens, wordmark in main navigation, emblem in compact/icon contexts.
- Keep the “Connecting Africa” splash treatment consistent with the provided reference.
- Use a full branded splash only for initial app load and substantial route transitions. Use compact indicators for video buffering, upload progress, and small background refreshes.
- Treat supplied phone screenshots and gift catalogue screenshots as visual references, not full-screen UI backgrounds.

## Feed reference: mobile-first, TikTok-like interaction

The supplied screenshot is a visual reference for a full-screen photo/video feed. Recreate the interaction hierarchy in TwiTok's existing Expo feed and web equivalent without copying its creator branding or fabricating engagement.

### Top navigation

- Respect device safe areas and keep a high-contrast black top region above the media.
- Provide a LIVE entry point, Community/Explore, Following, and For You tabs plus a search control.
- Show a clear selected-tab underline/state, and load the selected server feed when tabs change. Community should remain a named and intentional TwiTok destination, not silently masquerade as another feed.
- Keep these controls accessible and touch-friendly; they must not overlap status bars or cover essential post content.

### Media and right-side action rail

- Use a vertically paged, full-screen media feed with real video playback or photo carousel content and graceful loading/error/empty states.
- Keep the creator avatar/follow action and like, comment, save, share, and additional-action controls in a consistent right-side rail.
- Counts must come from persisted API records. Do not put sample numbers such as the screenshot's counts into production UI.
- Double-tap-to-like, tap-to-pause, and hold-for-speed must be consistent and avoid intercepting buttons or gestures in photo and video cards.
- Provide a clear unavailable-media fallback instead of a blank black screen; compact progress indicators should be used while media buffers.
- The additional-action menu should offer meaningful actions such as not interested, report, and block only when those actions are actually implemented; do not make controls appear to work when they do not.

### Creator and caption information

- Position creator name, caption, sound attribution, and any accurate promotion disclosure at the lower left, clear of the right action rail and bottom navigation.
- Long captions must be truncated cleanly with a working expand action where supported.
- Photo posts should show a visible multi-photo indicator or carousel affordance if additional photos exist.
- Profile and sound taps must open the relevant TwiTok routes, not dead-end UI.

### Bottom navigation and create

- Keep Home, Friends, the prominent centered Create control, Inbox, and Profile anchored to the device's bottom safe area.
- The Create control should open the current camera/create flow and offer available Photo, Video, Gallery, and LIVE modes based on real capabilities.
- Ensure content/action rails do not collide with the bottom navigation on small-screen iPhones and Android devices.
- Support reduced-motion and accessibility labels for icon-only controls and maintain sufficient touch-target size.

### Data integrity and verification

- Signed-out state must present clear Sign in/Sign up actions rather than fabricated engagement or a misleading feed state.
- Like/save/comment/share/follow/report/block actions must use persisted backend records and server-side ownership/authorization checks.
- Preserve the canonical MongoDB user, post, and interaction records; no browser-only duplicate source of truth.
- Verify small iPhone Safari/Chrome, Android, tablet, and desktop web layout separately.
- Test tab changes, vertical paging, safe-area layout, real media playback, playback pause/resume, gesture conflicts, empty feeds, network failure, signed-out behavior, and actual persisted engagement before marking this reference complete.

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
- The supplied gift references may show conflicting prices. Neither is an authoritative price list.
- Keep coin purchases, gift transfers, and creator withdrawals disabled until pricing, payments, accounting/reconciliation, fraud controls, and payout configuration are implemented and verified. Clearly label these as unavailable/coming later.

## Follow-up features from the product backlog

Track these as not complete until code and behavior are verified:
- AI caption/hashtag suggestions for uploaded videos.
- Accessible video descriptions, subtitles, searchable transcripts, and viewer natural-language video discovery.
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
