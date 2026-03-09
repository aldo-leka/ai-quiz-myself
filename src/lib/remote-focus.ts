export function scrollRemoteControlIntoView(
  node: Element | null,
  options?: ScrollIntoViewOptions,
) {
  if (!node) return;

  const scrollOptions: ScrollIntoViewOptions = {
    behavior: "auto",
    block: "nearest",
    inline: "nearest",
    ...options,
  };

  if (typeof window === "undefined") {
    node.scrollIntoView(scrollOptions);
    return;
  }

  window.requestAnimationFrame(() => {
    node.scrollIntoView(scrollOptions);
  });
}

export function focusRemoteControl(
  node: HTMLElement | null,
  options?: ScrollIntoViewOptions,
) {
  if (!node) return;

  node.focus({ preventScroll: true });
  scrollRemoteControlIntoView(node, options);
}
