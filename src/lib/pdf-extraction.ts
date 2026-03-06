import { extractText } from "unpdf";

const MIN_DIRECT_TEXT_CHARS = 500;
const MAX_SOURCE_TEXT_CHARS = 50_000;

type ExtractPdfSourceTextParams = {
  pdfBuffer: Buffer;
  fileName: string;
  openAIApiKey?: string;
};

type OpenAiFileUploadResponse = {
  id: string;
};

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function normalizeTitle(fileName: string): string {
  const withoutExt = fileName.replace(/\.pdf$/i, "").trim();
  return withoutExt || "PDF Quiz";
}

function normalizeExtractedText(input: string): string {
  return input
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\u0000/g, "")
    .replace(/[ \f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateText(input: string, maxChars = MAX_SOURCE_TEXT_CHARS): string {
  if (input.length <= maxChars) return input;

  const slice = input.slice(0, maxChars);
  const lastBreak = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
  if (lastBreak < maxChars * 0.7) {
    return slice;
  }

  return slice.slice(0, lastBreak);
}

function readOpenAiOutputText(payload: OpenAiResponse): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim().length > 0) {
    return payload.output_text;
  }

  const textChunks: string[] = [];
  for (const outputItem of payload.output ?? []) {
    for (const contentItem of outputItem.content ?? []) {
      if (contentItem.type === "output_text" && typeof contentItem.text === "string") {
        textChunks.push(contentItem.text);
      }
    }
  }

  return textChunks.join("\n\n");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown OCR error";
}

async function extractDirectPdfText(pdfBuffer: Buffer): Promise<string> {
  const parsed = await extractText(Uint8Array.from(pdfBuffer), { mergePages: true });
  return normalizeExtractedText(parsed.text ?? "");
}

async function uploadPdfToOpenAi(params: {
  apiKey: string;
  pdfBuffer: Buffer;
  fileName: string;
}): Promise<string> {
  const formData = new FormData();
  formData.append("purpose", "user_data");
  formData.append(
    "file",
    new Blob([Uint8Array.from(params.pdfBuffer)], { type: "application/pdf" }),
    params.fileName,
  );

  const response = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to upload PDF for OCR (${response.status}): ${body.slice(0, 240)}`);
  }

  const payload = (await response.json()) as OpenAiFileUploadResponse;
  if (!payload.id) {
    throw new Error("OpenAI file upload did not return a file ID");
  }

  return payload.id;
}

async function deleteOpenAiFile(apiKey: string, fileId: string): Promise<void> {
  try {
    await fetch(`https://api.openai.com/v1/files/${fileId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch {
    // Ignore cleanup failures.
  }
}

async function extractWithOpenAiOcr(params: {
  apiKey: string;
  fileId: string;
}): Promise<string> {
  const model =
    process.env.OPENAI_OCR_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Extract readable text from this PDF document.",
                "If pages are scanned images, perform OCR.",
                "Return plain text only and preserve headings when possible.",
                "Do not add commentary.",
              ].join(" "),
            },
            {
              type: "input_file",
              file_id: params.fileId,
            },
          ],
        },
      ],
      max_output_tokens: 12_000,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI OCR failed (${response.status}): ${body.slice(0, 240)}`);
  }

  const payload = (await response.json()) as OpenAiResponse;
  const text = readOpenAiOutputText(payload);
  return normalizeExtractedText(text);
}

export async function extractPdfSourceText(
  params: ExtractPdfSourceTextParams,
): Promise<{ title: string; text: string; method: "text" | "ocr" }> {
  const title = normalizeTitle(params.fileName);

  let directText = "";
  try {
    directText = await extractDirectPdfText(params.pdfBuffer);
  } catch {
    directText = "";
  }

  if (directText.length >= MIN_DIRECT_TEXT_CHARS) {
    return {
      title,
      text: truncateText(directText),
      method: "text",
    };
  }

  if (!params.openAIApiKey) {
    if (directText.length > 0) {
      return {
        title,
        text: truncateText(directText),
        method: "text",
      };
    }

    throw new Error("PDF text could not be extracted and OCR is unavailable.");
  }

  let fileId: string | null = null;
  try {
    fileId = await uploadPdfToOpenAi({
      apiKey: params.openAIApiKey,
      pdfBuffer: params.pdfBuffer,
      fileName: params.fileName,
    });

    const ocrText = await extractWithOpenAiOcr({
      apiKey: params.openAIApiKey,
      fileId,
    });

    if (!ocrText) {
      throw new Error("OCR returned empty content");
    }

    return {
      title,
      text: truncateText(ocrText),
      method: "ocr",
    };
  } catch (error) {
    if (directText.length > 0) {
      return {
        title,
        text: truncateText(directText),
        method: "text",
      };
    }

    throw new Error(`PDF OCR failed: ${toErrorMessage(error)}`);
  } finally {
    if (fileId) {
      await deleteOpenAiFile(params.openAIApiKey, fileId);
    }
  }
}
