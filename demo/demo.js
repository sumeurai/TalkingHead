import { createAvatar } from "../sdk/sumeru-avatar.js";
import {
  auth,
  pollModel,
  setApiOrigin,
  getApiBase,
} from "../sdk/sumeru-atf-api.js";
import { driveFromText, driveFromAudioFile } from "../sdk/sumeru-drive.js";
import {
  loadAssetsCache,
  buildBundledDrive,
  loadBundledEmote,
  DEFAULT_EMOTE_FILE,
  DEFAULT_AUDIO_FILE,
} from "../sdk/demo-cache.js";

let localConfig = {};
try {
  localConfig = (await import("../config.local.js")).default;
} catch {
  /* optional */
}

const assetsCache = (await loadAssetsCache()) ?? {};

/** Pick first non-empty string (config.local empty strings must not block assets-cache.json). */
function pickConfigString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Quick demo only — bundled assets; never auto-fills Developer sandbox form. */
const quickModelUrl = pickConfigString(
  localConfig.downloadLink,
  assetsCache.downloadLink,
);
const bundledEmoteUrl =
  pickConfigString(
    localConfig.emoteFile,
    assetsCache.emoteFile,
    DEFAULT_EMOTE_FILE,
  ) || DEFAULT_EMOTE_FILE;
const bundledAudioUrl =
  pickConfigString(
    localConfig.audioFile,
    assetsCache.audioFile,
    DEFAULT_AUDIO_FILE,
  ) || DEFAULT_AUDIO_FILE;

const DEFAULT_API_ORIGIN_HINT = "https://api.sumeruai.us";

const $ = (sel) => document.querySelector(sel);

const els = {
  modeQuick: $("#mode-quick"),
  modeDeveloper: $("#mode-developer"),
  panelQuick: $("#panel-quick"),
  panelDeveloper: $("#panel-developer"),
  quickStatus: $("#quick-status"),
  btnQuickPlay: $("#btn-quick-play"),
  btnQuickStop: $("#btn-quick-stop"),
  accessKey: $("#access-key"),
  secretKey: $("#secret-key"),
  accessToken: $("#access-token"),
  voiceId: $("#voice-id"),
  modelId: $("#model-id"),
  modelUrl: $("#model-url"),
  driveText: $("#drive-text"),
  audioFile: $("#audio-file"),
  audioFileHint: $("#audio-file-hint"),
  btnAuth: $("#btn-auth"),
  btnLoadModel: $("#btn-load-model"),
  btnDriveText: $("#btn-drive-text"),
  btnDriveAudio: $("#btn-drive-audio"),
  btnDevStop: $("#btn-dev-stop"),
  apiEnv: $("#api-env"),
  quickStageWrap: $("#quick-stage-wrap"),
  quickBadge: $("#quick-stage-badge"),
  quickCanvas: $("#quick-avatar-canvas"),
  devStageWrap: $("#dev-stage-wrap"),
  devBadge: $("#dev-stage-badge"),
  log: $("#log"),
};

/** Quick demo — dedicated canvas, auto-mount on page load. */
const quick = {
  avatar: null,
  modelUrl: "",
  mountPromise: null,
};

/** Developer sandbox — separate canvas, mount on Load model only. */
const developer = {
  avatar: null,
  modelUrl: "",
  mountPromise: null,
  canvas: null,
};

let tokenCache = "";
let bundledEmoteReady = false;
let demoMode = "quick";

function log(msg, type = "") {
  const line = document.createElement("div");
  if (type) line.className = type;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  els.log.appendChild(line);
  els.log.scrollTop = els.log.scrollHeight;
}

function setQuickBadge(text, ready = false) {
  if (!els.quickBadge) return;
  els.quickBadge.textContent = text;
  els.quickBadge.hidden = false;
  els.quickBadge.classList.toggle("is-ready", ready);
}

function setDevBadge(text, ready = false) {
  if (!els.devBadge) return;
  els.devBadge.textContent = text;
  els.devBadge.hidden = false;
  els.devBadge.classList.toggle("is-ready", ready);
}

function getToken() {
  return els.accessToken.value.trim() || tokenCache;
}

function shortUrl(url) {
  if (!url) return "—";
  return url.length > 52 ? `${url.slice(0, 52)}…` : url;
}

function setDeveloperControlsEnabled(enabled) {
  els.btnDriveText.disabled = !enabled;
  els.btnDriveAudio.disabled = !enabled;
  els.btnDevStop.disabled = !enabled;
}

function stopQuickPlayback() {
  quick.avatar?.stop();
  if (quick.avatar?.isReady) setQuickBadge("Ready", true);
}

