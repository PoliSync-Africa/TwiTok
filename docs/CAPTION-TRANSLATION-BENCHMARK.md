# TwiTok Caption Translation Benchmark

## TikTok reference

TwiTok's caption/accessibility design is benchmarked against TikTok's current public Help Center documentation for accessibility while watching and creating videos. TikTok documents accessibility-focused video features and caption-related workflows, while feature availability can vary by market and app version.

Reference:
- https://support.tiktok.com/en/using-tiktok/exploring-videos
- https://support.tiktok.com/en/search?searchTerm=Editing%20TikTok%20videos%20and%20photos

## TwiTok behavior

1. A creator may generate automatic speech captions.
2. The creator can review and edit generated captions.
3. Captions are stored as timestamped accessibility tracks rather than being permanently burned into the video.
4. A viewer can select an available caption language.
5. A viewer can request an additional translation.
6. Translation is asynchronous so playback is never blocked waiting for AI.
7. Translated captions preserve the source timestamps.
8. Translated text passes through the TwiTok Safety Engine before publication as a caption track.
9. Translation tracks are cached and reused instead of translating the same video repeatedly.
10. African languages are first-class targets: English, French, Arabic, Swahili, Twi, Hausa, Yoruba, Igbo, Zulu, Xhosa, Amharic and Portuguese.

## Architecture

```
Viewer
  |
  +-- Existing caption track --> CDN/VTT
  |
  +-- Request translation
            |
            v
       Translation Job
            |
            v
   Translation Worker
            |
            v
     AI Translation Provider
            |
            v
     TwiTok Safety Engine
            |
            v
      VTT + MongoDB
            |
            v
          CDN
```

The translation provider is pluggable. The current adapter uses the OpenAI Responses API when configured, while the provider interface allows a different translation service to be introduced without changing the video/feed architecture.

## Production requirements

- API key must remain server-side.
- Translation jobs require idempotency and retry/lease recovery.
- Do not expose private caption tracks through public URLs.
- Cache translated tracks and avoid repeated translation charges.
- Add per-user/video translation rate limits.
- Add language quality monitoring and human review for safety-sensitive edge cases.
- Never silently replace creator-authored captions with an AI translation.
- Preserve creator/source attribution.
