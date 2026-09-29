import crypto from "node:crypto";
import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucket = process.env.MEDIA_BUCKET || "";
const endpoint = process.env.MEDIA_S3_ENDPOINT || undefined;
const region = process.env.MEDIA_S3_REGION || "auto";
const accessKeyId = process.env.MEDIA_S3_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY || "";

let client: S3Client | null = null;

function getClient() {
  if (!bucket || !accessKeyId || !secretAccessKey) throw new Error("Media storage is not configured");
  if (!client) client = new S3Client({ region, endpoint, forcePathStyle: process.env.MEDIA_S3_FORCE_PATH_STYLE === "true", credentials: { accessKeyId, secretAccessKey } });
  return client;
}

export function mediaConfigured() { return Boolean(bucket && accessKeyId && secretAccessKey); }

function validateObjectKey(objectKey: string) {
  if (!objectKey || objectKey.length > 512 || objectKey.startsWith("/") || objectKey.includes("..") || objectKey.includes("\\") || /[\u0000-\u001f]/.test(objectKey)) throw new Error("Invalid media object key");
}

function validateMimeType(mimeType: string) {
  if (!/^(video\/(mp4|quicktime|webm)|image\/(jpeg|png|webp)|audio\/(mpeg|mp4|x-m4a|wav|webm))$/i.test(mimeType)) throw new Error("Unsupported media type");
}

export async function createPresignedUpload(input: { objectKey: string; mimeType: string; expiresInSeconds?: number }) {
  validateObjectKey(input.objectKey);
  validateMimeType(input.mimeType);
  const expires = Math.max(60, Math.min(input.expiresInSeconds ?? 900, 900));
  const command = new PutObjectCommand({ Bucket: bucket, Key: input.objectKey, ContentType: input.mimeType });
  const url = await getSignedUrl(getClient(), command, { expiresIn: expires });
  return { url, expiresInSeconds: expires };
}

export async function headMediaObject(objectKey: string) {
  validateObjectKey(objectKey);
  return getClient().send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
}

export async function createMultipartUpload(input: { objectKey: string; mimeType: string }) {
  validateObjectKey(input.objectKey); validateMimeType(input.mimeType);
  const response = await getClient().send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: input.objectKey, ContentType: input.mimeType }));
  if (!response.UploadId) throw new Error("Storage did not return a multipart upload ID");
  return response.UploadId;
}

export async function createPresignedUploadPart(input: { objectKey: string; uploadId: string; partNumber: number; expiresInSeconds?: number }) {
  validateObjectKey(input.objectKey);
  if (!Number.isInteger(input.partNumber) || input.partNumber < 1 || input.partNumber > 10000) throw new Error("Invalid multipart part number");
  const url = await getSignedUrl(getClient(), new UploadPartCommand({ Bucket: bucket, Key: input.objectKey, UploadId: input.uploadId, PartNumber: input.partNumber }), { expiresIn: Math.max(60, Math.min(input.expiresInSeconds ?? 900, 900)) });
  return { url, partNumber: input.partNumber, expiresInSeconds: Math.max(60, Math.min(input.expiresInSeconds ?? 900, 900)) };
}

export async function completeMultipartUpload(input: { objectKey: string; uploadId: string; parts: Array<{ partNumber: number; etag: string }> }) {
  validateObjectKey(input.objectKey);
  if (!Array.isArray(input.parts) || input.parts.length < 1 || input.parts.length > 1000) throw new Error("Invalid multipart parts");
  const sorted = [...input.parts].sort((a, b) => a.partNumber - b.partNumber);
  if (sorted.some((part, i) => !Number.isInteger(part.partNumber) || part.partNumber < 1 || part.partNumber > 10000 || !part.etag || (i > 0 && part.partNumber === sorted[i - 1].partNumber))) throw new Error("Invalid multipart part list");
  const response = await getClient().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: input.objectKey,
      UploadId: input.uploadId,
      MultipartUpload: {
        Parts: sorted.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
        })),
      },
    }),
  );
  return { etag: response.ETag ?? null };
}

export async function createPresignedPlayback(objectKey: string, expiresInSeconds = 3600) {
  validateObjectKey(objectKey);
  const expires = Math.max(60, Math.min(expiresInSeconds, 3600));
  const url = await getSignedUrl(getClient(), new GetObjectCommand({ Bucket: bucket, Key: objectKey }), { expiresIn: expires });
  return { url, expiresInSeconds: expires };
}

export function publicMediaUrl(objectKey: string) {
  validateObjectKey(objectKey);
  const base = process.env.MEDIA_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return base ? `${base}/${objectKey}` : null;
}

export function newMediaJobId() { return crypto.randomUUID(); }
