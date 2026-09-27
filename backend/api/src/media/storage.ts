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
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("Media storage is not configured");
  }
  if (!client) {
    client = new S3Client({
      region,
      endpoint,
      forcePathStyle: process.env.MEDIA_S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId, secretAccessKey }
    });
  }
  return client;
}

export function mediaConfigured() {
  return Boolean(bucket && accessKeyId && secretAccessKey);
}

export async function createPresignedUpload(input: {
  objectKey: string;
  mimeType: string;
  expiresInSeconds?: number;
}) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.objectKey,
    ContentType: input.mimeType
  });
  const url = await getSignedUrl(getClient(), command, {
    expiresIn: input.expiresInSeconds ?? 900
  });
  return { url, expiresInSeconds: input.expiresInSeconds ?? 900 };
}

export async function headMediaObject(objectKey: string) {
  return getClient().send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
}

export async function createMultipartUpload(input: { objectKey: string; mimeType: string }) {
  const response = await getClient().send(new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: input.objectKey,
    ContentType: input.mimeType
  }));
  if (!response.UploadId) throw new Error("Storage did not return a multipart upload ID");
  return response.UploadId;
}

export async function createPresignedUploadPart(input: {
  objectKey: string;
  uploadId: string;
  partNumber: number;
  expiresInSeconds?: number;
}) {
  if (!Number.isInteger(input.partNumber) || input.partNumber < 1 || input.partNumber > 10000) {
    throw new Error("Invalid multipart part number");
  }
  const url = await getSignedUrl(
    getClient(),
    new UploadPartCommand({
      Bucket: bucket,
      Key: input.objectKey,
      UploadId: input.uploadId,
      PartNumber: input.partNumber
    }),
    { expiresIn: input.expiresInSeconds ?? 900 }
  );
  return { url, partNumber: input.partNumber, expiresInSeconds: input.expiresInSeconds ?? 900 };
}

export async function completeMultipartUpload(input: {
  objectKey: string;
  uploadId: string;
  parts: Array<{ partNumber: number; etag: string }>;
}) {
  const sorted = [...input.parts].sort((a, b) => a.partNumber - b.partNumber);
  const response = await getClient().send(new CompleteMultipartUploadCommand({
    Bucket: bucket,
    Key: input.objectKey,
    UploadId: input.uploadId,
    MultipartUpload: {
      Parts: sorted.map(part => ({ PartNumber: part.partNumber, ETag: part.etag }))
    }
  }));
  return { etag: response.ETag ?? null };
}

export async function createPresignedPlayback(objectKey: string, expiresInSeconds = 3600) {
  const url = await getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
    { expiresIn: expiresInSeconds }
  );
  return { url, expiresInSeconds };
}

export function publicMediaUrl(objectKey: string) {
  const base = process.env.MEDIA_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return base ? `${base}/${objectKey}` : null;
}

export function newMediaJobId() {
  return crypto.randomUUID();
}
