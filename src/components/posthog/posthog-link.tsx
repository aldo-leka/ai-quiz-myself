"use client";

import Link from "next/link";
import type { ComponentProps, MouseEventHandler } from "react";
import posthog from "posthog-js";

type PostHogLinkProps = Omit<ComponentProps<typeof Link>, "href" | "onClick"> & {
  href: string;
  eventName?: string;
  eventProperties?: Record<string, unknown>;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function PostHogLink({
  href,
  eventName,
  eventProperties,
  onClick,
  ...props
}: PostHogLinkProps) {
  const handleClick: MouseEventHandler<HTMLAnchorElement> = (event) => {
    if (eventName) {
      posthog.capture(eventName, eventProperties);
    }

    onClick?.(event);
  };

  return <Link href={href} onClick={handleClick} {...props} />;
}
