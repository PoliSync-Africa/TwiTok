# TwiTok

**TwiTok is a global short-form video, LIVE streaming, creator, and social media platform built for people to create, discover, share, and connect through video.**

TwiTok combines short-form video, personalized discovery, LIVE experiences, creator tools, social interaction, AI-powered media creation, and creator monetization in one platform. The product is designed for a global audience while celebrating African creativity, culture, languages, and stories.

## What TwiTok is

TwiTok gives users a simple way to:

- Create and share short-form photos and videos.
- Discover content through personalized feeds and Explore.
- Follow creators and build communities.
- Watch and participate in LIVE streams.
- Search for sounds, music, creators, hashtags, and content.
- Comment, like, share, save, and interact with posts.
- Communicate through social and messaging features.
- Build a creator profile and manage content from Creator Studio.
- Track creator performance with analytics.
- Monetize eligible creator activity through virtual gifts and creator rewards.
- Promote content to reach a wider audience.
- Use AI-powered media tools to enhance and transform creative content.
- Manage privacy, safety, account security, and audience controls.

## Core product experience

### Short-form video

TwiTok is centered around a fast, immersive short-video experience with:

- Vertical video feeds.
- Following and discovery feeds.
- Photo and video creation.
- Gallery uploads.
- Camera capture.
- Recording controls and timers.
- Video editing and publishing.
- Captions, hashtags, sounds, and sharing.
- High-quality media processing.

### LIVE

Creators can start LIVE sessions and interact with their audiences in real time.

The LIVE experience is designed around:

- Camera and microphone permissions.
- Live audience interaction.
- Creator controls.
- Moderation and safety tools.
- LIVE settings.
- Real-time engagement.
- Creator monetization.

### Creator Studio

Creator Studio provides creators with tools to manage and grow their presence, including:

- Content management.
- Performance analytics.
- Audience insights.
- Promotion tools.
- Monetization information.
- LIVE management.
- Creator account controls.

### AI Media Studio

TwiTok includes an AI-focused creative workflow for eligible media operations, including:

- Background removal and replacement.
- Object removal.
- Relighting.
- Image and video enhancement.
- Creative media transformations.
- Advanced media processing pipelines.

AI features are designed to assist creators while keeping users in control of the content they publish.

## Social discovery

TwiTok is designed for global discovery.

Users can discover:

- Creators.
- Friends and communities.
- Trending content.
- Sounds and music.
- Hashtags.
- Topics and interests.
- Content from different countries and cultures.

TwiTok is **global by design**. It is not limited to Africa, while African creators and culture remain an important part of the platform's identity.

## Accounts and authentication

TwiTok supports secure account access through:

- Email authentication.
- Phone authentication.
- Password-based sign-in.
- One-time verification codes.
- Account recovery.
- Google authentication.
- Apple authentication.
- Facebook authentication.
- Profile setup and username selection.
- Session security.

Every user is expected to have a unique username, with account setup guiding new users through profile completion.

## Safety and privacy

Safety is a core part of the platform.

TwiTok is designed with:

- Account verification.
- Authentication protections.
- Rate limiting.
- Secure sessions.
- Privacy controls.
- Media security.
- Comment moderation.
- LIVE safety controls.
- Reporting and enforcement workflows.
- Age-appropriate protections.
- Administrative moderation tools.

TwiTok also incorporates security checks into the development and deployment workflow so security issues can be identified before changes reach production.

## Creator monetization

TwiTok is designed to support a creator economy built around virtual interactions and eligible creator rewards.

Planned and implemented monetization capabilities include:

- Virtual Coins.
- Creator Diamonds/Points.
- Virtual Gifts.
- Creator rewards.
- Promotions.
- Eligible creator withdrawals.
- Regional payment methods.
- Mobile-money and bank payout support where available.
- Web and mobile payment infrastructure.

Monetization availability, eligibility, pricing, and payout options may vary by country and applicable platform or payment-provider requirements.

## Technology

TwiTok is built as a modern multi-platform application with a web frontend, backend services, and mobile application.

The repository is organized as a monorepo and includes:

- **Web:** Next.js and TypeScript.
- **Backend API:** Node.js and TypeScript.
- **Mobile:** Expo / React Native.
- **Database:** MongoDB.
- **Caching and real-time infrastructure:** Redis and supporting services.
- **Media delivery:** CDN/object-storage integrations.
- **LIVE infrastructure:** real-time streaming services.
- **CI/CD:** GitHub Actions and Render deployment infrastructure.

## Repository structure

```text
TwiTok/
├── apps/
│   ├── web/          # TwiTok web application
│   └── mobile/       # TwiTok mobile application
├── backend/
│   └── api/          # TwiTok backend API
├── packages/         # Shared packages and types
└── README.md
```

## Development

Install dependencies from the repository root:

```bash
npm install
```

Build the web application:

```npm
npm --workspace @twitok/web run build
```

Build the API:

```bash
npm run build:api
```

Run the project using the development scripts defined by the repository packages.

> Environment variables and third-party credentials are intentionally not stored in source control. Configure production credentials through the appropriate deployment or secret-management system.

## Production architecture

The production platform separates the web experience from the backend API.

- **Web:** `twitokapp.com`
- **API:** TwiTok backend API service
- **Database:** MongoDB
- **Cache / supporting infrastructure:** Redis
- **Deployment:** Render
- **Source control and CI:** GitHub

The exact service URLs, credentials, keys, and infrastructure secrets are environment-specific and should never be committed to the repository.

## Brand

**TwiTok** is the official product name and brand.

The platform's visual identity combines a modern social-video experience with distinctive TwiTok branding. Product interfaces should preserve the approved TwiTok brand assets and maintain consistent typography, spacing, colors, icons, and responsive behavior across web and mobile.

## Product principles

TwiTok is being built around five principles:

1. **Create** — make publishing high-quality content simple.
2. **Discover** — help people find creators, ideas, cultures, and communities.
3. **Connect** — make meaningful social interaction easy.
4. **Create opportunity** — give eligible creators tools to grow and monetize.
5. **Protect people** — make security, privacy, and safety fundamental parts of the product.

## Project status

TwiTok is under active development. Features, integrations, APIs, infrastructure, and user experiences continue to evolve as the platform moves toward broader production readiness.

## License

See the repository's license and applicable project documentation for licensing information.
