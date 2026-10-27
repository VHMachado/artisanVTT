import { useEffect, useState } from "react";

import { brokerUrl } from "../helpers/broker";

export type BrokerConnectionStatus = "online" | "no-broker" | "offline";

const POLL_INTERVAL_MS = 10000;
const FETCH_TIMEOUT_MS = 4000;

async function checkBrokerHealth(): Promise<boolean> {
  if (!brokerUrl) {
    return false;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${brokerUrl}/health`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

// Module-level singleton: every mounted consumer (Home, AuthGate, and
// Party's in-game dot) used to get its OWN `useState(false)` plus its own
// poll loop, so switching routes (opening Artisan, entering/leaving a
// Mesa) unmounted one instance and mounted a fresh one that always
// started at "no-broker" until its first 4s-timeout fetch resolved — the
// dot (and anything gating on this status) flashed disconnected on every
// navigation even though the broker never actually dropped. Sharing one
// cached result and one poll loop across all instances means a new mount
// adopts the last known answer immediately instead of re-starting cold.
let cachedReachable = false;
let hasPolledOnce = false;
const listeners = new Set<(reachable: boolean) => void>();
let pollTimer: number | undefined;

function notify(reachable: boolean) {
  cachedReachable = reachable;
  hasPolledOnce = true;
  listeners.forEach((listener) => listener(reachable));
}

async function poll() {
  notify(await checkBrokerHealth());
}

function subscribe(listener: (reachable: boolean) => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    poll();
    pollTimer = window.setInterval(poll, POLL_INTERVAL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && pollTimer !== undefined) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  };
}

/**
 * Connectivity indicator for the top-left dot: green when the broker
 * answers, yellow when the OS reports a network but the broker doesn't,
 * red when the OS itself is offline. This is
 * intentionally a plain HTTP health poll rather than reusing
 * network/Session.ts's WebSocket — Session is scoped to one game room
 * (joinGame), while this indicator needs to mean something on the home
 * screen too, before any game is open.
 */
export function useBrokerConnectionStatus(): BrokerConnectionStatus {
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine);
  const [brokerReachable, setBrokerReachable] = useState(cachedReachable);

  useEffect(() => {
    function handleOnline() {
      setBrowserOnline(true);
      // Recheck immediately on regaining connectivity rather than
      // waiting for the next scheduled tick.
      poll();
    }
    function handleOffline() {
      setBrowserOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    // Adopt whatever the shared poll loop already knows right away, in
    // case it resolved between this component mounting and this effect
    // running.
    if (hasPolledOnce) {
      setBrokerReachable(cachedReachable);
    }
    return subscribe(setBrokerReachable);
  }, []);

  if (!browserOnline) {
    return "offline";
  }
  return brokerReachable ? "online" : "no-broker";
}
