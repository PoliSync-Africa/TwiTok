# TwiTok Architecture

## High-level

```
Mobile / Web
     |
 API Gateway
     |
 Core API
 ├── Auth
 ├── Profiles
 ├── Video
 ├── Feed
 ├── Social
 ├── Messaging
 ├── Communities
 ├── LIVE
 ├── Creator
 ├── Marketplace
 ├── Ads
 ├── Safety
 └── Admin
     |
 MongoDB
     |
 Media Storage + CDN

Admin Web
     |
 Admin API
     |
 Owner/Admin Control Plane
```

## Important separation

The normal social domain and administrative domain are separate.

### Social domain

- User
- Profile
- Video
- Comment
- Like
- Follow
- Message
- Community
- Creator profile

### Control-plane domain

- PlatformOwner
- AdminStaff
- AdminSession
- Role
- Permission
- SafetyPolicy
- FeatureFlag
- SystemSetting
- AuditLog
- ModerationCase

A PlatformOwner must never depend on the ordinary User collection for platform authority.

## Recommended stack

- Mobile: React Native + Expo
- Web: Next.js
- API: Node.js + TypeScript
- Database: MongoDB
- Realtime: WebSockets/WebRTC
- Media: object storage + CDN
- AI: dedicated safety/recommendation/translation services

## Security

All administrative mutations require:

1. authenticated admin session
2. permission check
3. server-side validation
4. audit log
5. additional confirmation for destructive actions

Owner-only operations require the OWNER role and should support stronger authentication such as MFA.
