import { attributionFromUrl, regionHint } from "./attribution";
import { ensureAdCookies, useConsentStore } from "./consent";
import {
  MAX_EVENTS_PER_BATCH,
  validateClientEvent,
  type AnalyticsContext,
  type Attribution,
  type ClientEvent,
  type ClientEventName,
  type ClientEventProps,
} from "./events";

/**
 * First-party, allowlisted event tracker. Events go to our own /api/events endpoint
 * (not to a third-party script), which forwards them to the configured providers.
 */

const ENDPOINT = "/api/events";
const SID_KEY = "mxva.sid";
const ATTRIBUTION_KEY = "mxva.attribution";

let queue: ClientEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let memorySid: string | undefined;
let attribution: Attribution = {};
let region: string | undefined;
let pendingFbclid: string | null = null;
let installed = false;

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeSession(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** In memory only, unless analytics consent allows keeping it for the tab session. */
function sessionId(): string {
  const consent = useConsentStore.getState();
  if (consent.analytics) {
    const storage = safeSession();
    const stored = storage?.getItem(SID_KEY);
    if (stored && /^[a-f0-9]{32}$/.test(stored)) return stored;
    memorySid ??= randomId();
    try {
      storage?.setItem(SID_KEY, memorySid);
    } catch {
      // ignore
    }
    return memorySid;
  }
  memorySid ??= randomId();
  return memorySid;
}

function currentPath(): string {
  const path = window.location.pathname.toLowerCase().replace(/\/+$/, "") || "/";
  return /^\/[a-z0-9\-/]*$/.test(path) ? path.slice(0, 80) : "/";
}

function context(): AnalyticsContext {
  const consent = useConsentStore.getState();
  return {
    sid: sessionId(),
    path: currentPath(),
    attribution,
    regionHint: region,
    consent: { analytics: consent.analytics, marketing: consent.marketing },
  };
}

function send(events: ClientEvent[], useBeacon: boolean): void {
  // text/plain keeps sendBeacon a simple request; the server parses and validates JSON.
  const body = JSON.stringify({ context: context(), events });
  if (useBeacon && typeof navigator.sendBeacon === "function") {
    if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain;charset=UTF-8" }))) return;
  }
  void fetch(ENDPOINT, {
    method: "POST",
    body,
    keepalive: true,
    credentials: "same-origin",
    headers: { "content-type": "text/plain;charset=UTF-8" },
  }).catch(() => undefined);
}

export function flush(useBeacon = false): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;
  while (queue.length > 0) send(queue.splice(0, MAX_EVENTS_PER_BATCH), useBeacon);
}

export function track<N extends ClientEventName>(name: N, props: ClientEventProps<N>): void {
  if (typeof window === "undefined") return;
  if (!validateClientEvent(name, props)) {
    if (process.env.NODE_ENV !== "production") console.warn(`[analytics] dropped invalid event "${name}"`);
    return;
  }
  queue.push({ name, props: props as Record<string, unknown>, ts: Date.now() });
  if (queue.length >= 10) flush();
  else flushTimer ??= setTimeout(() => flush(), 1500);
}

/** Captures attribution once per tab and wires flush-on-hide. Call once on the client. */
export function installAnalytics(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  useConsentStore.getState().load();

  const storage = safeSession();
  const fromUrl = attributionFromUrl(window.location.search, document.referrer, window.location.hostname);
  const stored = (() => {
    try {
      return JSON.parse(storage?.getItem(ATTRIBUTION_KEY) ?? "null") as Attribution | null;
    } catch {
      return null;
    }
  })();
  // First touch in this tab wins; a new campaign click replaces it.
  attribution = fromUrl.utmSource || fromUrl.adClick || !stored ? fromUrl : stored;
  pendingFbclid = new URLSearchParams(window.location.search).get("fbclid");

  region = regionHint(Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.languages ?? [navigator.language]);

  const persistIfAllowed = () => {
    const consent = useConsentStore.getState();
    if (consent.analytics) {
      try {
        storage?.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
      } catch {
        // ignore
      }
    }
    if (consent.marketing) ensureAdCookies(pendingFbclid);
  };
  persistIfAllowed();
  useConsentStore.subscribe(persistIfAllowed);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", () => flush(true));
}

/** Test hook. */
export function resetAnalyticsForTests(): void {
  queue = [];
  memorySid = undefined;
  attribution = {};
  region = undefined;
  pendingFbclid = null;
  installed = false;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;
}

export function pendingEventsForTests(): readonly ClientEvent[] {
  return queue;
}
