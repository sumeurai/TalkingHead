/**
 * SumeruAI Developer Open API helpers for TalkingHead + AudioToFace (DT).
 * API base: https://overseas.sumeruai.com/v1
 * Token: POST {origin}/v1/access/auth
 * DT: POST /audio-to-face/dt { status, traceId, modelId, data } → protobuf
 */

export const API_ORIGINS = {
  overseas: "https://overseas.sumeruai.com",
  prod: "https://api.sumeruai.us",
};

let apiOrigin = API_ORIGINS.overseas;

/** @returns e.g. https://overseas.sumeruai.com/v1 */
export function getApiBase() {
  return `${apiOrigin.replace(/\/$/, "")}/v1`;
}

/** @param {string} origin — site origin, e.g. https://overseas.sumeruai.com */
export function setApiOrigin(origin) {
  if (!origin) return;
  apiOrigin = origin.replace(/\/$/, "");
}

const TTS_MAX_CHARS = 150;

async function parseJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }
}

async function apiJson(path, { method = "GET", token, body, headers = {} } = {}) {
  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body,
  });
  if (res.status === 404) {
    throw new Error(`API not found (404): ${method} ${path} — confirm gateway deployment`);
  }
  const json = await parseJson(res);
  if (json.code !== 200) {
    throw new Error(json.msg || `Request failed (${json.code})`);
  }
  return json.data;
}

