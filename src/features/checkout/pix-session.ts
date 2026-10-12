import type { PixSession } from "./store";

/**
 * Keeps an open PIX code across a reload of this tab. Phones often reload the page while the
 * buyer is in their bank app; showing a new code then would risk paying the old one unseen.
 * Holds only the copy-and-paste code, its expiry and price: no personal data, no ids, no images.
 */
const KEY = "mxva_pix";

export function savePixSession(session: PixSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Private mode or storage blocked: the code still works in this page.
  }
}

export function loadPixSession(): PixSession | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return undefined;
    const session = JSON.parse(raw) as PixSession;
    if (session?.checkout?.mode !== "pix" || typeof session.checkout.brCode !== "string") return undefined;
    if (Date.parse(session.checkout.expiresAt) <= Date.now()) {
      clearPixSession();
      return undefined;
    }
    return session;
  } catch {
    return undefined;
  }
}

export function clearPixSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
