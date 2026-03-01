const COUNTRY_LANGUAGE_MAP: Record<string, string> = {
  AL: "sq",
  BR: "pt",
  CN: "zh",
  DE: "de",
  ES: "es",
  FR: "fr",
  GR: "el",
  IT: "it",
  JP: "ja",
  KR: "ko",
  NL: "nl",
  PL: "pl",
  PT: "pt",
  RO: "ro",
  RU: "ru",
  TR: "tr",
  US: "en",
};

function normalizeAcceptLanguage(value: string | null): string | null {
  if (!value) return null;
  const primary = value.split(",")[0]?.trim();
  if (!primary) return null;
  return primary;
}

export function detectLocaleFromRequest(request: Request | undefined): string {
  const acceptLanguage = normalizeAcceptLanguage(
    request ? request.headers.get("accept-language") : null,
  );
  const country = request?.headers.get("x-vercel-ip-country")?.toUpperCase();

  if (country && country !== "XX") {
    const languageFromCountry =
      COUNTRY_LANGUAGE_MAP[country] ?? acceptLanguage?.split("-")[0] ?? "en";
    return `${languageFromCountry}-${country}`;
  }

  return acceptLanguage ?? "en-US";
}
