import { describe, expect, it, vi } from "vitest";

/**
 * The broker URL is resolved once at module load from the environment, so each
 * case re-imports the module with a fresh environment.
 */
async function resolveWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value ?? "");
  }
  const { brokerUrl } = await import("./broker");
  vi.unstubAllEnvs();
  return brokerUrl;
}

describe("brokerUrl", () => {
  it("uses an explicit url when one is set", async () => {
    expect(
      await resolveWith({ VITE_BROKER_URL: "https://broker.example:9000" })
    ).toBe("https://broker.example:9000");
  });

  it("falls back to the host the page was opened from", async () => {
    // jsdom serves the page from localhost, which stands in for the LAN IP the
    // user actually types. The point is that the IP is never hardcoded.
    const resolved = await resolveWith({
      VITE_BROKER_URL: undefined,
      VITE_BROKER_PORT: "9000",
    });
    expect(resolved).toBe(`${window.location.protocol}//${window.location.hostname}:9000`);
  });

  it("defaults to port 9420 when no port is given", async () => {
    const resolved = await resolveWith({
      VITE_BROKER_URL: undefined,
      VITE_BROKER_PORT: undefined,
    });
    expect(resolved).toBe(`${window.location.protocol}//${window.location.hostname}:9420`);
  });
});
