# TalkingHead Web SDK

Browser runtime demo for **SumeruAI TalkingHead** digital humans. Integrates:

- **Developer Open API** — auth, voice clone, model, TTS, `POST /mugen-morph/dt`
- **This repo SDK** — `sdk/sumeru-api-config.js`, `sdk/sumeru-mugen-morph-api.js`, `sdk/sumeru-avatar.js`, `sdk/sumeru-drive.js`, `sdk/sumeru-event-stats.js`
- **AvatarJS** (CDN render core) + **local Workers** (`workers/`)

**Start here:** [TalkingHead Developer Guide](./docs/TalkingHead-Developer-Guide.md)

## Demo (`index.html`)

The repo ships an interactive demo at **`index.html`** — the entry point for trying the SDK locally or on GitHub Pages.

| File                               | Role                                          |
| ---------------------------------- | --------------------------------------------- |
| [`index.html`](./index.html)       | Demo UI (Quick + Developer tabs)              |
| [`demo/demo.js`](./demo/demo.js)   | Demo logic — auth, model load, drive playback |
| [`demo/demo.css`](./demo/demo.css) | Demo layout and styles                        |

**Run locally**

```bash
cp config.local.example.js config.local.js   # optional — Quick demo paths only
npx serve .
# open http://localhost:3000/  (serves index.html)
```

**Do not open `index.html` via `file://`** — ES modules and Workers require HTTP.

### Quick demo tab

- Canvas: `#quick-avatar-canvas`
- Local `demo/models/{modelId}/` first, then remote `downloadLink`; **hidden** if neither works
- Welcome audio/lip-sync from `demo/assets/` (`welcome.wav` + `welcome-emote.json`)
- **No API key** — model auto-loads on page open when files exist; click **Play welcome** for lip-sync
- Optional: `config.local.js` can override asset paths (Developer tab is never pre-filled)

### Developer sandbox tab

- Canvas: created on **Load model** as `#dev-avatar-canvas` (separate from Quick demo)
- Form fields start **empty** — paste your own `accessKey`, `secretKey`, `modelId`, **hosted model directory**
- Host `GET /avatars/models/{id}` → `files[]` on **your server** in **one directory** (same prefix for every `name`), then paste that directory (do not use API temp URLs)
- **Get accessToken** → **Load model** → **Audio → /dt + Play** (upload WAV/audio; `/dt` returns lip-sync only)
- Same flow as [`sdk/sumeru-drive.js`](./sdk/sumeru-drive.js) — copy into your app
- Switching tabs **stops** playback; each mode keeps its own canvas

### Live demo (GitHub Pages)

Enable **Settings → Pages → Deploy from branch `main` / root**, then open:

`https://<your-org>.github.io/TalkingHead/`

(GitHub Pages serves `index.html` at the repo root.)

### Minimal integration template

For a stripped-down starting point to copy into your project, use [`examples/minimal.html`](./examples/minimal.html) — not the full demo UI. See [Developer Guide §4.0](./docs/TalkingHead-Developer-Guide.md#40-minimal-integration-files-to-copy).

## API base URL

|                | Value                              |
| -------------- | ---------------------------------- |
| **API origin** | `https://api.mugen3d.ai`    |
| **API base**   | `https://api.mugen3d.ai/v1` |
| **Auth**       | `POST /v1/access/auth`             |

Token is issued by `POST https://api.mugen3d.ai/v1/access/auth`. See [Developer API](https://mugen3d.ai/api/developers/docs-api) for the Open API reference.

Defaults and origin normalization live in `sdk/sumeru-api-config.js`. `setApiOrigin()` accepts either an origin or a `/v1` base URL, including a trailing slash. A custom origin does not enable automatic fallback to older endpoints.

The MugenMorph API module is `sdk/sumeru-mugen-morph-api.js`; its public helpers include `mugenMorphDt()`, `requestMugenMorphDt()`, `decodeMugenMorphDtResponse()`, `packMugenMorphDriveData()` and `packMugenMorphFromDtResponse()`. Update existing imports and call sites: previous module and function names have no compatibility aliases.

## Bundled Quick demo assets

Committed for public playback without API calls (used by `index.html` Quick tab):

| File                             | Purpose                                                 |
| -------------------------------- | ------------------------------------------------------- |
| `demo/models/{modelId}/`         | Local model artifacts (`files[].name`)                  |
| `demo/assets-cache.json`         | `modelId`, `modelDir`, remote fallback, drive paths     |
| `demo/assets/welcome.wav`        | Welcome TTS audio                                       |
| `demo/assets/welcome-emote.json` | Lip-sync (`AK/ABI/ATI/API/fps`)                         |

Refresh (maintainers only):

```bash
ACCESS_KEY=... SECRET_KEY=... VOICE_ID=... MODEL_ID=... DOWNLOAD_LINK=... \
  node scripts/provision-assets.mjs
```

## SDK usage

```javascript
import { createAvatar, modelUrlFromSelfHost } from "./sdk/sumeru-avatar.js";
import { driveFromAudioFile } from "./sdk/sumeru-drive.js";

// Supplied by your application server after it calls /v1/access/auth.
const token = shortLivedTokenFromYourServer;
const avatar = await createAvatar({
  canvas: document.querySelector("#canvas"),
  modelUrl: modelUrlFromSelfHost("https://cdn.your-company.com/talkinghead/mdl_xxx/"),
  workerBase: "./workers/",
});

await driveFromAudioFile(avatar, token, { modelId, file: wavFile });
```

In production, keep `secretKey` on your application server and supply the browser with a short-lived token. The Developer sandbox retains `auth(accessKey, secretKey)` for local debugging; this repository does not include a token service.

See the [Developer Guide](./docs/TalkingHead-Developer-Guide.md) for the full Open API flow, [minimal copy checklist](./docs/TalkingHead-Developer-Guide.md#40-minimal-integration-files-to-copy), and [`sumeru-avatar.js` API](./docs/TalkingHead-Developer-Guide.md#74-sdk-sumeru-avatarjs).

## Repository layout

```
TalkingHead/
├── index.html              # Interactive demo (Quick + Developer tabs)
├── demo/
│   ├── demo.js             # Demo app logic
│   ├── demo.css            # Demo styles
│   ├── assets/             # welcome.wav, welcome-emote.json
│   └── models/             # Quick demo files[] (local first)
├── examples/
│   └── minimal.html        # Minimal integration template (copy into your app)
├── sdk/                    # api-config, mugen-morph-api, avatar, drive, event-stats
├── workers/                # decoderWorker.js, rendererWorker.js
├── scripts/provision-assets.mjs
└── docs/
    └── TalkingHead-Developer-Guide.md
```

## What is **not** in this repo

Decoder/renderer internals are served from SumeruAI CDN with AvatarJS. Do not redistribute those files.

## CORS

Browser calls to API / OSS / CDN require server-side CORS for your origin. Test locally with `npx serve .` first.

## Verification

Run `npm test` for mocked API contract tests. They cover the new gateway, authentication, MugenMorph DT protobuf/JSON responses, independent WAV segments, model file readiness and event request construction; no real API calls are made.

The event helper now defaults to `https://api.mugen3d.ai/v1/event-stats/increment`, retaining its existing anonymous SDK route. That route is absent from the local OpenAPI contract and still needs deployment verification. It remains independent of the business API origin and supports `siteOrigin` overrides; reporting failures do not block avatar rendering.

## License

MIT — see [LICENSE](./LICENSE). AvatarJS CDN runtime remains subject to SumeruAI product terms.
