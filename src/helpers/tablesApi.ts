import { brokerUrl } from "./broker";
import { AccountSession } from "./account";

export type SyncEntityType = "table" | "character" | "monster" | "rule_option";

export type SyncOp = {
  entityType: SyncEntityType;
  id: string;
  baseVersion: number;
  deleted?: boolean;
  patch?: Record<string, unknown>;
};

export type OpResult = {
  id: string;
  version?: number;
  canonical?: unknown;
  error?: string;
};

export type SyncResponse = {
  accepted: OpResult[];
  conflicts: OpResult[];
  rejected: OpResult[];
};

export type Change = {
  seq: number;
  entityType: SyncEntityType;
  entityId: string;
  tableId: string;
  version: number;
  updatedAt: number;
  deleted: boolean;
  data: unknown;
};

export type ChangesResponse = {
  changes: Change[];
  cursor: number;
  serverTime: number;
};

async function errorFrom(response: Response, fallback: string): Promise<Error> {
  try {
    const body = await response.json();
    return new Error(body?.error || fallback);
  } catch {
    return new Error(fallback);
  }
}

function requireBroker(): string {
  if (!brokerUrl) {
    throw new Error("No server configured, sync is unavailable");
  }
  return brokerUrl;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** GET /sync?since=<cursor>. */
export async function fetchChangesSince(
  session: AccountSession,
  since: number
): Promise<ChangesResponse> {
  const response = await fetch(
    `${requireBroker()}/sync?since=${encodeURIComponent(String(since))}`,
    { headers: authHeaders(session.token) }
  );
  if (!response.ok) {
    throw await errorFrom(response, "Unable to fetch changes");
  }
  return response.json();
}

/** POST /sync — drains a batch of outbox ops in one request. */
export async function postSyncOps(
  session: AccountSession,
  ops: SyncOp[]
): Promise<SyncResponse> {
  const response = await fetch(`${requireBroker()}/sync`, {
    method: "POST",
    headers: authHeaders(session.token),
    body: JSON.stringify({ ops }),
  });
  if (!response.ok) {
    throw await errorFrom(response, "Unable to sync changes");
  }
  return response.json();
}

/** POST /tables/{id}/join — idempotent. */
export async function joinTable(
  session: AccountSession,
  tableId: string
): Promise<{ role: "gm" | "player" }> {
  const response = await fetch(
    `${requireBroker()}/tables/${encodeURIComponent(tableId)}/join`,
    { method: "POST", headers: authHeaders(session.token) }
  );
  if (!response.ok) {
    throw await errorFrom(response, "Unable to join table");
  }
  return response.json();
}

/** GET /tables/online — "Usuários Online" badge: how many clients
 * are live in each Mesa's game room right now. A Mesa with nobody
 * connected is simply absent from the response (see hub.go's
 * OnlineCounts), so callers should default any missing id to 0. */
export async function fetchOnlineCounts(
  session: AccountSession
): Promise<Record<string, number>> {
  const response = await fetch(`${requireBroker()}/tables/online`, {
    headers: authHeaders(session.token),
  });
  if (!response.ok) {
    throw await errorFrom(response, "Unable to fetch online counts");
  }
  return response.json();
}
