import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildPdfObjectKey,
  createPdfUploadUrl,
  isR2Configured,
  MAX_R2_PDF_FILE_SIZE_BYTES,
} from "@/lib/r2";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getUserSessionOrNull } from "@/lib/user-auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  fileName: z.string().trim().min(1).max(220),
  fileSizeBytes: z.number().int().positive().max(MAX_R2_PDF_FILE_SIZE_BYTES),
  contentType: z.string().trim().min(1).max(120).optional(),
});

const PDF_UPLOAD_RATE_LIMIT = {
  limit: 12,
  windowMs: 60_000,
  errorMessage: "Too many PDF upload requests. Please wait a moment and try again.",
} as const;

export async function POST(request: Request) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResponse = await enforceRateLimit({
    scope: "pdf_upload_url",
    identifier: `user:${session.user.id}`,
    ...PDF_UPLOAD_RATE_LIMIT,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 upload is not configured for large PDF uploads." },
      { status: 412 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const isPdf =
    payload.contentType?.toLowerCase() === "application/pdf" ||
    payload.fileName.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
  }

  const objectKey = buildPdfObjectKey({
    userId: session.user.id,
    fileName: payload.fileName,
  });
  const uploadUrl = await createPdfUploadUrl({
    objectKey,
    contentType: "application/pdf",
  });

  return NextResponse.json({
    uploadUrl,
    objectKey,
    maxFileSizeBytes: MAX_R2_PDF_FILE_SIZE_BYTES,
    uploadHeaders: {
      "Content-Type": "application/pdf",
    },
  });
}
