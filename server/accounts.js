// every account this browser has signed into stays in one httpOnly cookie, so switching never asks for a passcode again
const MAX_SAVED = 5;
const TOKEN = /^[A-Za-z0-9%._-]{20,200}$/;

// tokens are stored url-encoded and joined with dots, base64 never has a dot in it
export function parseAccounts(value) {
  const seen = new Set();
  for (const part of String(value ?? "").split(".")) {
    if (!TOKEN.test(part)) continue;
    let token;
    try {
      token = decodeURIComponent(part);
    } catch {
      continue;
    }
    seen.add(token);
  }
  return [...seen].slice(-MAX_SAVED);
}

// newest signs in last, and signing in again to the same session moves it to the end
export function addAccount(tokens, token) {
  return [...tokens.filter((saved) => saved !== token), token].slice(-MAX_SAVED);
}

export const removeAccount = (tokens, token) => tokens.filter((saved) => saved !== token);

const ATTRS = "Path=/; HttpOnly; Secure; SameSite=Lax";

export function accountsCookie(tokens, maxAge) {
  if (!tokens.length) return `eightbit_accounts=; ${ATTRS}; Max-Age=0`;
  return `eightbit_accounts=${tokens.map(encodeURIComponent).join(".")}; ${ATTRS}; Max-Age=${maxAge}`;
}

export const sessionCookie = (token, maxAge) =>
  `eightbit_session=${encodeURIComponent(token)}; ${ATTRS}; Max-Age=${maxAge}`;
