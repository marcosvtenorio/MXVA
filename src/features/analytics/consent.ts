import { create } from "zustand";

/**
 * Tracking consent, kept in a first-party cookie so the server can honour it too.
 * Without consent MXVA still counts anonymous, cookieless funnel events (no device
 * storage, no IP, no ad identifiers). With consent: a per-tab session id for steadier
 * funnels (analytics), and Meta ad measurement via the Conversions API (marketing).
 */

export const CONSENT_COOKIE = "mxva_consent";
export const CONSENT_VERSION = 1;
const MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export type ConsentChoice = { analytics: boolean; marketing: boolean };
export type ConsentState = ConsentChoice & { decided: boolean };

export function parseConsentCookie(value: string | undefined): ConsentState {
  const match = /^v(\d+)\.a([01])\.m([01])$/.exec(value ?? "");
  if (!match || Number(match[1]) !== CONSENT_VERSION) return { analytics: false, marketing: false, decided: false };
  return { analytics: match[2] === "1", marketing: match[3] === "1", decided: true };
}

export function serializeConsent(choice: ConsentChoice): string {
  return `v${CONSENT_VERSION}.a${choice.analytics ? 1 : 0}.m${choice.marketing ? 1 : 0}`;
}

export function readCookie(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function writeConsentCookie(choice: ConsentChoice): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(choice)}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

type ConsentStore = ConsentState & {
  loaded: boolean;
  load: () => void;
  choose: (choice: ConsentChoice) => void;
};

export const useConsentStore = create<ConsentStore>()((set, get) => ({
  analytics: false,
  marketing: false,
  decided: false,
  loaded: false,
  load: () => {
    if (get().loaded || typeof document === "undefined") return;
    set({ ...parseConsentCookie(readCookie(document.cookie, CONSENT_COOKIE)), loaded: true });
  },
  choose: (choice) => {
    writeConsentCookie(choice);
    if (!choice.marketing) clearAdCookies();
    set({ ...choice, decided: true, loaded: true });
  },
}));

/** First-party Meta browser ids (same format the Meta Pixel uses), only with marketing consent. */
export const FBP_COOKIE = "_fbp";
export const FBC_COOKIE = "_fbc";
const AD_COOKIE_MAX_AGE = 90 * 24 * 60 * 60;

export function ensureAdCookies(fbclid: string | null): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const now = Date.now();
  if (!readCookie(document.cookie, FBP_COOKIE)) {
    const random = Math.floor(Math.random() * 1e10).toString().padStart(10, "0");
    document.cookie = `${FBP_COOKIE}=fb.1.${now}.${random}; Path=/; Max-Age=${AD_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  }
  if (fbclid && /^[\w-]{10,500}$/.test(fbclid)) {
    document.cookie = `${FBC_COOKIE}=fb.1.${now}.${fbclid}; Path=/; Max-Age=${AD_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  }
}

function clearAdCookies(): void {
  if (typeof document === "undefined") return;
  for (const name of [FBP_COOKIE, FBC_COOKIE]) document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}
