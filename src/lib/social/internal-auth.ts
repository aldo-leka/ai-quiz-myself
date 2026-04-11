import { NextResponse } from "next/server";

function getConfiguredInternalToken() {
  return process.env.INTERNAL_SOCIAL_API_TOKEN?.trim() || null;
}

export function isInternalSocialRequestAuthorized(request: Request) {
  const configuredToken = getConfiguredInternalToken();
  if (!configuredToken) {
    return false;
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return false;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 && token === configuredToken;
}

export function getInternalSocialAuthErrorResponse() {
  return NextResponse.json(
    { error: "Unauthorized internal social request." },
    { status: 401 },
  );
}
