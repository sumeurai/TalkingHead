/**
 * Open API funnel ping: POST /v1/event-stats/increment
 * No Authorization — guests increment by count.
 * Do not report eventType 4 / 5 (backend derives those from usage).
 *
 * Uniqueness: localStorage once per browser + `anonId` for server-side distinct.
 */

export const API_ORIGINS = {
  prod: "https://api.sumeruai.us",
};

/** @deprecated use API_ORIGINS */
export const SITE_ORIGINS = API_ORIGINS;

export const TALKINGHEAD_BIZ_TYPE = "10";
export const TALKINGHEAD_PRODUCT = "talkinghead";
export const TALKINGHEAD_REPO = "sumeurai/TalkingHead";
export const TALKINGHEAD_EVENT_KEY = "sdk/talkinghead/install_success";
export const SDK_VERSION = "1.0.0";

export const EVENT_TYPE = {
  openLink: "0",
  download: "1",
  installSuccess: "2",
  createKey: "3",
};

const STORAGE_BROWSER_ID = "sumeru-th-browser-id";
const STORAGE_REPORTED = "sumeru-th-event-2";

let apiOrigin = API_ORIGINS.prod;

/** @param {string} origin — API origin, e.g. https://api.sumeruai.us */
export function setApiOrigin(origin) {
  if (!origin) return;
  apiOrigin = origin.replace(/\/$/, "").replace(/\/v1$/i, "");
}

/** @deprecated use setApiOrigin */
export function setSiteOrigin(origin) {
  setApiOrigin(origin);
}

export function getApiOrigin() {
  return apiOrigin;
}

/** @deprecated use getApiOrigin */
export function getSiteOrigin() {
  return apiOrigin;
}

export function getEventStatsUrl() {
  return `${apiOrigin}/v1/event-stats/increment`;
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

function getFromPage() {
  try {
    if (typeof location === "undefined") return "";
    return `${location.origin}${location.pathname}`.slice(0, 128);
  } catch {
    return "";
  }
}

function omitEmpty(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => {
      if (value === "" || value == null) return false;
      if (typeof value === "number" && !Number.isFinite(value)) return false;
      return true;
    }),
  );
}

/**
 * Body fields this Web SDK can fill. Not sent: packageName, unityVersion,
 * userId, keyId, plan, callCount7d, machineId, allBlank.
 */
export function buildInstallSuccessPayload({
  eventType = EVENT_TYPE.installSuccess,
  eventKey = TALKINGHEAD_EVENT_KEY,
  bizType = TALKINGHEAD_BIZ_TYPE,
  apiName = "createAvatar",
  fromPage,
  latencyMs,
} = {}) {
  const page = fromPage ?? getFromPage();
  const ms = Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : undefined;
  return omitEmpty({
    bizType,
    eventType,
    eventKey,
    product: TALKINGHEAD_PRODUCT,
    repo: TALKINGHEAD_REPO,
    anonId: getBrowserId(),
    fromPage: page,
    sdkVersion: SDK_VERSION,
    version: SDK_VERSION,
    apiName,
    latencyMs: ms,
  });
}

/**
 * Increment today's event count. Never throws.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.oncePerBrowser=true]
 * @param {number} [opts.latencyMs]
 * @param {string} [opts.fromPage]
 * @param {string} [opts.apiName]
 */
export async function incrementEventStat(opts = {}) {
  const {
    oncePerBrowser = true,
    ...payloadOpts
  } = opts;

  if (oncePerBrowser && alreadyReported()) {
    return { skipped: true, browserId: getBrowserId() };
  }

  const body = buildInstallSuccessPayload(payloadOpts);

  try {
    const res = await fetch(getEventStatsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
      body,
      browserId: body.anonId,
    };
  } catch (err) {
    return { ok: false, error: err, body, browserId: body.anonId };
  }
}

/** `createAvatar` onReady — install-success (eventType 2), once per browser. */
export function reportAvatarReady({ latencyMs } = {}) {
  void incrementEventStat({
    eventType: EVENT_TYPE.installSuccess,
    oncePerBrowser: true,
    apiName: "createAvatar",
    latencyMs,
  });
}
