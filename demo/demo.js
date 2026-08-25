import { createAvatar, modelUrlFromSelfHost } from "../sdk/sumeru-avatar.js";
import { setSiteOrigin } from "../sdk/sumeru-event-stats.js";
import {
  auth,
  getModel,
  pollModel,
  setApiOrigin,
  getApiBase,
} from "../sdk/sumeru-atf-api.js";
import { driveFromText, driveFromAudioFile } from "../sdk/sumeru-drive.js";
import {
  loadAssetsCache,
  buildBundledDrive,
  loadBundledEmote,
  probeModelDir,
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

/** Quick demo only — never auto-fills Developer sandbox form. */
const quickLocalDir = pickConfigString(localConfig.modelDir, assetsCache.modelDir);
const quickRemoteUrl = pickConfigString(
  localConfig.downloadLink,
  assetsCache.downloadLink,
);
const quickModelFiles = Array.isArray(localConfig.modelFiles)
  ? localConfig.modelFiles
  : Array.isArray(assetsCache.modelFiles)
    ? assetsCache.modelFiles
    : [];
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

const DEFAULT_API_ORIGIN_HINT = "https://overseas.sumeruai.com";
const demoSiteOrigin = pickConfigString(localConfig.siteOrigin);
if (demoSiteOrigin) setSiteOrigin(demoSiteOrigin);

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
  modelFiles: $("#model-files"),
  modelFilesHint: $("#model-files-hint"),
  driveText: $("#drive-text"),
  audioFile: $("#audio-file"),
  audioFileHint: $("#audio-file-hint"),
  btnAuth: $("#btn-auth"),
  btnListFiles: $("#btn-list-files"),
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
  source: "",
  loadError: null,
  mountPromise: null,
};

/** Developer sandbox — separate canvas, mount on Load model only. */
const developer = {
  avatar: null,
  modelUrl: "",
  loadError: null,
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
  const modelLine = quick.modelUrl
    ? `${quick.source || "model"}: <code>${shortUrl(quick.modelUrl)}</code>`
    : `model: <code>not available</code>`;
  els.quickStatus.innerHTML = [
    `<strong>Bundled Quick demo</strong>`,
    modelLine,
    `local dir: <code>${shortUrl(quickLocalDir) || "—"}</code>`,
    `audio: <code>${bundledAudioUrl}</code>`,
    `emote: <code>${bundledEmoteUrl}</code>`,
    `bundled emote: <code>${bundledEmoteReady ? "loaded ✓" : "checking…"}</code>`,
    `API calls: <code>none for Play</code>`,
  ].join("<br>");
}

function clearDeveloperForm() {
  tokenCache = "";
  for (const el of [
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
  if (els.apiEnv) els.apiEnv.value = DEFAULT_API_ORIGIN_HINT;
  setApiOrigin(DEFAULT_API_ORIGIN_HINT);
  if (els.audioFile) els.audioFile.value = "";
  if (els.audioFileHint) {
    els.audioFileHint.textContent =
      "Select WAV/audio, then click Audio → /dt + Play.";
  }
  if (els.modelFiles) els.modelFiles.value = "";
  if (els.modelFilesHint) {
    els.modelFilesHint.textContent =
      "After you download files[], put them on your server (same folder, original names), then paste that directory URL above. Selecting files here does not load the avatar.";
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
  if (els.apiEnv) els.apiEnv.value = DEFAULT_API_ORIGIN_HINT;
  setApiOrigin(DEFAULT_API_ORIGIN_HINT);
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

function logModelFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    log("files[] empty — wait for status=1 or re-fetch the model", "err");
    return;
  }
  log(`files (${files.length}) — download to YOUR server, keep original names:`, "ok");
  for (const file of files) {
    const name = file?.name || "(missing name)";
    const url = file?.url || "(missing url)";
    log(`  ${name}  ${url}`, "ok");
  }
  log("Do not pass downloadLink or files[].url into createAvatar (24h temp).", "ok");
}

async function listApiModelFiles() {
  const modelId = els.modelId.value.trim();
  if (!modelId) throw new Error("Fill modelId to list API files");
  const token = await ensureAuth();
  log(`GET /avatars/models/${modelId}…`);
  let data;
  try {
    data = await getModel(token, modelId);
  } catch {
    data = await pollModel(token, modelId, {
      intervalMs: 2000,
      timeoutMs: 120000,
    });
  }
  log(`Model status=${data.status}`, String(data.status) === "1" ? "ok" : "");
  logModelFiles(data.files);
  return data;
}

async function resolveQuickModelUrl() {
  if (quickLocalDir) {
    const local = await probeModelDir(quickLocalDir, quickModelFiles);
    if (local) return { url: local, source: "local" };
    log("Local model files missing — trying remote fallback…");
  }
  if (quickRemoteUrl) {
    // Keep the cached prefix as-is (AvatarJS historically used downloadLink without a forced slash).
    return { url: quickRemoteUrl, source: "remote" };
  }
  return null;
}

function showQuickStage() {
  els.quickStageWrap?.classList.remove("is-empty");
  if (els.quickBadge) els.quickBadge.hidden = false;
}

function hideQuickStage() {
  if (quick.avatar) {
    try {
      quick.avatar.destroy();
    } catch {
      /* ignore */
    }
    quick.avatar = null;
  }
  quick.modelUrl = "";
  quick.source = "";
  quick.mountPromise = null;
  els.btnQuickPlay.disabled = true;
  els.btnQuickStop.disabled = true;
  els.quickStageWrap?.classList.add("is-empty");
  if (els.quickBadge) {
    els.quickBadge.hidden = true;
    els.quickBadge.textContent = "Idle";
    els.quickBadge.classList.remove("is-ready");
  }
  renderQuickStatus();
}

function waitForAvatarReady(avatar, getError, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    if (avatar.isReady) {
      resolve();
      return;
    }
    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      if (avatar.isReady) {
        clearInterval(timer);
        resolve();
        return;
      }
      const err = getError?.();
      if (err) {
        clearInterval(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error("Model load timeout"));
      }
    }, 200);
  });
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

