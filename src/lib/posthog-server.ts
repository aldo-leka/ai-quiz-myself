import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

export function getPostHogClient() {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  if (!posthogClient) {
    posthogClient = new PostHog(apiKey, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}

export async function shutdownPostHog() {
  if (posthogClient) {
    await posthogClient.shutdown();
    posthogClient = null;
  }
}

type ServerPostHogEvent = {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
};

export async function captureServerEvent({
  distinctId,
  event,
  properties,
}: ServerPostHogEvent) {
  const client = getPostHogClient();
  if (!client) {
    return false;
  }

  try {
    client.capture({
      distinctId,
      event,
      properties,
    });
    await shutdownPostHog();
    return true;
  } catch {
    await shutdownPostHog();
    return false;
  }
}
