"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { SignInDialog } from "./sign-in-dialog";
import { turnstileToken } from "./turnstile";

// Visitor state for a public site: who is signed in and which cards they
// voted for. Loaded after the (cached) page renders, from /api/public/me.

export type Voter = {
  name: string | null;
  email: string | null;
  verified: boolean;
};

type VoterState = {
  /** Account slug of this public site (/<site>/…). */
  site: string;
  workspaceId: string;
  embed: boolean;
  voter: Voter | null;
  voted: Set<string>;
  /** Vote totals changed in this session, by card id. */
  totals: Record<string, number>;
  toggleVote: (cardId: string) => Promise<void>;
  openSignIn: () => void;
  signOut: () => Promise<void>;
  setVoter: (voter: Voter | null) => void;
};

const VoterContext = createContext<VoterState | null>(null);

const STORAGE_KEY = "rr_vid";

function storedVisitor() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeVisitor(token: unknown) {
  if (typeof token !== "string") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Storage blocked: the cookie (if allowed) still identifies the visitor.
  }
}

/** Which public site a call is for, and whether it runs in an embed. */
export type ApiScope = { site: string; embed: boolean };

/**
 * fetch() for /api/public/*: same-origin cookies + embed fallbacks. The
 * account comes from `x-rr-site` (the site's slug); the server resolves it.
 */
export async function publicApi<T>(
  path: string,
  { site, embed }: ApiScope,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-rr-site": site,
  };
  if (embed) headers["x-rr-embed"] = "1";
  const visitor = storedVisitor();
  if (visitor) headers["x-rr-visitor"] = visitor;
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers,
    credentials: "same-origin",
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    visitor?: string;
  };
  storeVisitor(data.visitor);
  return { ok: res.ok, status: res.status, data };
}

export function VoterProvider({
  site,
  workspaceId,
  embed,
  children,
}: {
  site: string;
  workspaceId: string;
  embed: boolean;
  children: ReactNode;
}) {
  const [voter, setVoter] = useState<Voter | null>(null);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [signInOpen, setSignInOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await publicApi<{ voter: Voter | null; voted: string[] }>(
      `/api/public/me?workspace=${workspaceId}`,
      { site, embed },
    );
    if (!res.ok) return;
    setVoter(res.data.voter);
    setVoted(new Set(res.data.voted));
  }, [site, workspaceId, embed]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleVote = useCallback(
    async (cardId: string) => {
      if (pending) return;
      setPending(cardId);
      try {
        const token = voter?.verified ? undefined : await turnstileToken();
        const res = await publicApi<{
          voted: boolean;
          total: number;
          signIn?: boolean;
        }>(
          "/api/public/votes",
          { site, embed },
          {
            method: "POST",
            body: { cardId, turnstileToken: token },
          },
        );
        if (res.status === 401 && res.data.signIn) {
          setSignInOpen(true);
          toast.info("Log in to vote.");
          return;
        }
        if (!res.ok) {
          toast.error(res.data.error ?? "Couldn't save your vote.");
          return;
        }
        setVoted((all) => {
          const next = new Set(all);
          if (res.data.voted) next.add(cardId);
          else next.delete(cardId);
          return next;
        });
        setTotals((all) => ({ ...all, [cardId]: res.data.total }));
        // A short note instead of LoopedIn's modal (doc 22 P4).
        toast.success(res.data.voted ? "Vote added" : "Vote removed");
      } catch {
        toast.error("Couldn't save your vote.");
      } finally {
        setPending(null);
      }
    },
    [site, embed, pending, voter],
  );

  const signOut = useCallback(async () => {
    await publicApi(
      "/api/public/auth/sign-out",
      { site, embed },
      { method: "POST" },
    );
    setVoter(null);
    await refresh();
  }, [site, embed, refresh]);

  const value = useMemo<VoterState>(
    () => ({
      site,
      workspaceId,
      embed,
      voter,
      voted,
      totals,
      toggleVote,
      openSignIn: () => setSignInOpen(true),
      signOut,
      setVoter: (next) => {
        setVoter(next);
        void refresh();
      },
    }),
    [
      site,
      workspaceId,
      embed,
      voter,
      voted,
      totals,
      toggleVote,
      signOut,
      refresh,
    ],
  );

  return (
    <VoterContext.Provider value={value}>
      {children}
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </VoterContext.Provider>
  );
}

export function useVoter() {
  const ctx = useContext(VoterContext);
  if (!ctx) throw new Error("useVoter must be used inside <VoterProvider>");
  return ctx;
}
