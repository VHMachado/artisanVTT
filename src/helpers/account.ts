import { brokerUrl } from "./broker";

export type AccountSession = {
  username: string;
  displayName: string;
  token: string;
  /** Numeric account id — needed locally to compare "is this mine?"
   * before a round trip; the server always re-verifies ownership itself
   * ("quem é dono é sempre carimbado pelo servidor"). */
  accountId: number;
};

/** Throw the server supplied message rather than a bare status code */
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
    throw new Error("No server configured, accounts are unavailable");
  }
  return brokerUrl;
}

/** True when this build points at a server that can hold accounts */
export const accountsAvailable = Boolean(brokerUrl);

export async function register(
  username: string,
  password: string,
  displayName: string
): Promise<void> {
  const response = await fetch(`${requireBroker()}/account/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, displayName }),
  });
  if (!response.ok) {
    throw await errorFrom(response, "Unable to create account");
  }
}

export async function login(
  username: string,
  password: string
): Promise<AccountSession> {
  const response = await fetch(`${requireBroker()}/account/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw await errorFrom(response, "Unable to log in");
  }
  return response.json();
}

export async function logout(token: string): Promise<void> {
  await fetch(`${requireBroker()}/account/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}

/** Upload a full database backup for the logged in account */
export async function uploadBackup(
  token: string,
  data: Blob
): Promise<{ size: number; updatedAt: number }> {
  const response = await fetch(`${requireBroker()}/account/backup`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body: data,
  });
  if (!response.ok) {
    throw await errorFrom(response, "Unable to save backup");
  }
  return response.json();
}

/** Download the backup for the logged in account, null when none saved yet */
export async function downloadBackup(token: string): Promise<Blob | null> {
  const response = await fetch(`${requireBroker()}/account/backup`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw await errorFrom(response, "Unable to load backup");
  }
  return response.blob();
}