function stopDevPlayback() {
  developer.avatar?.stop();
  if (developer.avatar?.isReady) setDevBadge("Ready", true);
}

function stopPlayback() {
  if (demoMode === "quick") stopQuickPlayback();
  else stopDevPlayback();
}

function setDemoMode(mode) {
  if (mode === demoMode) return;
  stopQuickPlayback();
  stopDevPlayback();
  demoMode = mode;
  const isQuick = mode === "quick";
  const pageRoot = document.getElementById("page-root");
  if (pageRoot) {
    pageRoot.classList.toggle("is-quick", isQuick);
    pageRoot.classList.toggle("is-developer", !isQuick);
  }
  els.modeQuick?.classList.toggle("is-active", isQuick);
  els.modeDeveloper?.classList.toggle("is-active", !isQuick);
  els.panelQuick?.classList.toggle("is-hidden", !isQuick);
  els.panelDeveloper?.classList.toggle("is-hidden", isQuick);
  if (!isQuick) {
    clearDeveloperForm();
    setDeveloperControlsEnabled(false);
  }
  log(
    `Switched to ${isQuick ? "Quick demo" : "Developer sandbox"} — playback stopped`,
    "ok",
  );
}

function renderQuickStatus() {
  if (!els.quickStatus) return;
  els.quickStatus.innerHTML = [
    `<strong>Bundled Quick demo</strong>`,
    `model: <code>${shortUrl(quickModelUrl)}</code>`,
    `audio: <code>${bundledAudioUrl}</code>`,
    `emote: <code>${bundledEmoteUrl}</code>`,
    `bundled emote: <code>${bundledEmoteReady ? "loaded ✓" : "checking…"}</code>`,
    `API calls: <code>none for Play</code>`,
  ].join("<br>");
}

function clearDeveloperForm() {
  tokenCache = "";
  for (const el of [
    els.apiEnv,
    els.accessKey,
    els.secretKey,
    els.accessToken,
    els.modelId,
    els.voiceId,
    els.modelUrl,
    els.driveText,
  ]) {
    if (el) el.value = "";
  }
  if (els.audioFile) els.audioFile.value = "";
  if (els.audioFileHint) {
    els.audioFileHint.textContent =
      "Select WAV/audio, then click Audio → /dt + Play.";
  }
}

function normalizeApiOriginInput(raw) {
  const trimmed = raw?.trim();
  if (!trimmed) {
    throw new Error(`Fill API origin (e.g. ${DEFAULT_API_ORIGIN_HINT})`);
  }
  return trimmed.replace(/\/v1\/?$/, "").replace(/\/$/, "");
}

function applyApiOriginFromForm() {
  const origin = normalizeApiOriginInput(els.apiEnv?.value);
  if (els.apiEnv && els.apiEnv.value.trim() !== origin) {
    els.apiEnv.value = origin;
  }
  setApiOrigin(origin);
  return origin;
}

function initDeveloperSandboxDefaults() {
  clearDeveloperForm();
  setDeveloperControlsEnabled(false);
}

function initPage() {
  initDeveloperSandboxDefaults();
  renderQuickStatus();
}

async function checkBundledEmote() {
  bundledEmoteReady = Boolean(await loadBundledEmote(bundledEmoteUrl));
  renderQuickStatus();
  if (bundledEmoteReady) {
    log(`Bundled emote ready: ${bundledEmoteUrl}`, "ok");
  } else {
    log(`Missing ${bundledEmoteUrl} — run node scripts/provision-assets.mjs`, "err");
  }
}

function handleEnvChange() {
  const raw = els.apiEnv?.value.trim();
  if (!raw) return;
  applyApiOriginFromForm();
  log(`API origin → ${getApiBase()}`, "ok");
}

async function ensureAuth() {
  applyApiOriginFromForm();
  let token = getToken();
  if (token) return token;
  const accessKey = els.accessKey.value.trim();
  const secretKey = els.secretKey.value.trim();
  if (!accessKey || !secretKey) {
    throw new Error("Fill accessKey / secretKey or accessToken");
  }
  token = await auth(accessKey, secretKey);
  tokenCache = token;
  els.accessToken.value = token;
  log("Auth OK", "ok");
  return token;
}

async function resolveDeveloperModelUrl(token) {
  const direct = els.modelUrl.value.trim();
  if (direct) return direct;
  const modelId = els.modelId.value.trim();
  if (!modelId) throw new Error("Provide downloadLink or modelId");
  if (!token) throw new Error("Auth required to poll modelId");
  log(`Polling model ${modelId}…`);
  const data = await pollModel(token, modelId, {
    intervalMs: 2000,
    timeoutMs: 120000,
  });
  if (data.downloadLink) els.modelUrl.value = data.downloadLink;
  log(`Model ready: ${data.downloadLink}`, "ok");
  return data.downloadLink;
}

