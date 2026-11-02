/** Shared production gateway configuration for TalkingHead API helpers. */
export const DEFAULT_API_ORIGIN = "https://api.mugen3d.ai";

export const API_ORIGINS = {
  overseas: DEFAULT_API_ORIGIN,
  prod: DEFAULT_API_ORIGIN,
};

/** Accept either a gateway origin or its /v1 base URL. */
export function normalizeApiOrigin(origin) {
  return origin.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}
