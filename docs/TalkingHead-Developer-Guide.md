# TalkingHead Web SDK — Developer Guide

This guide explains how to use the **SumeruAI Developer Open API** and the SDK in this repo to load a TalkingHead avatar in the browser and drive lip-sync playback.

---

## 1. What this SDK is

| Layer             | Source                                                                 | Role                                                                        |
| ----------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Open API**      | `POST /v1/*`                                                           | Auth, voice clone, model, TTS, lip-sync `/audio-to-face/dt`                 |
| **This repo SDK** | `sdk/sumeru-atf-api.js`, `sdk/sumeru-avatar.js`, `sdk/sumeru-drive.js` | HTTP helpers + lip-sync drive helpers                                       |
| **AvatarJS**      | CDN `static.sumeruai.com`                                              | Closed-source render core                                                   |
| **Workers**       | This repo `workers/`                                                   | `decoderWorker.js`, `rendererWorker.js` must be served from the same origin |

---

## 2. API base URL

|                                    | Value                        |
| ---------------------------------- | ---------------------------- |
| **API origin** (Developer sandbox) | `https://api.sumeruai.us`    |
| **API base**                       | `https://api.sumeruai.us/v1` |

Enter the **site origin** only (no `/v1`). All Developer sandbox fields start **empty** — placeholders are hints only.

