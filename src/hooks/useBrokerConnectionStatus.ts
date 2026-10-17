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
  const [brokerReachable, setBrokerReachable] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setBrowserOnline(true);
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
    let cancelled = false;
    async function poll() {
      const reachable = await checkBrokerHealth();
      if (!cancelled) {
        setBrokerReachable(reachable);
      }
    }
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [browserOnline]);

  if (!browserOnline) {
    return "offline";
  }
  return brokerReachable ? "online" : "no-broker";
}
