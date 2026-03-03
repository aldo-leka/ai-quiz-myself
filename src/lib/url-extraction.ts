import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

const MAX_ARTICLE_TEXT_LENGTH = 50_000;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTitle(value: string, fallback: string): string {
  const cleaned = normalizeWhitespace(value);
  if (cleaned.length > 0) return cleaned;
  return fallback;
}

function assertHttpUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP(S) URLs are supported");
  }

  return parsed;
}

export async function extractArticleText(url: string): Promise<{ title: string; text: string }> {
  const parsedUrl = assertHttpUrl(url.trim());

  const response = await fetch(parsedUrl.toString(), {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "QuizPlusBot/1.0 (+https://quizplus.app)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL content (${response.status})`);
  }

  const html = await response.text();
  if (!html.trim()) {
    throw new Error("URL returned empty content");
  }

  const { document } = parseHTML(html);
  const parsedArticle = new Readability(document).parse();

  const rawText =
    parsedArticle?.textContent ??
    document.body?.textContent ??
    "";

  const normalizedText = normalizeWhitespace(rawText).slice(0, MAX_ARTICLE_TEXT_LENGTH);
  if (normalizedText.length < 120) {
    throw new Error("Not enough readable article text found at this URL");
  }

  const title = normalizeTitle(
    parsedArticle?.title ?? document.title ?? "",
    parsedUrl.hostname,
  );

  return {
    title,
    text: normalizedText,
  };
}