/** POST /access/auth */
export async function auth(accessKey, secretKey) {
  const res = await fetch(`${getApiBase()}/access/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey, secretKey }),
  });
  const json = await parseJson(res);
  if (json.code !== 200) throw new Error(json.msg || "Auth failed");
  return json.data.accessToken;
}

/** POST /avatars/styles/query */
export async function queryStyles(token) {
  return apiJson("/avatars/styles/query", {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

/** POST /avatars/styles/generations */
export async function createStyleGeneration(token, { styleId, photoFile }) {
  const form = new FormData();
  form.append("photoFile", photoFile, photoFile.name || "photo.jpg");
  form.append("styleId", String(styleId));
  return apiJson("/avatars/styles/generations", {
    method: "POST",
    token,
    body: form,
  });
}

/** GET /avatars/styles/generations/{id} */
export async function getStyleGeneration(token, id) {
  return apiJson(`/avatars/styles/generations/${encodeURIComponent(id)}`, { token });
}

export async function pollStyleGeneration(token, id, opts = {}) {
  const { intervalMs = 2000, timeoutMs = 180000 } = opts;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await getStyleGeneration(token, id);
    if (String(data.status) === "1") return data;
    if (String(data.status) === "4") throw new Error("Style generation failed");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Poll style timeout");
}

/** POST /avatars/models */
export async function createAvatarModel(token, { photoFile, sex = "0", styleImgId }) {
  const form = new FormData();
  form.append("file", photoFile, photoFile.name || "photo.jpg");
  form.append("sex", sex);
  form.append("styleImgId", styleImgId);
  return apiJson("/avatars/models", { method: "POST", token, body: form });
}

/** GET /avatars/models/{modelId} */
export async function getModel(token, modelId) {
  return apiJson(`/avatars/models/${encodeURIComponent(modelId)}`, { token });
}

/**
 * Poll until status=1. Prefer `files[]` (name + url, 24h temp).
 * Next: download every file to YOUR server (keep `name`), then
 * `createAvatar({ modelUrl: modelUrlFromSelfHost(yourDirectory) })`.
 * Do not pass `downloadLink` / `files[].url` into `createAvatar`.
 */
export async function pollModel(token, modelId, { intervalMs = 3000, timeoutMs = 600000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await getModel(token, modelId);
    const filesReady = Array.isArray(data.files) && data.files.length > 0;
    if (String(data.status) === "1" && (filesReady || data.downloadLink)) return data;
    if (String(data.status) === "4") throw new Error(data.failMessage || "Model generation failed");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Poll model timeout");
}

/** POST /voices + poll */
export async function createVoiceClone(token, audioFile) {
  const form = new FormData();
  form.append("file", audioFile, audioFile.name || "sample.wav");
  return apiJson("/voices", { method: "POST", token, body: form });
}

export async function getVoice(token, voiceId) {
  return apiJson(`/voices/${encodeURIComponent(voiceId)}`, { token });
}

export async function pollVoice(token, voiceId, opts = {}) {
  const { intervalMs = 2000, timeoutMs = 120000 } = opts;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await getVoice(token, voiceId);
    if (String(data.status) === "1") return data;
    if (String(data.status) === "4") throw new Error("Voice clone failed");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Poll voice timeout");
}

/** POST /tts — max 150 weighted chars; voiceId must be clone id */
export async function synthesizeTts(token, { content, voiceId }) {
  if (content.length > TTS_MAX_CHARS) {
    throw new Error(`TTS content exceeds ${TTS_MAX_CHARS} chars`);
  }
  return apiJson("/tts", {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, voiceId: Number(voiceId) }),
  });
}

/** Read sync TTS result — API may return audioBase64 and/or audioUrl. */
export async function resolveTtsAudioBase64(data) {
  if (data?.audioBase64) return data.audioBase64;
  if (data?.audioUrl?.startsWith("http")) {
    const res = await fetch(data.audioUrl);
    if (!res.ok) throw new Error(`TTS audioUrl fetch ${res.status}`);
    return bytesToBase64(new Uint8Array(await res.arrayBuffer()));
  }
  if (String(data?.status) === "4") throw new Error("TTS failed (status=4)");
  if (String(data?.status) === "3") {
    throw new Error("TTS still processing (status=3) — retry in a moment");
  }
  throw new Error("TTS missing audioBase64 / audioUrl");
}

/** Split long text into TTS-safe chunks at sentence boundaries. */
export function splitTtsText(text, maxLen = TTS_MAX_CHARS) {
  const chunks = [];
  let rest = text.trim();
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf(". ", maxLen);
    if (cut < maxLen * 0.4) cut = rest.lastIndexOf(" ", maxLen);
    if (cut < 1) cut = maxLen;
    chunks.push(rest.slice(0, cut + (rest[cut] === "." ? 1 : 0)).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export async function synthesizeTtsLong(token, { text, voiceId, onChunk }) {
  const chunks = splitTtsText(text);
  const parts = [];
  for (let i = 0; i < chunks.length; i++) {
    onChunk?.(`TTS ${i + 1}/${chunks.length}: ${chunks[i].slice(0, 40)}…`);
    const data = await synthesizeTts(token, { content: chunks[i], voiceId });
    parts.push(await resolveTtsAudioBase64(data));
  }
  return parts.length === 1 ? parts[0] : mergeWavBase64Parts(parts);
}

/** Naive WAV concat when headers match (same TTS backend). */
export function mergeWavBase64Parts(base64Parts) {
  if (base64Parts.length === 1) return base64Parts[0];
  const bufs = base64Parts.map((b) => base64ToBytes(b));
  const header = bufs[0].slice(0, 44);
  let dataLen = 0;
  const datas = bufs.map((b) => {
    const data = b.slice(44);
    dataLen += data.length;
    return data;
  });
  const out = new Uint8Array(44 + dataLen);
  out.set(header, 0);
  const view = new DataView(out.buffer);
  view.setUint32(4, 36 + dataLen, true);
  view.setUint32(40, dataLen, true);
  let off = 44;
  for (const d of datas) {
    out.set(d, off);
    off += d.length;
  }
  return bytesToBase64(out);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

const PROTOBUF_CT = "application/x-protobuf";
const DT_MAX_SLICE_SEC = 30;

/** OpenAPI AudioToFaceDTUnpackVO / A2fChat2dResponse field numbers. */
const A2F_CHAT2D_FIELDS = {
  1: "fps",
  2: "num_frames",
  3: "model_id",
  4: "ABI",
  5: "AK",
  6: "API",
  7: "ATI",
};

function looksLikeJsonBytes(bytes) {
  let i = 0;
  while (
    i < bytes.length &&
    (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)
  ) {
    i += 1;
  }
  return bytes[i] === 0x7b || bytes[i] === 0x5b;
}

function readVarint(bytes, offset) {
  let result = 0;
  let shift = 0;
  while (offset < bytes.length) {
    const b = bytes[offset];
    offset += 1;
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value: result >>> 0, offset };
    shift += 7;
    if (shift > 35) throw new Error("protobuf varint too long");
  }
  throw new Error("truncated protobuf varint");
}

/** Decode proto3 key/value pairs (varint + length-delimited). */
export function inspectProtobufFields(bytes) {
  const fields = [];
  let offset = 0;
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    offset = tag.offset;
    const fieldNumber = tag.value >>> 3;
    const wireType = tag.value & 7;
    if (wireType === 0) {
      const v = readVarint(bytes, offset);
      offset = v.offset;
      fields.push({ n: fieldNumber, wire: "varint", value: v.value });
    } else if (wireType === 1) {
      offset += 8;
      fields.push({ n: fieldNumber, wire: "fixed64" });
    } else if (wireType === 2) {
      const len = readVarint(bytes, offset);
      offset = len.offset;
      const payload = bytes.subarray(offset, offset + len.value);
      offset += len.value;
      fields.push({ n: fieldNumber, wire: "bytes", value: payload, bytes: payload.length });
    } else if (wireType === 5) {
      offset += 4;
      fields.push({ n: fieldNumber, wire: "fixed32" });
    } else {
      throw new Error(`unsupported protobuf wire type ${wireType} at field ${fieldNumber}`);
    }
  }
  return fields;
}

function utf8(bytes) {
  return new TextDecoder().decode(bytes);
}

function normalizeDtUnpack(data) {
  if (!data || typeof data !== "object") return data;
  return {
    fps: data.fps ?? 25,
    num_frames: data.num_frames,
    modelId: data.modelId ?? data.model_id,
    model_id: data.model_id ?? data.modelId,
    ABI: data.ABI ?? data.abi,
    AK: data.AK ?? data.ak,
    API: data.API ?? data.api,
    ATI: data.ATI ?? data.ati,
    emoteKey: data.emoteKey,
    audioKey: data.audioKey,
    audioBase64: data.audioBase64,
    audio: data.audio,
  };
}

function unpackedHasEmote(data) {
  return Boolean(data?.AK && data?.ABI && data?.ATI && data?.API) || Boolean(data?.emoteKey);
}

function mapA2fFields(fields) {
  const out = {};
  for (const f of fields) {
    const name = A2F_CHAT2D_FIELDS[f.n];
    if (!name) continue;
    if (f.wire === "varint") out[name] = f.value;
    else if (f.wire === "bytes") out[name] = utf8(f.value);
  }
  return normalizeDtUnpack(out);
}

function decodeInnerA2f(bytes) {
  return mapA2fFields(inspectProtobufFields(bytes));
}

/**
 * Unpack POST /audio-to-face/dt success body.
 * Live gateway wraps A2fChat2dResponse:
 *   1:code (varint, 200)  2:msg (string)  3:A2fChat2dResponse
 */
export function decodeA2fChat2dResponse(bytes) {
  const fields = inspectProtobufFields(bytes);
  const codeField = fields.find((f) => f.n === 1 && f.wire === "varint");
  const dataField = fields.find((f) => f.n === 3 && f.wire === "bytes");
  if (codeField?.value === 200 && dataField?.value?.length) {
    const inner = decodeInnerA2f(dataField.value);
    if (unpackedHasEmote(inner)) return inner;
  }

  const mapped = decodeInnerA2f(bytes);
  if (unpackedHasEmote(mapped)) return mapped;

  for (const f of fields) {
    if (f.wire !== "bytes" || !f.value?.length) continue;
    if (looksLikeJsonBytes(f.value)) {
      try {
        const json = JSON.parse(utf8(f.value));
        const inner = normalizeDtUnpack(json.data && json.AK == null ? json.data : json);
        if (unpackedHasEmote(inner)) return inner;
      } catch {
        /* not JSON */
      }
    }
    try {
      const nested = decodeInnerA2f(f.value);
      if (unpackedHasEmote(nested)) return nested;
    } catch {
      /* not nested proto */
    }
  }

  throw new Error("Failed to unpack A2fChat2dResponse (fps/num_frames/model_id/ABI/AK/API/ATI)");
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || "Invalid JSON");
  }
}

async function readDtHttpResponse(res) {
  const buf = new Uint8Array(await res.arrayBuffer());
  const ct = res.headers.get("content-type") || "";
  const asText = () => new TextDecoder().decode(buf);

  if (!res.ok || looksLikeJsonBytes(buf) || (ct.includes("json") && !ct.includes("protobuf"))) {
    if (!buf.byteLength) {
      throw new Error(`POST /audio-to-face/dt failed (HTTP ${res.status})`);
    }
    const json = parseJsonObject(asText());
    if (json.code != null && json.code !== 200) {
      throw new Error(json.msg || `Audio-to-face DT failed (${json.code})`);
    }
    if (!res.ok) {
      throw new Error(json.msg || `POST /audio-to-face/dt failed (HTTP ${res.status})`);
    }
    return normalizeDtUnpack(json.data ?? json);
  }

  if (res.status === 404) {
    throw new Error("POST /audio-to-face/dt returned 404 — check API deployment");
  }
  if (!buf.byteLength) return {};
  return decodeA2fChat2dResponse(buf);
}

function isWav(bytes) {
  return (
    bytes.length >= 44 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  );
}

function wavDurationSec(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const byteRate = view.getUint32(28, true);
  const dataSize = view.getUint32(40, true);
  if (!byteRate) return 0;
  return dataSize / byteRate;
}

function wrapWavChunk(headerSrc, pcm) {
  const out = new Uint8Array(44 + pcm.length);
  out.set(headerSrc.subarray(0, 44), 0);
  out.set(pcm, 44);
  const view = new DataView(out.buffer);
  view.setUint32(4, 36 + pcm.length, true);
  view.setUint32(40, pcm.length, true);
  return out;
}

/** Split wav/mp3 Base64 into ≤30s slices (WAV PCM). Non-WAV is sent as one slice. */
export function splitAudioBase64ForDt(audioBase64) {
  if (!audioBase64) return [""];
  const bytes = base64ToBytes(audioBase64);
  if (!isWav(bytes) || wavDurationSec(bytes) <= DT_MAX_SLICE_SEC) return [audioBase64];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const blockAlign = view.getUint16(32, true) || 1;
  const byteRate = view.getUint32(28, true);
  const maxData = Math.max(blockAlign, Math.floor((DT_MAX_SLICE_SEC * byteRate) / blockAlign) * blockAlign);
  const pcm = bytes.subarray(44);
  const slices = [];
  for (let off = 0; off < pcm.length; off += maxData) {
    slices.push(bytesToBase64(wrapWavChunk(bytes, pcm.subarray(off, off + maxData))));
  }
  return slices.length ? slices : [audioBase64];
}

function concatB64(a, b) {
  if (!a) return b || "";
  if (!b) return a;
  const left = base64ToBytes(a);
  const right = base64ToBytes(b);
  const out = new Uint8Array(left.length + right.length);
  out.set(left, 0);
  out.set(right, left.length);
  return bytesToBase64(out);
}

function mergeDtUnpack(parts) {
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const merged = { ...first };
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    merged.AK = concatB64(merged.AK, p.AK);
    merged.ABI = concatB64(merged.ABI, p.ABI);
    merged.ATI = concatB64(merged.ATI, p.ATI);
    merged.API = concatB64(merged.API, p.API);
    merged.num_frames = (merged.num_frames || 0) + (p.num_frames || 0);
    merged.modelId = merged.modelId || p.modelId;
    merged.model_id = merged.model_id || p.model_id;
  }
  return merged;
}

export { base64ToBytes };

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

async function fetchEmotePayload(emoteKey) {
  if (typeof emoteKey === "string" && emoteKey.startsWith("http")) {
    const res = await fetch(emoteKey);
    if (!res.ok) throw new Error(`emote fetch ${res.status}`);
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return JSON.parse(await res.text());
  }
  return JSON.parse(emoteKey);
}

/** Unwrap OSS / inline emote JSON and validate AK/ABI/ATI/API. */
export function normalizeEmoteFields(emoteRaw) {
  if (!emoteRaw || typeof emoteRaw !== "object") {
    throw new Error("Emote payload is empty");
  }
  if (emoteRaw.type === "error") {
    throw new Error("Emote fetch failed");
  }

  const raw =
    emoteRaw.AK != null
      ? emoteRaw
      : emoteRaw.data && typeof emoteRaw.data === "object"
        ? emoteRaw.data
        : emoteRaw;

  const fields = {
    AK: raw.AK ?? raw.ak,
    ABI: raw.ABI ?? raw.abi,
    ATI: raw.ATI ?? raw.ati,
    API: raw.API ?? raw.api,
    fps: raw.fps,
    modelId: raw.modelId,
    num_frames: raw.num_frames,
  };

  if (!fields.AK || !fields.ABI || !fields.ATI || !fields.API) {
    throw new Error(
      "Emote JSON missing AK/ABI/ATI/API — check emoteKey URL or regenerate /dt",
    );
  }
  return fields;
}

export async function packAtfDriveData({ emoteKey, audioKey, fps }) {
  const emoteRaw = await fetchEmotePayload(emoteKey);
  const emote = normalizeEmoteFields(emoteRaw);

  const audioRes = await fetch(audioKey);
  if (!audioRes.ok) throw new Error(`audio fetch ${audioRes.status}`);
  const audioBuf = await audioRes.arrayBuffer();

  return {
    AK: emote.AK,
    ABI: emote.ABI,
    ATI: emote.ATI,
    API: emote.API,
    fps: fps ?? emote.fps ?? 25,
    modelId: emote.modelId,
    num_frames: emote.num_frames,
    audioArray: new Uint8Array(audioBuf.slice(0)),
    status: "end",
  };
}

/**
 * Build AvatarJS drive payload from /audio-to-face/dt response.
 * Supports URL keys (prod docs) or inline AK/ABI/ATI/API (test env).
 */
export async function packAtfFromDtResponse(data, audioBase64) {
  if (!data) throw new Error("Empty ATF data");
  data = normalizeDtUnpack(data);

  if (data.emoteKey && data.audioKey) {
    return packAtfDriveData({
      emoteKey: data.emoteKey,
      audioKey: data.audioKey,
      fps: data.fps,
    });
  }

  if (data.AK && data.ABI && data.ATI && data.API) {
    let audioArray;
    if (data.audioBase64) {
      audioArray = base64ToBytes(data.audioBase64);
    } else if (typeof data.audio === "string" && data.audio.length > 0) {
      audioArray = base64ToBytes(data.audio);
    } else if (audioBase64) {
      audioArray = base64ToBytes(audioBase64);
    } else if (data.audioKey?.startsWith("http")) {
      const audioRes = await fetch(data.audioKey);
      if (!audioRes.ok) throw new Error(`audio fetch ${audioRes.status}`);
      audioArray = new Uint8Array(await audioRes.arrayBuffer());
    } else {
      throw new Error("ATF inline payload needs audioBase64 or audioKey URL");
    }
    return {
      AK: data.AK,
      ABI: data.ABI,
      ATI: data.ATI,
      API: data.API,
      fps: data.fps ?? 25,
      modelId: data.modelId ?? data.model_id,
      num_frames: data.num_frames,
      audioArray,
      status: "end",
    };
  }

  throw new Error("Unexpected ATF response — missing emoteKey or AK/ABI/ATI/API");
}

/**
 * POST /audio-to-face/dt — one slice.
 * Body: { status, traceId, modelId, data }. Success is protobuf; errors are JSON.
 */
export async function requestAudioToFaceDt(
  token,
  { modelId, audioBase64, traceId, status = "start" },
) {
  if (!modelId) throw new Error("modelId is required for POST /audio-to-face/dt");
  const data = status === "end" ? (audioBase64 ?? "") : (audioBase64 ?? "");
  if (status !== "end" && !data) {
    throw new Error("data (audio Base64) is required on start/middle");
  }
  const res = await fetch(`${getApiBase()}/audio-to-face/dt`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: PROTOBUF_CT,
    },
    body: JSON.stringify({
      status,
      traceId: traceId ?? crypto.randomUUID(),
      modelId,
      data,
    }),
  });
  if (res.status === 404) {
    throw new Error("POST /audio-to-face/dt returned 404 — check API deployment");
  }
  return readDtHttpResponse(res);
}

/** POST /audio-to-face/dt → AvatarJS drive payload (start/middle/end + protobuf unpack). */
export async function audioToFaceDt(token, { modelId, audioBase64, traceId }) {
  const tid = traceId ?? crypto.randomUUID();
  const slices = splitAudioBase64ForDt(audioBase64);
  const parts = [];
  for (let i = 0; i < slices.length; i++) {
    const unpacked = await requestAudioToFaceDt(token, {
      modelId,
      audioBase64: slices[i],
      traceId: tid,
      status: i === 0 ? "start" : "middle",
    });
    if (unpackedHasEmote(unpacked)) parts.push(unpacked);
  }
  try {
    const end = await requestAudioToFaceDt(token, {
      modelId,
      audioBase64: "",
      traceId: tid,
      status: "end",
    });
    if (unpackedHasEmote(end)) parts.push(end);
  } catch (err) {
    if (!parts.length) throw err;
  }
  if (!parts.length) {
    throw new Error("POST /audio-to-face/dt returned no lip-sync frames");
  }
  return packAtfFromDtResponse(mergeDtUnpack(parts), audioBase64);
}

/** Persist emote + optional WAV (base64) for Play welcome after reload. */
export function stripDriveForCache(driveData, modelId) {
  const entry = {
    modelId,
    fps: driveData.fps,
    AK: driveData.AK,
    ABI: driveData.ABI,
    ATI: driveData.ATI,
    API: driveData.API,
  };
  if (driveData.audioArray?.length) {
    entry.audioBase64 = bytesToBase64(driveData.audioArray);
  }
  return entry;
}

export function mergeDriveWithAudio(cached, audioArray) {
  const { audioBase64: _drop, ...emote } = cached;
  return {
    ...emote,
    audioArray,
    status: "end",
  };
}

/** Persist OSS URL drive refs (audioKey + emoteKey). */
export function stripUrlDriveForCache({ modelId, audioKey, emoteKey, fps = 25 }) {
  return {
    modelId,
    audioKey,
    emoteKey,
    fps: fps ?? 25,
  };
}