function onQuickAvatarReady() {
  setQuickBadge("Ready", true);
  log("Quick demo avatar ready", "ok");
  els.btnQuickPlay.disabled = false;
  els.btnQuickStop.disabled = false;
}

function onDevAvatarReady() {
  setDevBadge("Ready", true);
  log("Developer avatar ready", "ok");
  setDeveloperControlsEnabled(true);
}

async function mountQuickAvatar() {
  if (!quickModelUrl) {
    throw new Error("Missing downloadLink in demo/assets-cache.json");
  }
  if (quick.avatar?.isReady && quick.modelUrl === quickModelUrl) return;

  if (quick.avatar) {
    quick.avatar.destroy();
    quick.avatar = null;
  }

  setQuickBadge("Loading…", false);
  log("Quick demo: loading bundled model…", "ok");
  quick.modelUrl = quickModelUrl;
  quick.avatar = await createAvatar({
    canvas: els.quickCanvas,
    modelUrl: quickModelUrl,
    workerBase: "./workers/",
    onReady: onQuickAvatarReady,
    onError: (err) => {
      log(`Quick avatar error: ${JSON.stringify(err)}`, "err");
      setQuickBadge("Error", false);
    },
    onProgress: (pct) => setQuickBadge(`Playing ${Math.round(pct)}%`, true),
    onAudioEnd: () => {
      log("Playback finished", "ok");
      setQuickBadge("Ready", true);
    },
  });
}

async function ensureQuickAvatar() {
  if (quick.avatar?.isReady) return;
  if (quick.mountPromise) {
    await quick.mountPromise;
    return;
  }
  quick.mountPromise = mountQuickAvatar();
  try {
    await quick.mountPromise;
  } finally {
    quick.mountPromise = null;
  }
}

function createDevCanvas() {
  const wrap = els.devStageWrap;
  if (!wrap) throw new Error("Missing #dev-stage-wrap");
  wrap.querySelector("canvas")?.remove();
  const canvas = document.createElement("canvas");
  canvas.id = "dev-avatar-canvas";
  wrap.appendChild(canvas);
  developer.canvas = canvas;
  return canvas;
}

function showDevStage() {
  els.devStageWrap?.classList.remove("is-empty");
  if (els.devBadge) els.devBadge.hidden = false;
}

function hideDevStage() {
  if (developer.avatar) {
    try {
      developer.avatar.destroy();
    } catch {
      /* ignore */
    }
    developer.avatar = null;
  }
  developer.modelUrl = "";
  developer.mountPromise = null;
  developer.canvas?.remove();
  developer.canvas = null;
  setDeveloperControlsEnabled(false);
  els.devStageWrap?.classList.add("is-empty");
  if (els.devBadge) {
    els.devBadge.hidden = true;
    els.devBadge.textContent = "Idle";
    els.devBadge.classList.remove("is-ready");
  }
}

async function mountDeveloperAvatar(modelUrl) {
  if (developer.avatar?.isReady && developer.modelUrl === modelUrl) return;

  hideDevStage();
  showDevStage();
  const canvas = createDevCanvas();

  setDevBadge("Loading…", false);
  log("Developer: loading model…", "ok");
  developer.modelUrl = modelUrl;
  developer.avatar = await createAvatar({
    canvas,
    modelUrl,
    workerBase: "./workers/",
    onReady: onDevAvatarReady,
    onError: (err) => {
      log(`Developer avatar error: ${JSON.stringify(err)}`, "err");
      setDevBadge("Error", false);
    },
    onProgress: (pct) => setDevBadge(`Playing ${Math.round(pct)}%`, true),
    onAudioEnd: () => {
      log("Playback finished", "ok");
      setDevBadge("Ready", true);
    },
  });
}

async function ensureDeveloperAvatar() {
  if (developer.avatar?.isReady) return;

  if (developer.mountPromise) {
    await developer.mountPromise;
    return;
  }

  developer.mountPromise = (async () => {
    const token = await ensureAuth();
    log(`API: ${getApiBase()}`, "ok");
    const modelUrl = await resolveDeveloperModelUrl(token);
    await mountDeveloperAvatar(modelUrl);
  })();

  try {
    await developer.mountPromise;
  } catch (e) {
    hideDevStage();
    throw e;
  } finally {
    developer.mountPromise = null;
  }
}

async function bootQuickAvatar() {
  if (!quickModelUrl) {
    log(
      "Missing downloadLink in demo/assets-cache.json — run node scripts/provision-assets.mjs",
      "err",
    );
    setQuickBadge("No model", false);
    return;
  }
  try {
    await ensureQuickAvatar();
    log('Quick demo ready — click "Play welcome"', "ok");
  } catch (e) {
    log(e instanceof Error ? e.message : String(e), "err");
    setQuickBadge("Error", false);
  }
}

