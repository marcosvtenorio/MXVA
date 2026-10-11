import { attributionSchema, type Attribution } from "./events";

/**
 * Campaign attribution and a coarse region, derived without cookies or IP lookups:
 * UTM parameters, whether an ad click id was present, the referring domain, and the
 * country implied by the device time zone (falling back to the browser locale).
 */

const UTM_KEYS = {
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_content: "utmContent",
  utm_term: "utmTerm",
} as const;

function clean(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, 100);
  if (!trimmed || trimmed.includes("@") || !/^[\w\-. +%|:/]*$/u.test(trimmed)) return undefined;
  return trimmed;
}

export function attributionFromUrl(search: string, referrer: string, ownHost: string): Attribution {
  const params = new URLSearchParams(search);
  const result: Attribution = {};
  for (const [param, key] of Object.entries(UTM_KEYS)) {
    const value = clean(params.get(param));
    if (value) result[key] = value;
  }
  if (params.has("fbclid")) result.adClick = "meta";
  else if (params.has("gclid") || params.has("gbraid") || params.has("wbraid")) result.adClick = "google";
  else if (params.has("ttclid")) result.adClick = "tiktok";

  try {
    const host = referrer ? new URL(referrer).hostname.toLowerCase() : "";
    if (host && host !== ownHost && /^[a-z0-9.-]+$/.test(host)) result.referrerDomain = host.slice(0, 100);
  } catch {
    // ignore malformed referrers
  }
  const parsed = attributionSchema.safeParse(result);
  return parsed.success ? parsed.data : {};
}

// Time zones of the cohort markets (and close neighbours) → ISO country.
const ZONE_COUNTRY: Record<string, string> = {
  "America/Sao_Paulo": "BR",
  "America/Fortaleza": "BR",
  "America/Recife": "BR",
  "America/Bahia": "BR",
  "America/Belem": "BR",
  "America/Manaus": "BR",
  "America/Cuiaba": "BR",
  "America/Campo_Grande": "BR",
  "America/Porto_Velho": "BR",
  "America/Boa_Vista": "BR",
  "America/Rio_Branco": "BR",
  "America/Araguaina": "BR",
  "America/Maceio": "BR",
  "America/Noronha": "BR",
  "America/Santarem": "BR",
  "America/Eirunepe": "BR",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Phoenix": "US",
  "America/Anchorage": "US",
  "America/Detroit": "US",
  "America/Boise": "US",
  "Pacific/Honolulu": "US",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Edmonton": "CA",
  "America/Winnipeg": "CA",
  "America/Halifax": "CA",
  "America/St_Johns": "CA",
  "America/Regina": "CA",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Perth": "AU",
  "Australia/Adelaide": "AU",
  "Australia/Hobart": "AU",
  "Australia/Darwin": "AU",
  "Pacific/Auckland": "NZ",
  "Europe/Lisbon": "PT",
  "Europe/Madrid": "ES",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "America/Mexico_City": "MX",
  "America/Bogota": "CO",
  "America/Santiago": "CL",
  "America/Lima": "PE",
  "America/Argentina/Buenos_Aires": "AR",
  "Asia/Kolkata": "IN",
  "Asia/Manila": "PH",
  "Asia/Dubai": "AE",
  "Africa/Lagos": "NG",
  "Africa/Johannesburg": "ZA",
};

export function regionHint(timeZone: string | undefined, locales: readonly string[]): string | undefined {
  if (timeZone) {
    const zoned = ZONE_COUNTRY[timeZone];
    if (zoned) return zoned;
    if (timeZone.startsWith("America/Indiana/") || timeZone.startsWith("America/Kentucky/")) return "US";
    if (timeZone.startsWith("America/Argentina/")) return "AR";
  }
  for (const locale of locales) {
    const region = /^[a-z]{2,3}-([A-Z]{2})\b/.exec(locale)?.[1];
    if (region) return region;
  }
  return undefined;
}
