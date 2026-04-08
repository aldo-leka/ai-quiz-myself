import { requireEnv } from "@/lib/env";

function parseOrigin(value: string, envName: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid ${envName}: ${value}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Invalid ${envName}: ${value}`);
  }

  return new URL(parsed.origin);
}

const configuredAppBaseUrl = parseOrigin(requireEnv("APP_BASE_URL"), "APP_BASE_URL");

export function getConfiguredAppBaseUrl(): URL {
  return new URL(configuredAppBaseUrl.toString());
}

export function toAppUrl(path: string): URL {
  return new URL(path, configuredAppBaseUrl);
}
