# TwiTok TikTok-parity architecture

Goal: make TwiTok a global short-form social platform with feature-to-feature parity with the current TikTok product model while retaining TwiTok's own brand, policies, monetization and global positioning.

## Identity
Welcome -> Sign up / Sign in -> verification -> mandatory profile setup -> home -> session refresh -> sign out.
Required: email/phone/username login, 8+ character password, OTP verification, unique username, profile setup, session/device management, forgot/reset/change password, passkey-ready contracts, sign out current/all devices, account deletion/export, safe redirects.

## Core domains
Identity and sessions; profiles/social graph; For You/Following/discovery/local feeds; video/photo/text/Stories; camera/upload/transcoding/CDN; editing/sounds/effects/AI Media Studio; comments/replies/mentions/hashtags/saves/reposts; search/recommendations; notifications/inbox; DMs and creator/community chats; LIVE; Creator Studio/analytics; coins/gifts/diamonds/withdrawals; promotions; safety/moderation/appeals; admin control plane; privacy/age/wellbeing; feature flags and observability.

## Feed
Surfaces: FOR_YOU, FOLLOWING, DISCOVER/SEARCH, LOCAL, PROFILE and STORIES.
Ranking signals: watch time, completion, skips, likes, comments, shares, saves, follows, searches, topic preferences, language, safety eligibility and freshness.
Controls: Not interested, Refresh feed, Manage Topics, keyword/smart keyword filters, recommendation explanations and eligibility checks.

## Creation
Resumable upload -> validation -> moderation pre-check -> transcoding -> thumbnails/captions -> object storage/CDN -> publish -> indexing -> recommendation eligibility.
Support stale-session recovery, idempotency, checksums and evidence/audit records.

## Social graph
Follow/unfollow, block, mute, restrict, report and private-account enforcement across every surface.

## Messaging
Conversations, message requests, text/media/voice, delivered/read, typing/presence, block/report, creator inbox, eligible creator chat rooms and realtime delivery.

## LIVE
Create -> eligibility/moderation -> broadcast -> realtime chat -> gifts/moderation -> replay -> analytics.
Host/moderator roles, keyword mute, user mute/block, reports and safety controls.

## Creator ecosystem
Creator Studio: content, drafts, analytics, audience, comments/inbox, LIVE, monetization, verification, content eligibility checks and creator safety.

## Monetization
Separate ledgers for Coins, Gifts, creator Diamonds/earnings, platform revenue, withdrawals, refunds/chargebacks and promotions. All money movements idempotent and auditable.

## Safety
Central policy engine for upload, comments, DMs, LIVE and profiles: age safeguards, spam/bot detection, abuse detection, regulated-goods enforcement, AI-content labels, report -> review -> action -> appeal, evidence integrity and moderation queues.

## Data/infrastructure
MongoDB is the primary application database. Redis is for ephemeral sessions, rate limits, caching and realtime coordination. Media storage and CDN remain separate from the database.
Events should include UserCreated, SessionCreated, FollowCreated, VideoUploaded, VideoPublished, EngagementRecorded, CommentCreated, MessageSent, LiveStarted, GiftPurchased, GiftSent, WithdrawalRequested and ModerationDecision.

## API
Version under /api/v1 with domain prefixes:
auth, users, profiles, social, feed, videos, stories, comments, search, messages, notifications, live, music, creator, wallet, monetization, promotions, moderation and admin.

## Frontend
Public: /, /login, /register, /auth-required, /video/[id], /discover.
Authenticated: /profile, /settings, /messages, /create, /live.
Creator: /studio, /analytics, /earnings, /verification.
Admin: /admin/*.

## Delivery order
P0 Identity/session correctness, protected routing, sign-out, password recovery, verification and profile setup.
P1 Feed/recommendation contract, social graph, search/discovery, notifications and DMs.
P2 Creation/upload/editing, Stories, sounds, LIVE transport and moderation.
P3 Creator Studio, monetization, promotions, analytics and withdrawals.
P4 Advanced AI editing, experimentation, local discovery and ecosystem integrations.
