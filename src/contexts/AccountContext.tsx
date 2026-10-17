import React, {
  useState,
  useEffect,
  useContext,
  useCallback,
} from "react";

import {
  AccountSession,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
} from "../helpers/account";
import { loadAccountSession, storeAccountSession } from "../helpers/accountSession";
import { getLaunchSpectatorSession } from "../helpers/spectator";

export type AccountContextValue = {
  /** undefined while the stored session is still being read from IndexedDB */
  session: AccountSession | undefined;
  /** true once loadAccountSession() has resolved (even to "no session") */
  isLoaded: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    password: string,
    displayName: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  /** Session expired or was rejected server side — drop it without a network call */
  clearSession: () => void;
};

const AccountContext = React.createContext<AccountContextValue | undefined>(
  undefined
);

/**
 * Owns the logged in account's identity. Deliberately separate from a
 * per-game join password AuthContext used to require — that password was
 * removed, with no substitute, once the tailnet became the security
 * perimeter instead.
 */
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AccountSession | undefined>(
    undefined
  );
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // A spectator window's WebView2 profile is deliberately
    // separate from the Mestre's own (see desktop/main.go's
    // WebviewUserDataPath comment) so the two processes never fight over
    // the same IndexedDB — but that means this profile's own
    // loadAccountSession() always comes back empty on first launch. Prefer
    // the session the launcher handed over (desktop/main.go's
    // --spectator-session flag) so the window opens already logged in as
    // the SAME account, and persist it locally so a later reload of this
    // same spectator window doesn't need the flag again.
    getLaunchSpectatorSession().then(async (launchSession) => {
      if (cancelled) {
        return;
      }
      if (launchSession) {
        await storeAccountSession(launchSession);
        if (!cancelled) {
          setSession(launchSession);
          setIsLoaded(true);
        }
        return;
      }
      loadAccountSession().then((stored) => {
        if (!cancelled) {
          setSession(stored);
          setIsLoaded(true);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const newSession = await apiLogin(username, password);
    await storeAccountSession(newSession);
    setSession(newSession);
  }, []);

  const register = useCallback(
    async (username: string, password: string, displayName: string) => {
      await apiRegister(username, password, displayName);
      await login(username, password);
    },
    [login]
  );

  const logout = useCallback(async () => {
    if (session) {
      await apiLogout(session.token);
    }
    await storeAccountSession(undefined);
    setSession(undefined);
  }, [session]);

  const clearSession = useCallback(() => {
    storeAccountSession(undefined);
    setSession(undefined);
  }, []);

  const value: AccountContextValue = {
    session,
    isLoaded,
    login,
    register,
    logout,
    clearSession,
  };

  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error("useAccount must be used within an AccountProvider");
  }
  return context;
}

export default AccountContext;
