# TwiTok Media Pipeline Benchmark

## TikTok comparison

TwiTok follows the public product pattern of direct video creation/upload, processing before publication, playback optimization, thumbnails/covers, drafts, privacy controls and feed playback. TikTok's proprietary transcoding, CDN, ranking infrastructure and internal media formats are not public and are not copied.

## TwiTok architecture

```
Mobile/Web Client
    ↓
API creates upload session
    ↓
Signed direct upload
    ↓
Object Storage
    ↓
Source verification
    ↓
Processing Queue
    ↓
Transcoding Worker
    ├── MP4 fallback
    ├── HLS adaptive streams
    ├── poster/thumbnail
    └── metadata
    ↓
Safety + publication gate
    ↓
CDN / Playback
    ↓
Vertical Feed
```

## Storage contract

The API uses an S3-compatible storage abstraction. Cloudflare R2 is a supported target because it supports S3-compatible APIs and presigned URLs. Large uploads should use multipart/resumable uploads rather than sending large video bodies through the API.

For production:
- videos should not be proxied through the API
- source objects and derived playback assets use separate prefixes
- object keys are opaque and user-scoped
- upload URLs are short-lived
- Content-Type is signed
- CORS is restricted to TwiTok origins
- incomplete multipart uploads are lifecycle-cleaned
- CDN delivery is separated from storage credentials

## Processing contract

A processing job is durable and idempotent:
- QUEUED
- RUNNING
- SUCCEEDED
- FAILED
- DEAD_LETTER

Jobs have attempts, leases, retry timing and last-error information. A worker must claim a job, transcode the source, upload derived assets, then mark the job successful.

## Important implementation boundary

The repository now contains the storage and processing contracts, but it does **not** pretend that a transcoding cluster or CDN has been provisioned. The next infrastructure step is to connect a real worker (FFmpeg, cloud transcoding service, or managed video provider) and a CDN.

## Scale target

The media path is designed so API servers remain stateless while large media traffic goes directly between clients, object storage and CDN.
