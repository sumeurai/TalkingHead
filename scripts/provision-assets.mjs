/**
 * One-time provisioning for Quick demo + assets-cache.json.
 *
 * Writes:
 *   demo/assets/welcome.wav
 *   demo/assets/welcome-emote.json  (AK/ABI/ATI/API — safe to commit for public demo)
 *   demo/assets-cache.json
 *
 * Usage:
 *   ACCESS_KEY=... SECRET_KEY=... node scripts/provision-assets.mjs
 *   Optional: VOICE_WAV=... PHOTO_JPG=... STYLE_ID=... VOICE_ID=... API_ORIGIN=...
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const API_ORIGIN = process.env.API_ORIGIN ?? "https://api.sumeruai.us";
const API_BASE = `${API_ORIGIN.replace(/\/$/, "")}/v1`;

const ACCESS_KEY = process.env.ACCESS_KEY ?? "";
const SECRET_KEY = process.env.SECRET_KEY ?? "";

const VOICE_WAV = process.env.VOICE_WAV ?? "";
const PHOTO_JPG = process.env.PHOTO_JPG ?? "";

const WELCOME_TEXT =
  process.env.WELCOME_TEXT ??
  `Hello developer, welcome to use this encapsulated digital-human SDK. You are hearing this voice means the audio-video rendering, voice driving and lip-sync links are initialized successfully.`;

const ASSETS_DIR = path.join(ROOT, "demo", "assets");
const WAV_OUT = path.join(ASSETS_DIR, "welcome.wav");
const EMOTE_OUT = path.join(ASSETS_DIR, "welcome-emote.json");
const CACHE_OUT = path.join(ROOT, "demo", "assets-cache.json");

async function parseJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }
}

async function apiJson(apiPath, { method = "GET", token, body, headers = {} } = {}) {
  const res = await fetch(`${API_BASE}${apiPath}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body,
  });
  const json = await parseJson(res);
  if (json.code !== 200) throw new Error(`${method} ${apiPath}: ${json.msg || json.code}`);
  return json.data;
}

async function auth() {
  if (!ACCESS_KEY || !SECRET_KEY) {
    throw new Error("Set ACCESS_KEY and SECRET_KEY env vars");
  }
  const res = await fetch(`${API_BASE}/access/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey: ACCESS_KEY, secretKey: SECRET_KEY }),
  });
  const json = await parseJson(res);
  if (json.code !== 200) throw new Error(json.msg);
  return json.data.accessToken;
}

async function poll(fn, { intervalMs = 3000, timeoutMs = 600000, ok, fail }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await fn();
    if (ok(data)) return data;
    if (fail?.(data)) throw new Error("Task failed");
    console.log("  … waiting", data.status ?? data);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Poll timeout");
}

function splitTts(text, max = 150) {
  const chunks = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf(". ", max);
    if (cut < max * 0.4) cut = rest.lastIndexOf(" ", max);
    if (cut < 1) cut = max;
    chunks.push(rest.slice(0, cut + (rest[cut] === "." ? 1 : 0)).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function mergeWavBase64Parts(base64Parts) {
  if (base64Parts.length === 1) return base64Parts[0];
  const bufs = base64Parts.map((b) => Buffer.from(b, "base64"));
  const header = bufs[0].subarray(0, 44);
  let dataLen = 0;
  const datas = bufs.map((b) => {
    const data = b.subarray(44);
    dataLen += data.length;
    return data;
  });
  const out = Buffer.alloc(44 + dataLen);
  header.copy(out, 0);
  out.writeUInt32LE(36 + dataLen, 4);
  out.writeUInt32LE(dataLen, 40);
  let off = 44;
  for (const d of datas) {
    d.copy(out, off);
    off += d.length;
  }
  return out.toString("base64");
}

async function fetchEmoteFromUrl(emoteKey) {
  const res = await fetch(emoteKey);
  if (!res.ok) throw new Error(`emote fetch ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return JSON.parse(await res.text());
}

async function main() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  console.log("Auth…");
  const token = await auth();

  let voiceId = process.env.VOICE_ID ?? "";
  if (!voiceId) {
    if (!VOICE_WAV || !fs.existsSync(VOICE_WAV)) {
      throw new Error("Set VOICE_ID or VOICE_WAV path");
    }
    console.log("Voice clone…");
    const voiceForm = new FormData();
    voiceForm.append(
      "file",
      new Blob([fs.readFileSync(VOICE_WAV)], { type: "audio/wav" }),
      "sample.wav",
    );
    const voiceTask = await apiJson("/voices", { method: "POST", token, body: voiceForm });
    voiceId = voiceTask.id;
    await poll(() => apiJson(`/voices/${voiceId}`, { token }), {
      ok: (d) => String(d.status) === "1",
      fail: (d) => String(d.status) === "4",
    });
  }
  console.log("  voiceId:", voiceId);

  let modelId = process.env.MODEL_ID ?? "";
  let downloadLink = process.env.DOWNLOAD_LINK ?? "";
  const styleIdForCache = process.env.STYLE_ID ?? "";

  if (!modelId || !downloadLink) {
    if (!PHOTO_JPG || !fs.existsSync(PHOTO_JPG)) {
      throw new Error("Set MODEL_ID+DOWNLOAD_LINK or PHOTO_JPG for model creation");
    }
    console.log("Style + model…");
    let resolvedStyleId = styleIdForCache;
    if (!resolvedStyleId) {
      const styles = await apiJson("/avatars/styles/query", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!styles?.[0]?.id) throw new Error("No style templates returned");
      resolvedStyleId = styles[0].id;
      console.log("  using first style from query:", resolvedStyleId);
    } else {
      console.log("  using STYLE_ID:", resolvedStyleId);
    }
    const photoBuf = fs.readFileSync(PHOTO_JPG);
    const styleForm = new FormData();
    styleForm.append("photoFile", new Blob([photoBuf], { type: "image/jpeg" }), "photo.jpg");
    styleForm.append("styleId", String(resolvedStyleId));
    const styleTask = await apiJson("/avatars/styles/generations", {
      method: "POST",
      token,
      body: styleForm,
    });
    const styleImgId = styleTask.id;
    await poll(() => apiJson(`/avatars/styles/generations/${styleImgId}`, { token }), {
      ok: (d) => String(d.status) === "1",
      fail: (d) => String(d.status) === "4",
    });

    const modelForm = new FormData();
    modelForm.append("file", new Blob([photoBuf], { type: "image/jpeg" }), "photo.jpg");
    modelForm.append("sex", "0");
    modelForm.append("styleImgId", styleImgId);
    const modelTask = await apiJson("/avatars/models", { method: "POST", token, body: modelForm });
    modelId = modelTask.modelId;
    const model = await poll(() => apiJson(`/avatars/models/${modelId}`, { token }), {
      intervalMs: 5000,
      ok: (d) => String(d.status) === "1" && d.downloadLink,
      fail: (d) => String(d.status) === "4",
    });
    downloadLink = model.downloadLink;
  }
  console.log("  modelId:", modelId);
  console.log("  downloadLink:", downloadLink);

  console.log("TTS welcome…");
  const chunks = splitTts(WELCOME_TEXT);
  const audioParts = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  TTS ${i + 1}/${chunks.length}`);
    const tts = await apiJson("/tts", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: chunks[i], voiceId: Number(voiceId) }),
    });
    audioParts.push(tts.audioBase64);
  }
  const audioBase64 = mergeWavBase64Parts(audioParts);
  fs.writeFileSync(WAV_OUT, Buffer.from(audioBase64, "base64"));
  console.log("  wrote", WAV_OUT);

  console.log("ATF /dt…");
  const atfRes = await fetch(`${API_BASE}/audio-to-face/dt`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      modelId,
      traceId: crypto.randomUUID(),
      status: "start",
      dialogueBase64: audioBase64,
      lastDialogueBase64: "",
    }),
  });
  const atfJson = await parseJson(atfRes);
  if (atfJson.code !== 200) throw new Error(atfJson.msg || "ATF failed");
  const dt = atfJson.data;

  let emotePayload;
  let audioKey = dt.audioKey ?? "";
  let emoteKey = dt.emoteKey ?? "";
  const fps = dt.fps ?? 25;

  if (dt.AK && dt.ABI && dt.ATI && dt.API) {
    emotePayload = {
      fps,
      modelId,
      AK: dt.AK,
      ABI: dt.ABI,
      ATI: dt.ATI,
      API: dt.API,
    };
  } else if (emoteKey?.startsWith("http")) {
    const raw = await fetchEmoteFromUrl(emoteKey);
    emotePayload = {
      fps,
      modelId,
      AK: raw.AK ?? raw.data?.AK,
      ABI: raw.ABI ?? raw.data?.ABI,
      ATI: raw.ATI ?? raw.data?.ATI,
      API: raw.API ?? raw.data?.API,
    };
  } else {
    throw new Error("Unexpected /dt response — no inline AK or emoteKey URL");
  }

  fs.writeFileSync(EMOTE_OUT, JSON.stringify(emotePayload));
  console.log("  wrote", EMOTE_OUT, `(${(fs.statSync(EMOTE_OUT).size / 1024).toFixed(0)} KB)`);

  const cache = {
    apiOrigin: API_ORIGIN,
    voiceId,
    styleId: styleIdForCache || undefined,
    modelId,
    downloadLink,
    welcomeText: WELCOME_TEXT,
    audioKey,
    emoteKey,
    fps,
    audioFile: "./demo/assets/welcome.wav",
    emoteFile: "./demo/assets/welcome-emote.json",
    provisionedAt: new Date().toISOString(),
  };

  fs.writeFileSync(CACHE_OUT, JSON.stringify(cache, null, 2), "utf8");
  console.log("\nWrote", CACHE_OUT);
  console.log("Commit demo/assets/welcome.wav, welcome-emote.json, assets-cache.json for public Quick demo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
