import crypto from "node:crypto";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN || "";
const customerSubdomain = process.env.CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN || "";
const webhookSecret = process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET || "";

export function cloudflareStreamConfigured(): boolean {
  return Boolean(accountId && apiToken);
}

export interface DirectUploadParams {
  maxDurationSeconds?: number;
  creatorId: string;
  uploadId: string;
  meta?: Record<string, string>;
}

export interface DirectUploadResult {
  uploadUrl: string;
  uid: string;
}

export async function createDirectStreamUpload(params: DirectUploadParams): Promise<DirectUploadResult> {
  if (!cloudflareStreamConfigured()) {
    throw new Error("Cloudflare Stream credentials are not configured");
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`;
  const body = {
    maxDurationSeconds: params.maxDurationSeconds ?? 3600,
    creator: params.creatorId,
    meta: {
      uploadId: params.uploadId,
      creatorId: params.creatorId,
      ...params.meta,
    },
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cloudflare Stream direct upload failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { result?: { uploadURL: string; uid: string } };
  if (!data.result?.uploadURL || !data.result?.uid) {
    throw new Error("Invalid response from Cloudflare Stream API");
  }

  return {
    uploadUrl: data.result.uploadURL,
    uid: data.result.uid,
  };
}

export function getStreamPlaybackUrls(uid: string) {
  const host = customerSubdomain
    ? `https://${customerSubdomain}.cloudflarestream.com`
    : `https://customer-${accountId}.cloudflarestream.com`;

  return {
    streamUid: uid,
    hlsUrl: `${host}/${uid}/manifest/video.m3u8`,
    dashUrl: `${host}/${uid}/manifest/video.mpd`,
    thumbnailUrl: `${host}/${uid}/thumbnails/thumbnail.jpg`,
    previewGifUrl: `${host}/${uid}/animated/animation.gif`,
  };
}

export function verifyCloudflareWebhookSignature(signatureHeader: string, rawBody: string): boolean {
  if (!webhookSecret) return true;
  try {
    const parts = signatureHeader.split(",");
    let time = "";
    let signature = "";
    for (const part of parts) {
      const [k, v] = part.trim().split("=");
      if (k === "time") time = v;
      if (k === "sig1") signature = v;
    }
    if (!time || !signature) return false;
    const computed = crypto.createHmac("sha256", webhookSecret).update(`${time}.${rawBody}`).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(computed, "hex"));
  } catch {
    return false;
  }
}
