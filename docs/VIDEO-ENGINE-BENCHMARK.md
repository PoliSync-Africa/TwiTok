# TwiTok Video Engine Benchmark — 2026

## TikTok benchmark

Current public TikTok documentation describes a video-first creation flow with a **+ Add post** entry point, camera tools, upload/editing tools, covers, drafts, sounds, and per-post privacy controls. TikTok also documents Duet/Stitch privacy controls and content safety/copyright requirements.

Sources:
- TikTok Help Center — Making a post
- TikTok Help Center — Camera tools
- TikTok Help Center — Editing, posting, and deleting
- TikTok Help Center — Post privacy settings
- TikTok Help Center — Intellectual property

## TwiTok equivalent

The server-side video lifecycle is:

**Create upload session → direct media upload → complete upload → asynchronous processing → safety analysis → draft → publication**

The API deliberately does not proxy large video bytes through the application server. At 100M+ users, media should go directly to object storage using short-lived upload authorization, then be processed asynchronously and delivered through a CDN.

### States

- UPLOADING
- PROCESSING
- READY
- PUBLISHED
- BLOCKED
- FAILED

### Publication gates

A video cannot become public unless:
1. the authenticated owner owns the upload;
2. the upload has completed;
3. processing has produced playback assets;
4. the caption has passed the TwiTok Safety Engine;
5. the video is in READY state;
6. publication is explicitly requested.

### Privacy

Each post supports:
- PUBLIC
- FOLLOWERS
- PRIVATE

The same privacy model must later be enforced by the feed/read layer, not only stored as metadata.

### Media pipeline

Source upload
→ validation
→ malware/content scan
→ transcode
→ 144p/240p/360p/480p/720p/1080p variants where source quality permits
→ adaptive manifest
→ thumbnail/cover
→ audio extraction
→ speech-to-text
→ visual/OCR analysis
→ copyright/audio policy
→ safety decision
→ publication
→ CDN

### Scale requirements

- multipart/resumable uploads
- object storage, never database blobs
- asynchronous queue/workers
- idempotent processing jobs
- retries + dead-letter queue
- immutable source assets
- CDN delivery
- regional media processing
- lifecycle cleanup
- observability for every processing stage

The current implementation is the **API/state-machine foundation**. The next implementation step is the real object-storage adapter, resumable/multipart uploads, transcoding workers, thumbnails, and CDN playback manifests.
