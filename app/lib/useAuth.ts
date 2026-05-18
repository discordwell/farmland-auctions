"use client";

import { useCallback, useEffect, useState } from "react";

export type AuthUser = {
  id: string;
  email: string;
  role: "admin" | "user";
  displayName: string;
};

type AuthState = {
  user: AuthUser | null;
  status: "loading" | "ready";
};

async function fetchMe(signal?: AbortSignal): Promise<AuthUser | null> {
  const response = await fetch("/api/auth/me", {
    credentials: "include",
    signal
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { user: AuthUser | null };
  return payload.user;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const user = await fetchMe();
      setState({ user, status: "ready" });
      return user;
    } catch {
      setState({ user: null, status: "ready" });
      return null;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchMe(controller.signal)
      .then((user) => setState({ user, status: "ready" }))
      .catch(() => setState({ user: null, status: "ready" }));
    return () => controller.abort();
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", {
      credentials: "include",
      method: "POST"
    });
    setState({ user: null, status: "ready" });
  }, []);

  return {
    user: state.user,
    status: state.status,
    refresh,
    signOut
  };
}

export async function loginRequest(email: string, password: string) {
  const response = await fetch("/api/auth/login", {
    body: JSON.stringify({ email, password }),
    credentials: "include",
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const payload = (await response.json().catch(() => ({}))) as {
    user?: AuthUser;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(payload.message ?? "Email or password is incorrect");
  }
  return payload.user as AuthUser;
}

export async function signupRequest(
  email: string,
  password: string,
  displayName: string
) {
  const response = await fetch("/api/auth/signup", {
    body: JSON.stringify({ email, password, displayName }),
    credentials: "include",
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const payload = (await response.json().catch(() => ({}))) as {
    user?: AuthUser;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(payload.message ?? "Could not create the account");
  }
  return payload.user as AuthUser;
}
