import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DEFAULT_PDF_UPLOAD_URL_TTL_SECONDS = 15 * 60;
export const MAX_R2_PDF_FILE_SIZE_BYTES = 100 * 1024 * 1024;

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function sanitizePathSegment(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || "file";
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT?.trim() &&
      process.env.R2_BUCKET?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim(),
  );
}

function getR2Client(): S3Client {
  return new S3Client({
    region: process.env.R2_REGION?.trim() || "auto",
    endpoint: getRequiredEnv("R2_ENDPOINT"),
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

function getBucketName(): string {
  return getRequiredEnv("R2_BUCKET");
}

export function buildPdfObjectKey(params: {
  userId: string;
  fileName: string;
}): string {
  const sanitizedName = sanitizePathSegment(params.fileName.replace(/\.pdf$/i, "")) || "quiz-pdf";
  return [
    "quiz-pdfs",
    sanitizePathSegment(params.userId),
    new Date().toISOString().slice(0, 10),
    `${randomUUID()}-${sanitizedName}.pdf`,
  ].join("/");
}

export async function createPdfUploadUrl(params: {
  objectKey: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: params.objectKey,
    ContentType: params.contentType,
  });

  return getSignedUrl(client, command, {
    expiresIn: params.expiresInSeconds ?? DEFAULT_PDF_UPLOAD_URL_TTL_SECONDS,
  });
}

export async function downloadR2ObjectBuffer(objectKey: string): Promise<Buffer> {
  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: objectKey,
  });
  const response = await client.send(command);

  if (!response.Body) {
    throw new Error("R2 object has no body");
  }

  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
}
