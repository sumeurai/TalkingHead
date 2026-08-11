const DEFAULT_EMOTE_FILE = "./demo/assets/welcome-emote.json";
const DEFAULT_AUDIO_FILE = "./demo/assets/welcome.wav";

/**
 * @typedef {{
 *   apiOrigin?: string,
 *   voiceId?: string,
 *   modelId?: string,
 *   downloadLink?: string,
 *   welcomeText?: string,
 *   audioKey?: string,
 *   emoteKey?: string,
 *   emoteFile?: string,
 *   fps?: number,
 *   audioFile?: string,
 * }} AssetsCache
 */

/** Load committed demo asset ids (model / voice / downloadLink / drive URLs). */
export async function loadAssetsCache() {
  try {
    const res = await fetch("./demo/assets-cache.json", { cache: "no-cache" });
    if (!res.ok) return null;
    return /** @type {AssetsCache} */ (await res.json());
  } catch {
    return null;
  }
}

/** Fetch bundled welcome wav from demo/assets/. */
export async function fetchBundledAudio(url = DEFAULT_AUDIO_FILE) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Audio not found: ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Load bundled emote JSON from demo/assets/.
 * @returns {Promise<{ AK: string, ABI: string, ATI: string, API: string, fps?: number, modelId?: string } | null>}
 */
export async function loadBundledEmote(url = DEFAULT_EMOTE_FILE) {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.AK || !data?.ABI || !data?.ATI || !data?.API) return null;
    return data;
  } catch {
    return null;
  }
}

/** Build AvatarJS drive payload from local emote json + wav (no API). */
export async function buildBundledDrive(emoteUrl, audioUrl) {
  const emote = await loadBundledEmote(emoteUrl);
  if (!emote) throw new Error(`Bundled emote not found: ${emoteUrl}`);
  const audioArray = await fetchBundledAudio(audioUrl);
  return {
    AK: emote.AK,
    ABI: emote.ABI,
    ATI: emote.ATI,
    API: emote.API,
    fps: emote.fps ?? 25,
    modelId: emote.modelId,
    num_frames: emote.num_frames,
    audioArray,
    status: "end",
  };
}

export { DEFAULT_EMOTE_FILE, DEFAULT_AUDIO_FILE };
