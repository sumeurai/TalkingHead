/**
 * C-end funnel ping: POST /web-api/portrait/event-stats/increment
 * No Authorization — guests increment by count.
 * Do not report eventType 4 / 5 (backend derives those from usage).
 *
 * Uniqueness is per browser profile + site origin (`localStorage`).
 * The increment API has no client-id field, so we only send once from this browser.
 */

export const SITE_ORIGINS = {
  prod: "https://www.sumeruai.us",
  test: "https://overseas.sumeruai.com",
};

/** TalkingHead on the funnel page. */
export const TALKINGHEAD_BIZ_TYPE = "10";
/** GitHub owner/repo. */
export const TALKINGHEAD_EVENT_KEY = "sumeurai/TalkingHead";

export const EVENT_TYPE = {
  openLink: "0",
  download: "1",
  installSuccess: "2",
  createKey: "3",
};

const STORAGE_BROWSER_ID = "sumeru-th-browser-id";
const STORAGE_REPORTED = "sumeru-th-event-2";

let siteOrigin = SITE_ORIGINS.prod;

/** @param {string} origin — site origin, e.g. https://www.sumeruai.us */
export function setSiteOrigin(origin) {
  if (!origin) return;
  siteOrigin = origin.replace(/\/$/, "");
}

export function getSiteOrigin() {
  return siteOrigin;
}

export function getEventStatsUrl() {
  return `${siteOrigin}/web-api/portrait/event-stats/increment`;
}

function storageGet(key) {
  try {
    if (typeof localStorage === "undefined") return "";
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function storageSet(key, value) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Stable id for this browser profile on this origin (not a computer serial). */
export function getBrowserId() {
  let id = storageGet(STORAGE_BROWSER_ID);
  if (id) return id;
  id =
    globalThis.crypto?.randomUUID?.() ||
    `th-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  storageSet(STORAGE_BROWSER_ID, id);
  return id;
}

function alreadyReported() {
  return storageGet(STORAGE_REPORTED) === "1";
}

function markReported() {
  getBrowserId();
  storageSet(STORAGE_REPORTED, "1");
}

/**
 * Increment today's event count. Never throws.
 *
 * @param {object} [opts]
 * @param {string} [opts.eventType="2"]
 * @param {string} [opts.eventKey]
 * @param {string} [opts.bizType]
 * @param {boolean} [opts.oncePerBrowser=true] — one ping per browser profile (localStorage)
 */
export async function incrementEventStat({
  eventType = EVENT_TYPE.installSuccess,
  eventKey = TALKINGHEAD_EVENT_KEY,
  bizType = TALKINGHEAD_BIZ_TYPE,
  oncePerBrowser = true,
} = {}) {
  if (oncePerBrowser && alreadyReported()) {
    return { skipped: true, browserId: getBrowserId() };
  }

  try {
    const res = await fetch(getEventStatsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bizType, eventType, eventKey }),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (res.ok && oncePerBrowser) markReported();
    return {
      ok: res.ok,
      status: res.status,
      json,
      text,
      browserId: getBrowserId(),
    };
  } catch (err) {
    return { ok: false, error: err, browserId: getBrowserId() };
  }
}

/** `createAvatar` onReady — install-success (eventType 2), once per browser. */
export function reportAvatarReady() {
  void incrementEventStat({
    eventType: EVENT_TYPE.installSuccess,
    oncePerBrowser: true,
  });
}
