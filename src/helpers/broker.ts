/**
 * Where the backend lives.
 *
 * Set VITE_BROKER_URL to a full URL to point somewhere specific. Set
 * VITE_BROKER_PORT instead (or leave both unset) to reuse whatever host
 * the page was opened from, so the app keeps working when the machine's IP
 * changes or it's reached over a different network.
 */
function resolveBrokerUrl(): string | undefined {
  const explicit = import.meta.env.VITE_BROKER_URL;
  if (explicit) {
    return explicit;
  }
  // No window during tests or SSR, nothing to derive from
  if (typeof window === "undefined") {
    return undefined;
  }
  const port = import.meta.env.VITE_BROKER_PORT || "9420";
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

export const brokerUrl = resolveBrokerUrl();
