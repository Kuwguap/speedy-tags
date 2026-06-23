/**
 * Small helper around localStorage for the Kingsman session token.
 * The token is a long random string issued by the server when the user
 * pays (auto-account) or clicks a magic link.
 */

const KEY = "kingsman_session";

export function getSession(): string {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function setSession(token: string) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearSession() {
  setSession("");
}
