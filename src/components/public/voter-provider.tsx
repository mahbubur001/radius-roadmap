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
import type { ArticleRating } from "@/lib/schemas/articles";
import { SignInDialog } from "./sign-in-dialog";
import { turnstileToken } from "./turnstile";

// Visitor state for a public site: who is signed in, which cards and ideas
// they voted for, and their ideas waiting for review. Loaded after the (cached) page renders, from /api/public/me.

export type Voter = {
  name: string | null;
  email: string | null;
  verified: boolean;
};

/** What a vote is for: a roadmap card or a public idea. */
export type VoteKind = "card" | "idea";

/** The visitor's own idea still waiting for the team's review. */
export type PendingIdea = { id: string; boardId: string; title: string };

type VoterState = {
  /** Account slug of this public site (/<site>/…). */
  site: string;
  workspaceId: string;
  embed: boolean;
  voter: Voter | null;
  voted: Set<string>;
  /** Vote totals changed in this session, by card or idea id. */
  totals: Record<string, number>;
  toggleVote: (id: string, kind?: VoteKind) => Promise<void>;
  pendingIdeas: PendingIdea[];
  addPendingIdea: (idea: PendingIdea) => void;
  /** Ideas the logged-in voter follows. */
  following: Set<string>;
  toggleFollow: (feedbackId: string) => Promise<void>;
  /** "<postId>:<emoji>" the visitor reacted with. */
  reactions: Set<string>;
  /** Reaction counts changed in this session, by "<postId>:<emoji>". */
  reactionTotals: Record<string, number>;
  toggleReaction: (postId: string, emoji: string) => Promise<void>;
  /** articleId → the visitor's "Was this helpful?" answer. */
  ratings: Record<string, ArticleRating>;
  rateArticle: (
    articleId: string,
    value: ArticleRating | null,
  ) => Promise<boolean>;
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
  const [pendingIdeas, setPendingIdeas] = useState<PendingIdea[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [reactions, setReactions] = useState<Set<string>>(new Set());
  const [reactionTotals, setReactionTotals] = useState<Record<string, number>>(
    {},
  );
  const [ratings, setRatings] = useState<Record<string, ArticleRating>>({});

  const refresh = useCallback(async () => {
    const res = await publicApi<{
      voter: Voter | null;
      voted: string[];
      pending?: PendingIdea[];
      following?: string[];
      reactions?: string[];
      ratings?: Record<string, ArticleRating>;
    }>(`/api/public/me?workspace=${workspaceId}`, { site, embed });
    if (!res.ok) return;
    setVoter(res.data.voter);
    setVoted(new Set(res.data.voted));
    setPendingIdeas(res.data.pending ?? []);
    setFollowing(new Set(res.data.following ?? []));
    setReactions(new Set(res.data.reactions ?? []));
    setRatings(res.data.ratings ?? {});
  }, [site, workspaceId, embed]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleVote = useCallback(
    async (cardId: string, kind: VoteKind = "card") => {
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
            body: {
              ...(kind === "idea" ? { feedbackId: cardId } : { cardId }),
              turnstileToken: token,
            },
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

  const toggleFollow = useCallback(
    async (feedbackId: string) => {
      if (!voter) {
        setSignInOpen(true);
        toast.info("Log in to follow ideas.");
        return;
      }
      const follow = !following.has(feedbackId);
      const res = await publicApi(
        "/api/public/follows",
        { site, embed },
        { method: "POST", body: { feedbackId, follow } },
      );
      if (!res.ok) {
        toast.error(res.data.error ?? "Couldn't update.");
        return;
      }
      setFollowing((all) => {
        const next = new Set(all);
        if (follow) next.add(feedbackId);
        else next.delete(feedbackId);
        return next;
      });
      toast.success(follow ? "Following this idea" : "Unfollowed");
    },
    [site, embed, voter, following],
  );

  const toggleReaction = useCallback(
    async (postId: string, emoji: string) => {
      const key = `${postId}:${emoji}`;
      const res = await publicApi<{ reacted: boolean; count: number }>(
        "/api/public/reactions",
        { site, embed },
        { method: "POST", body: { updateId: postId, emoji } },
      );
      if (!res.ok) {
        toast.error(res.data.error ?? "Couldn't save your reaction.");
        return;
      }
      setReactions((all) => {
        const next = new Set(all);
        if (res.data.reacted) next.add(key);
        else next.delete(key);
        return next;
      });
      setReactionTotals((all) => ({ ...all, [key]: res.data.count }));
    },
    [site, embed],
  );

  const rateArticle = useCallback(
    async (articleId: string, value: ArticleRating | null) => {
      const res = await publicApi<{ value: ArticleRating | null }>(
        "/api/public/article-ratings",
        { site, embed },
        { method: "POST", body: { articleId, value } },
      );
      if (!res.ok) {
        toast.error(res.data.error ?? "Couldn't save your answer.");
        return false;
      }
      setRatings((all) => {
        const { [articleId]: _old, ...rest } = all;
        return value ? { ...rest, [articleId]: value } : rest;
      });
      return true;
    },
    [site, embed],
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
      pendingIdeas,
      addPendingIdea: (idea) => setPendingIdeas((all) => [idea, ...all]),
      following,
      toggleFollow,
      reactions,
      reactionTotals,
      toggleReaction,
      ratings,
      rateArticle,
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
      pendingIdeas,
      following,
      toggleFollow,
      reactions,
      reactionTotals,
      toggleReaction,
      ratings,
      rateArticle,
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