Official API reference: [Developer API](https://api.sumeruai.us)

Credentials: `accessKey` + `secretKey` → `POST /v1/access/auth` → `accessToken` (Bearer).

**Do not commit** `config.local.js` (listed in `.gitignore`).

---

## 3. Demo modes

Online demo: `index.html` (`npx serve .` or GitHub Pages)

### 3.1 Quick demo (default · no key)

For visitors / GitHub users — **no TTS or ATF API calls**.

| File                             | Purpose                                 |
| -------------------------------- | --------------------------------------- |
| `demo/assets-cache.json`         | `modelId`, `downloadLink`               |
| `demo/assets/welcome.wav`        | Bundled welcome audio                   |
| `demo/assets/welcome-emote.json` | Bundled lip-sync (`AK/ABI/ATI/API/fps`) |

Usage: the page auto-loads the bundled model on **`#quick-avatar-canvas`** on open; click **Play welcome** to drive lip-sync (no API). Switching tabs **stops** playback but keeps each mode’s avatar on its own canvas.

### 3.2 Developer sandbox

Bring your own **accessKey**, **modelId**, **downloadLink**, and **voiceId**. Uses a **separate `#dev-avatar-canvas`** — nothing renders until **Load model**.

Usage: switch to **Developer sandbox** → fill every field yourself → **Load model** (creates `#dev-avatar-canvas`) → either:

- **Text → TTS + /dt + Play** — script + `voiceId`
- **Audio → /dt + Play** — upload WAV/audio

The same calls live in **`sdk/sumeru-drive.js`** for copy-paste into your app. **Switching back to Quick demo stops playback.**

---

## 4. Lip-sync flow (what developers integrate)

You already have a TalkingHead **modelId**, **downloadLink**, and clone **voiceId** (from Studio or your backend). In the browser:

```
① POST /v1/access/auth
   → accessToken

② createAvatar({ modelUrl: downloadLink })

③ Path A — text:
     POST /v1/tts { content, voiceId } → audioBase64
   Path B — audio:
     use your WAV file as base64

④ POST /v1/audio-to-face/dt { modelId, dialogueBase64, status:"start" }
   → drive payload (inline AK/ABI/ATI/API or fetch via emoteKey/audioKey)

⑤ avatar.drive(driveData)   // sdk/sumeru-drive.js wraps ③–⑤
```

Use **`sdk/sumeru-drive.js`**:

```javascript
import { auth } from "./sdk/sumeru-atf-api.js";
import { createAvatar } from "./sdk/sumeru-avatar.js";
import { driveFromText, driveFromAudioFile } from "./sdk/sumeru-drive.js";

const token = await auth(accessKey, secretKey);
const avatar = await createAvatar({
  canvas,
  modelUrl: downloadLink,
  workerBase: "./workers/",
});
// wait for onReady…

await driveFromText(avatar, token, { modelId, voiceId, text: "Hello!" });
// or
await driveFromAudioFile(avatar, token, { modelId, file: wavFile });
```

Model / voice **creation** APIs (`POST /v1/avatars/models`, `/v1/voices`, etc.) are out of scope for this demo — obtain IDs elsewhere, then drive lip-sync here.

### 4.1 modelId vs Studio avatarsId

| ID            | Purpose                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------- |
| **modelId**   | **Required** for **`/audio-to-face/dt`**; `GET /v1/avatars/models/{modelId}` → `downloadLink` |
| **avatarsId** | Mugen3D Studio product id; portrait API returns `modelId`, `downloadLink`, etc.               |

You cannot call `/dt` with avatarsId alone — you need **modelId + audio**.

---

## 5. Developer sandbox fields ↔ API

| Demo field   | How to obtain                                             |
| ------------ | --------------------------------------------------------- |
| accessToken  | `POST /v1/access/auth` or paste after **Get accessToken** |
| modelId      | Studio / `GET /v1/avatars/models/{modelId}`               |
| downloadLink | Same model response, or Studio                            |
| voiceId      | Clone voice used with `POST /v1/tts`                      |
| script text  | Your copy → **Text → TTS + /dt + Play**                   |
| audio file   | Local WAV → **Audio → /dt + Play**                        |

---

## 6. Local asset provisioning (Quick demo / save API quota)

Maintainers run once (needs keys — do not commit keys):

```bash
ACCESS_KEY=xxx SECRET_KEY=xxx \
VOICE_WAV=/path/to/sample.wav \
PHOTO_JPG=/path/to/face.jpg \
node scripts/provision-assets.mjs
```

Or with existing `voiceId` / `modelId`:

```bash
ACCESS_KEY=xxx SECRET_KEY=xxx \
VOICE_ID=YOUR_VOICE_ID \
MODEL_ID=YOUR_MODEL_ID \
DOWNLOAD_LINK=https://oss.sumeruai.com/.../dt/... \
node scripts/provision-assets.mjs
```

Script output:

- `demo/assets/welcome.wav`
- `demo/assets/welcome-emote.json`
- `demo/assets-cache.json`

**Commit those asset files to Git** so visitors can use Quick demo without calling the API themselves.  
`demo/assets-cache.json` holds **bundled Quick demo** model metadata only (no keys). **Developer sandbox** fields are never read from this file — developers paste their own IDs in the UI.

### 6.1 Optional: verify your Developer credentials locally

`scripts/fetch-dev-test-data.mjs` prints form values to **stdout only** (never writes into the repo). Run on your machine with **your** keys and IDs:

```powershell
$env:ACCESS_KEY="YOUR_ACCESS_KEY"
$env:SECRET_KEY="YOUR_SECRET_KEY"
$env:MODEL_ID="YOUR_MODEL_ID"
$env:VOICE_ID="YOUR_VOICE_ID"
$env:API_ORIGIN="https://api.sumeruai.us"   # optional
node scripts/fetch-dev-test-data.mjs
```

Copy the JSON output into the Developer sandbox form manually. Do not commit tokens or keys.

---

## 7. Code integration

### 7.0 `sdk/sumeru-drive.js` (recommended)

| Export                                                               | Description                          |
| -------------------------------------------------------------------- | ------------------------------------ |
| `driveFromText(avatar, token, { modelId, voiceId, text, onChunk? })` | TTS → `/dt` → play                   |
| `driveFromAudioFile(avatar, token, { modelId, file })`               | File → `/dt` → play                  |
| `driveFromAudioBase64(avatar, token, { modelId, audioBase64 })`      | Base64 WAV → `/dt` → play            |
| `buildDriveFromText` / `buildDriveFromAudioFile`                     | Return drive payload without playing |
| `playDriveOnAvatar(avatar, driveData)`                               | Play an existing payload             |

See `examples/minimal.html` and `demo/demo.js` (Developer sandbox uses the same imports).

### 7.1 Quick demo (bundled, no API)

```javascript
import { createAvatar } from "./sdk/sumeru-avatar.js";
import { buildBundledDrive } from "./sdk/demo-cache.js";

const avatar = await createAvatar({
  canvas: document.querySelector("#canvas"),
  modelUrl: downloadLink,
  workerBase: "./workers/",
  onReady: () => console.log("ready"),
});

const bundled = await buildBundledDrive(
  "./demo/assets/welcome-emote.json",
  "./demo/assets/welcome.wav"
);
avatar.unlockAudio();
avatar.drive(bundled, false);
```

### 7.2 `avatar.drive()` payload fields

| Field                     | Required  | Description                                           |
| ------------------------- | --------- | ----------------------------------------------------- |
| `AK`, `ABI`, `ATI`, `API` | Yes       | Lip-sync data from `/dt` or `welcome-emote.json`      |
| `fps`                     | Yes       | Frame rate, usually 25 or 30                          |
| `audioArray` or `audio`   | One of    | WAV bytes; local preview uses `welcome.wav`           |
| `status`                  | Streaming | `start` / `middle` / `end`; use `end` for a full clip |
| 2nd arg `append`          | No        | `false` new clip, `true` append chunk                 |

**Replay:** AvatarJS **detaches** the underlying `ArrayBuffer` of `audioArray` when decoding WAV. You may call `avatar.drive()` multiple times with the same `driveData` object — the SDK clones via `cloneDrivePayload()` before `receiveData`. If you call AvatarJS `receiveData` directly, pass `new Uint8Array(buf.slice(0))` yourself (same as Studio `useAtfChat`).

Deploy `workers/decoderWorker.js` and `workers/rendererWorker.js` on the same origin as the page; reference them with `workerBase: "./workers/"`.

### 7.3 AvatarJS lifecycle and callbacks

`createAvatar()` wraps [AvatarJS](https://static.sumeruai.com/new-avatars/AvatarJS.js) (CDN, closed source). Constructor callbacks map to SDK options as follows:

| `createAvatar` option | AvatarJS internal  | When it fires                          | Typical use                                        |
| --------------------- | ------------------ | -------------------------------------- | -------------------------------------------------- |
| `onReady`             | `OnWorkerReady`    | Model worker loaded, canvas renderable | Enable Play, call `avatar.drive()`                 |
| `onAnimationReady`    | `OnAnimationReady` | Lip-sync decoded                       | SDK auto `startPlay2()` — lip-sync + audio in sync |
| `onPlayEnd`           | `OnPlayEnd`        | Visual track finished                  | UI idle state, allow next `drive`                  |
| `onProgress`          | `updateSeekBar`    | Playback progress                      | `percent` 0–100, progress bar / badge              |
| `onAudioEnd`          | `audioEnd`         | Audio track finished                   | End state with `onPlayEnd`                         |
| `onError`             | `OnError`          | Load/decode/render error               | Notify user, reset UI                              |

**Instance methods (returned by `createAvatar`):**

| Method                | AvatarJS             | Description                                                           |
| --------------------- | -------------------- | --------------------------------------------------------------------- |
| `drive(data, append)` | `receiveData`        | Feed ATF drive payload; `append=false` new clip, `true` stream append |
| `stop()`              | `stopPlay`           | **Stop immediately** lip-sync and audio (tab switch, Stop button)     |
| `unlockAudio()`       | —                    | Resume `AudioContext` inside a user gesture (otherwise silent)        |
| `destroy()`           | `stopPlay` + `close` | Tear down instance, release workers                                   |

```javascript
const avatar = await createAvatar({
  canvas,
  modelUrl: downloadLink,
  workerBase: "./workers/",
  onReady: () => console.log("model ready"),
  onAnimationReady: () => console.log("emote decoded"),
  onPlayEnd: () => console.log("visual track ended"),
  onProgress: (pct) => console.log("playing", pct),
  onAudioEnd: () => console.log("audio ended"),
  onError: (err) => console.error(err),
});

// After user click
avatar.unlockAudio();
avatar.drive(driveData, false);

// Before route / tab change / next clip
avatar.stop();
```

The Demo calls `avatar.stop()` when switching **Quick demo ↔ Developer sandbox**; the badge returns to **Ready**.

---

## 8. Local development

```bash
cp config.local.example.js config.local.js   # add accessKey / secretKey
npm install   # if dependencies are added later
npx serve .
# http://localhost:3000
```

`config.local.js` can override Quick demo asset paths only. It does **not** pre-fill the Developer sandbox form.

---

## 9. FAQ

**`/dt` returns inline AK/ABI/ATI/API instead of emoteKey URLs?**  
Some responses return inline fields — `audioToFaceDt` / `sumeru-drive.js` handle both inline and URL formats.

**Lip-sync missing but audio plays?**  
Use audio and emote from the **same** `/dt` call. Do not mix stale OSS keys from an old run.

**No audio on Play?**  
Browsers require a user gesture; click the page then Play. `sumeru-drive.js` calls `unlockAudio()` for you.

**CORS errors?**  
Direct browser calls to `api.sumeruai.us` / OSS need server-side CORS for your origin. Test locally with `npx serve .`.

**TTS length limit?**  
≤150 characters per chunk; `synthesizeTtsLong` splits on sentence boundaries.

---

## 10. Further reading

- [Developer API](https://api.sumeruai.us)
- OpenAPI spec: `mugen3d/platform/openapi.json`

---

## Changelog

| Date       | Notes           |
| ---------- | --------------- |
| 2026-08-11 | Developer-Guide |
