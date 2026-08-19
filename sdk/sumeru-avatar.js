/**
 * Thin wrapper around AvatarJS (CDN) with local same-directory Workers.
 */

import { reportAvatarReady, setSiteOrigin } from "./sumeru-event-stats.js";

export const AVATAR_JS_CDN =
  "https://static.sumeruai.com/new-avatars/AvatarJS.js";

let avatarModulePromise = null;

export function loadAvatarJS() {
  if (!avatarModulePromise) {
    avatarModulePromise = import(/* @vite-ignore */ AVATAR_JS_CDN);
  }
  return avatarModulePromise;
}

/**
 * Clone drive payload before `receiveData`.
 * AvatarJS `decodeAudioData` detaches `audioArray.buffer`; reuse the same object on replay throws.
 */
export function cloneDrivePayload(data) {
  if (!data || typeof data !== "object") return data;
  const { audioArray, ...rest } = data;
  if (!audioArray) return { ...data };

  let bytes;
  if (audioArray instanceof ArrayBuffer) {
    bytes = audioArray.slice(0);
  } else if (ArrayBuffer.isView(audioArray)) {
    const { buffer, byteOffset, byteLength } = audioArray;
    if (!buffer || buffer.byteLength === 0) {
      throw new Error(
        "drive audioArray buffer is detached — rebuild drive data before replay",
      );
    }
    bytes = buffer.slice(byteOffset, byteOffset + byteLength);
  } else {
    return { ...data };
  }

  return { ...rest, audioArray: new Uint8Array(bytes) };
}

/**
 * Create and mount a TalkingHead avatar on a canvas.
 *
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {string} opts.modelUrl - downloadLink from GET /avatars/models/{id}
 * @param {string} [opts.workerBase="./workers/"] - directory containing both workers
 * @param {() => void} [opts.onReady] - AvatarJS `OnWorkerReady`: model worker ready, safe to `drive`
 * @param {() => void} [opts.onAnimationReady] - AvatarJS `OnAnimationReady`: emote decoded (wrapper calls `startPlay2`)
 * @param {() => void} [opts.onPlayEnd] - AvatarJS `OnPlayEnd`: lip-sync / visual track finished
 * @param {(err: unknown) => void} [opts.onError] - AvatarJS `OnError`
 * @param {(percent: number) => void} [opts.onProgress] - AvatarJS `updateSeekBar`: playback progress 0–100
 * @param {() => void} [opts.onAudioEnd] - AvatarJS `audioEnd`: audio track finished
 * @param {boolean} [opts.telemetry=true] - ping eventType=2 (install success) on ready
 * @param {string} [opts.siteOrigin] - C-end site origin (prod https://www.sumeruai.us)
 */
export async function createAvatar({
  canvas,
  modelUrl,
  workerBase = "./workers/",
  onReady,
  onAnimationReady,
  onPlayEnd,
  onError,
  onProgress,
  onAudioEnd,
  telemetry = true,
  siteOrigin,
}) {
  const startedAt = Date.now();
  const base = workerBase.endsWith("/") ? workerBase : `${workerBase}/`;
  const decoderWorkerUrl = `${base}decoderWorker.js`;
  const rendererWorkerUrl = `${base}rendererWorker.js`;

  const mod = await loadAvatarJS();
  const AvatarJS = mod.default;

  let ready = false;
  let instance = null;

  instance = new AvatarJS(
    { canvas },
    () => {
      ready = true;
      if (telemetry) {
        if (siteOrigin) setSiteOrigin(siteOrigin);
        reportAvatarReady({ latencyMs: Date.now() - startedAt });
      }
      onReady?.();
    },
    () => {
      onAnimationReady?.();
      instance?.startPlay2?.();
    },
    () => onPlayEnd?.(),
    (err) => onError?.(err),
    (percent) => onProgress?.(percent),
    () => onAudioEnd?.(),
    modelUrl,
    decoderWorkerUrl,
    rendererWorkerUrl,
  );

  return {
    /** Feed ATF drive data. append=false for new clip; true for stream chunks. */
    drive(data, append = false) {
      if (!ready) throw new Error("Avatar not ready — wait for onReady");
      instance.receiveData(cloneDrivePayload(data), append);
    },
    stop() {
      instance?.stopPlay?.();
    },
    destroy() {
      try {
        instance?.stopPlay?.();
        instance?.close?.();
      } catch {
        /* ignore */
      }
      ready = false;
      instance = null;
    },
    unlockAudio() {
      try {
        const ctx = instance?.cardManager?.audioPlayer?.audioContext;
        if (ctx?.state === "suspended") {
          void ctx.resume();
        }
      } catch {
        /* ignore */
      }
    },
    get isReady() {
      return ready;
    },
    get raw() {
      return instance;
    },
  };
}
