const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

export type TwiTokUser = {
  id?: string; _id?: string; email?: string | null; phone?: string | null;
  username?: string | null; nickname?: string | null; profileSetupComplete?: boolean; isVerified?: boolean;
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("twitok_user_token");
}
export function setToken(token: string) { if (typeof window !== "undefined") window.localStorage.setItem("twitok_user_token", token); }
export function clearToken() { if (typeof window !== "undefined") window.localStorage.removeItem("twitok_user_token"); }

export async function authRequest(path: string, init: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", "Bearer " + token);
  return fetch(API + path, { ...init, headers, credentials: "include", cache: "no-store" });
}
export async function getCurrentUser(): Promise<TwiTokUser | null> {
  const response = await authRequest("/auth/me");
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  return data.user ?? null;
}
export async function signOut() {
  try { await authRequest("/auth/logout", { method: "POST" }); }
  finally {
    clearToken();
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("twitok:auth-changed", { detail: { authenticated: false } }));
  }
}