async function mountQuickAvatar(modelUrl, source) {
  if (quick.avatar?.isReady && quick.modelUrl === modelUrl) return;

  if (quick.avatar) {
    quick.avatar.destroy();
    quick.avatar = null;
  }

  quick.loadError = null;
  showQuickStage();
  setQuickBadge("Loading…", false);
  log(`Quick demo: loading ${source} model…`, "ok");
  quick.modelUrl = modelUrl;
  quick.source = source;
  renderQuickStatus();
  quick.avatar = await createAvatar({
    canvas: els.quickCanvas,
    modelUrl,
    workerBase: "./workers/",
    onReady: onQuickAvatarReady,
    onError: (err) => {
      log(`Quick avatar error: ${JSON.stringify(err)}`, "err");
      if (!quick.avatar?.isReady) {
        quick.loadError = err instanceof Error ? err : new Error(String(err));
      } else {
        setQuickBadge("Error", false);
      }
    },
    onProgress: (pct) => setQuickBadge(`Playing ${Math.round(pct)}%`, true),
    onAudioEnd: () => {
      log("Playback finished", "ok");
      setQuickBadge("Ready", true);
    },
  });
  await waitForAvatarReady(quick.avatar, () => quick.loadError);
}

async function ensureQuickAvatar(resolved) {
  if (quick.avatar?.isReady) return;
  if (quick.mountPromise) {
    await quick.mountPromise;
    return;
  }
  const target = resolved ?? (await resolveQuickModelUrl());
  if (!target) throw new Error("No Quick demo model");
  quick.mountPromise = mountQuickAvatar(target.url, target.source);
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
  developer.loadError = null;
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
  log("Developer: loading model from your directory…", "ok");
  developer.modelUrl = modelUrl;
  developer.loadError = null;
  developer.avatar = await createAvatar({
    canvas,
    modelUrl,
    workerBase: "./workers/",
    onReady: onDevAvatarReady,
    onError: (err) => {
      log(`Developer avatar error: ${JSON.stringify(err)}`, "err");
      if (!developer.avatar?.isReady) {
        developer.loadError = err instanceof Error ? err : new Error(String(err));
      } else {
        setDevBadge("Error", false);
      }
    },
    onProgress: (pct) => setDevBadge(`Playing ${Math.round(pct)}%`, true),
    onAudioEnd: () => {
      log("Playback finished", "ok");
      setDevBadge("Ready", true);
    },
  });
  await waitForAvatarReady(developer.avatar, () => developer.loadError);
}

async function ensureDeveloperAvatar() {
  if (developer.avatar?.isReady) return;

  if (developer.mountPromise) {
    await developer.mountPromise;
    return;
  }

  developer.mountPromise = (async () => {
    const hosted = modelUrlFromSelfHost(els.modelUrl?.value);
    if (!hosted) {
      const modelId = els.modelId.value.trim();
      if (modelId) {
        await listApiModelFiles();
      }
      throw new Error(
        "Host files[] on YOUR server (keep original names), then paste that directory URL into Model directory. Do not load from downloadLink.",
      );
    }
    log(`Developer modelUrl (your host): ${hosted}`, "ok");
    await mountDeveloperAvatar(hosted);
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
  const resolved = await resolveQuickModelUrl();
  if (!resolved) {
    log(
      "No local demo/models/ files and no remote downloadLink — Quick demo hidden",
      "err",
    );
    hideQuickStage();
    return;
  }
  try {
    await ensureQuickAvatar(resolved);
    log('Quick demo ready — click "Play welcome"', "ok");
  } catch (e) {
    log(e instanceof Error ? e.message : String(e), "err");
    hideQuickStage();
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

async function handleListFiles() {
  els.btnListFiles.disabled = true;
  try {
    await listApiModelFiles();
  } catch (e) {
    log(e instanceof Error ? e.message : String(e), "err");
  } finally {
    els.btnListFiles.disabled = false;
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
els.btnListFiles?.addEventListener("click", handleListFiles);
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
els.modelFiles?.addEventListener("change", () => {
  const files = [...(els.modelFiles.files || [])];
  if (!files.length) return;
  const names = files.map((f) => f.name).join(", ");
  if (els.modelFilesHint) {
    els.modelFilesHint.textContent = `Selected ${files.length} file(s): ${names}. Host them on YOUR server with these names, then paste the directory URL above.`;
  }
  log(`Model files selected (${files.length}): ${names}`, "ok");
  log("Upload/select here is only a checklist — createAvatar needs your hosted directory URL.", "ok");
});

initPage();
setDemoMode("quick");
void checkBundledEmote();
log("Quick demo: local demo/models/ first, then remote, hidden if neither works");
void bootQuickAvatar();
