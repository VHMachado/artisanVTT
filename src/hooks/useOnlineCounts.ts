import { useEffect, useState } from "react";

import { AccountSession } from "../helpers/account";
import { fetchOnlineCounts } from "../helpers/tablesApi";

const POLL_INTERVAL_MS = 10000;

/**
 * "Usuários Online" badge on each Mesa card: polls
 * GET /tables/online (backed by game.Hub.OnlineCounts, an in-memory,
 * live-only fact — nothing to read from Dexie here, unlike the rest of
 * the Home screen). Best-effort: a failed poll just leaves the previous
 * counts in place rather than flashing to 0, matching this app's
 * offline-first "never let a network hiccup blank out the UI" pattern.
 */
export function useOnlineCounts(
  session: AccountSession | undefined
): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!session) {
      return;
    }
    let cancelled = false;
    async function poll() {
      try {
        const result = await fetchOnlineCounts(session as AccountSession);
        if (!cancelled) {
          setCounts(result);
        }
      } catch {
        // Broker unreachable — keep showing the last known counts.
      }
    }
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session]);

  return counts;
}
