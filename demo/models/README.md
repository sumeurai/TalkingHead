# Quick demo model files

Put the official Quick demo TalkingHead artifacts here (from `GET /v1/avatars/models/{modelId}` → `files[]`).

**All files must live in the same directory.** AvatarJS requests `{modelUrl}{name}` (e.g. `mBC.bin`, `info.json`). Do not split the set across folders or hosts.

`createAvatar` turns `./demo/models/{id}/` into an absolute page URL. If you pass a raw relative path into AvatarJS yourself, Workers resolve it as `/workers/demo/models/…` and textures 404.

```
demo/models/{modelId}/          ← one prefix for the whole set
  info.json
  idle.json
  mTC.bin  mBC.bin  mPC.bin
  768_1024.webp  body.png
  TIY.png  TWY.png  TK.png
  BIY.png  BWY.png  BK.png
  PIY.png  PWY.png  PK.png
```

`demo/assets-cache.json` points at this folder via `modelDir` / `modelFiles`.

Load order in the Demo:

1. This local directory (same origin)
2. Remote `downloadLink` fallback
3. Hide the Quick stage if neither works

`welcome.wav` / `welcome-emote.json` stay in `demo/assets/` — those are lip-sync packs, not model files.

Maintainers: `node scripts/provision-assets.mjs` downloads `files[]` into `demo/models/{modelId}/` and updates the cache.