async function handleQuickPlay() {
  if (!quick.avatar?.isReady) {
    log("Quick demo model still loading…", "err");
    return;
  }
  els.btnQuickPlay.disabled = true;
  try {
    quick.avatar.unlockAudio();
    log("Quick demo: bundled wav + welcome-emote.json", "ok");
    const driveData = await buildBundledDrive(bundledEmoteUrl, bundledAudioUrl);
    quick.avatar.drive(driveData, false);
    setQuickBadge("Playing", true);
  } catch (e) {
    log(e instanceof Error ? e.message : String(e), "err");
    setQuickBadge("Error", false);
  } finally {
    els.btnQuickPlay.disabled = false;
  }
}

async function handleAuth() {
  els.btnAuth.disabled = true;
  try {
    await ensureAuth();
  } catch (e) {
    log(e instanceof Error ? e.message : String(e), "err");
  } finally {
    els.btnAuth.disabled = false;
  }
}

async function handleLoadModel() {
  els.btnLoadModel.disabled = true;
  try {
    await ensureDeveloperAvatar();
  } catch (e) {
    log(e instanceof Error ? e.message : String(e), "err");
  } finally {
    els.btnLoadModel.disabled = false;
  }
}

async function handleDriveFromText() {
  const modelId = els.modelId.value.trim();
  const voiceId = els.voiceId.value.trim();
  const text = els.driveText.value.trim();
  if (!modelId || !voiceId || !text) {
    log("Need modelId, voiceId, and script text", "err");
    return;
  }
  if (!developer.avatar?.isReady) {
    log("Load model first", "err");
    return;
  }

  els.btnDriveText.disabled = true;
  setDevBadge("TTS…", false);
  try {
    const token = await ensureAuth();
    log("TTS + POST /audio-to-face/dt…", "ok");
    await driveFromText(developer.avatar, token, {
      modelId,
      voiceId,
      text,
      onChunk: log,
    });
    setDevBadge("Playing", true);
    log("Playing lip-sync", "ok");
  } catch (e) {
    log(e instanceof Error ? e.message : String(e), "err");
    setDevBadge("Error", false);
  } finally {
    if (developer.avatar?.isReady) els.btnDriveText.disabled = false;
  }
}

async function handleDriveFromAudio() {
  const modelId = els.modelId.value.trim();
  const file = els.audioFile.files?.[0];
  if (!modelId || !file) {
    log("Need modelId and an audio file", "err");
    return;
  }
  if (!developer.avatar?.isReady) {
    log("Load model first", "err");
    return;
  }

  els.btnDriveAudio.disabled = true;
  setDevBadge("ATF…", false);
  try {
    const token = await ensureAuth();
    log(`POST /audio-to-face/dt · ${file.name}`, "ok");
    await driveFromAudioFile(developer.avatar, token, { modelId, file });
    setDevBadge("Playing", true);
    log("Playing lip-sync", "ok");
  } catch (e) {
    log(e instanceof Error ? e.message : String(e), "err");
    setDevBadge("Error", false);
  } finally {
    if (developer.avatar?.isReady) els.btnDriveAudio.disabled = false;
  }
}

function handleQuickStop() {
  stopQuickPlayback();
}

function handleDevStop() {
  stopDevPlayback();
}

els.modeQuick?.addEventListener("click", () => setDemoMode("quick"));
els.modeDeveloper?.addEventListener("click", () => setDemoMode("developer"));
els.btnQuickPlay?.addEventListener("click", handleQuickPlay);
els.btnQuickStop?.addEventListener("click", handleQuickStop);
els.btnAuth?.addEventListener("click", handleAuth);
els.btnLoadModel?.addEventListener("click", handleLoadModel);
els.btnDriveText?.addEventListener("click", handleDriveFromText);
els.btnDriveAudio?.addEventListener("click", handleDriveFromAudio);
els.btnDevStop?.addEventListener("click", handleDevStop);
if (els.apiEnv) els.apiEnv.addEventListener("change", handleEnvChange);
els.audioFile?.addEventListener("change", () => {
  const file = els.audioFile.files?.[0];
  if (!file) return;
  if (els.audioFileHint) {
    els.audioFileHint.textContent = `Selected ${file.name} — click Audio → /dt + Play`;
  }
  log(`Audio selected: ${file.name}`, "ok");
});

initPage();
setDemoMode("quick");
void checkBundledEmote();
log("Quick demo: bundled model auto-loads on #quick-avatar-canvas");
void bootQuickAvatar();
