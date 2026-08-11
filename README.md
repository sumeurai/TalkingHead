# TalkingHead Web SDK

Browser runtime demo for **SumeruAI TalkingHead** digital humans. Integrates:

- **Developer Open API** — auth, voice clone, model, TTS, `POST /audio-to-face/dt`
- **This repo SDK** — `sdk/sumeru-atf-api.js`, `sdk/sumeru-avatar.js`, `sdk/sumeru-drive.js`
- **AvatarJS** (CDN render core) + **local Workers** (`workers/`)

**Start here:** [TalkingHead Developer Guide](./docs/TalkingHead-Developer-Guide.md)

## Live demo (GitHub Pages)

Enable **Settings → Pages → Deploy from branch `main` / root**, then open:

`https://<your-org>.github.io/TalkingHead/`

**Quick demo** tab: bundled `welcome.wav` + `welcome-emote.json` — **no API key**.  
**Developer sandbox** tab: your keys + `modelId` / `voiceId` → text or audio → `/dt` (see `sdk/sumeru-drive.js`).

## API base URL

| | Value |
|---|--------|
| **API origin** | `https://api.sumeruai.us` |
| **API base** | `https://api.sumeruai.us/v1` |

See [Developer API](https://api.sumeruai.us) for the official Open API reference.

Local overrides: copy `config.local.example.js` → `config.local.js` (gitignored, Quick demo paths only — Developer tab stays empty).

## Bundled Quick demo assets

Committed for public playback without API calls:

| File | Purpose |
|------|---------|
| `demo/assets-cache.json` | `modelId`, `downloadLink`, paths to bundled drive files |
| `demo/assets/welcome.wav` | Welcome TTS audio |
| `demo/assets/welcome-emote.json` | Lip-sync (`AK/ABI/ATI/API/fps`) |

Refresh (maintainers only):

```bash
ACCESS_KEY=... SECRET_KEY=... VOICE_ID=... MODEL_ID=... DOWNLOAD_LINK=... \
  node scripts/provision-assets.mjs
```

## Quick start (local)

```bash
cp config.local.example.js config.local.js   # optional — Quick demo paths only
npx serve .
```

1. **Quick demo** — bundled model auto-loads on open; click **Play welcome** (no key)
2. **Developer sandbox** — fill keys + IDs → **Load model** on `#dev-avatar-canvas` → text or audio → play

## SDK usage

```javascript
import { createAvatar } from "./sdk/sumeru-avatar.js";
import { auth } from "./sdk/sumeru-atf-api.js";
import { driveFromText } from "./sdk/sumeru-drive.js";

const token = await auth(accessKey, secretKey);
const avatar = await createAvatar({
  canvas: document.querySelector("#canvas"),
  modelUrl: downloadLink,
  workerBase: "./workers/",
});

await driveFromText(avatar, token, {
  modelId,
  voiceId,
  text: "Hello!",
});
```

See the [Developer Guide](./docs/TalkingHead-Developer-Guide.md) for the full Open API flow and Demo field map.

## Repository layout

```
TalkingHead/
├── index.html              # Demo (Quick + Developer tabs)
├── demo/assets/            # welcome.wav, welcome-emote.json
├── sdk/                    # sumeru-atf-api, sumeru-avatar, sumeru-drive
├── workers/                # decoderWorker.js, rendererWorker.js
├── scripts/provision-assets.mjs
└── docs/
    └── TalkingHead-Developer-Guide.md
```

## What is **not** in this repo

Decoder/renderer internals are served from SumeruAI CDN with AvatarJS. Do not redistribute those files.

## CORS

Browser calls to API / OSS / CDN require server-side CORS for your origin. Test locally with `npx serve .` first.

## License

MIT — see [LICENSE](./LICENSE). AvatarJS CDN runtime remains subject to SumeruAI product terms.
