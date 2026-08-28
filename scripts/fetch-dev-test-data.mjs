/**
 * Local helper: print Developer sandbox form fields from Open API.
 * Output goes to stdout only — never writes into this repo.
 *
 * Usage (PowerShell):
 *   $env:ACCESS_KEY="YOUR_ACCESS_KEY"
 *   $env:SECRET_KEY="YOUR_SECRET_KEY"
 *   $env:MODEL_ID="YOUR_MODEL_ID"
 *   $env:VOICE_ID="YOUR_VOICE_ID"
 *   $env:API_ORIGIN="https://overseas.sumeruai.com"   # optional
 *   node scripts/fetch-dev-test-data.mjs
 */

const API_ORIGIN = process.env.API_ORIGIN ?? "https://overseas.sumeruai.com";
const API_BASE = `${API_ORIGIN.replace(/\/$/, "")}/v1`;
const ACCESS_KEY = process.env.ACCESS_KEY ?? "";
const SECRET_KEY = process.env.SECRET_KEY ?? "";
const MODEL_ID = process.env.MODEL_ID ?? "";
const VOICE_ID = process.env.VOICE_ID ?? "";

async function parseJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }
}

async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return parseJson(res);
}

function requireEnv(name, value) {
  if (!value?.trim()) {
    console.error(`Missing env ${name}.`);
    console.error(
      "Required: ACCESS_KEY, SECRET_KEY, MODEL_ID, VOICE_ID. Optional: API_ORIGIN.",
    );
    process.exit(1);
  }
  return value.trim();
}

async function main() {
  requireEnv("ACCESS_KEY", ACCESS_KEY);
  requireEnv("SECRET_KEY", SECRET_KEY);
  requireEnv("MODEL_ID", MODEL_ID);
  requireEnv("VOICE_ID", VOICE_ID);

  console.log("API origin:", API_ORIGIN.replace(/\/$/, ""));
  console.log("(stdout only — paste into Developer sandbox yourself; not saved to repo)\n---");

  const authRes = await api("/access/auth", {
    method: "POST",
    body: { accessKey: ACCESS_KEY, secretKey: SECRET_KEY },
  });
  if (authRes.code !== 200) {
    console.error("Auth failed:", authRes.msg || authRes);
    process.exit(1);
  }
  const token = authRes.data.accessToken;
  console.log("accessToken:", token);
  console.log("---");

  const modelRes = await api(`/avatars/models/${MODEL_ID}`, { token });
  if (modelRes.code !== 200) {
    console.error("Model GET failed:", modelRes.msg || modelRes);
  } else {
    const m = modelRes.data;
    console.log("modelId:", MODEL_ID);
    console.log("model status:", m.status);
    const files = Array.isArray(m.files) ? m.files : [];
    console.log("files:", files.length ? files.map((f) => f.name).join(", ") : "(none — poll until status=1)");
    for (const file of files) {
      console.log(`  ${file.name}: ${file.url}`);
    }
    console.log("downloadLink (24h temp, do not use as createAvatar modelUrl):", m.downloadLink ?? "(pending)");
  }
  console.log("---");

  const voiceRes = await api(`/voices/${VOICE_ID}`, { token });
  if (voiceRes.code !== 200) {
    console.error("Voice GET failed:", voiceRes.msg || voiceRes);
  } else {
    const v = voiceRes.data;
    console.log("voiceId:", VOICE_ID);
    console.log("voice status:", v.status, "(1 = ready)");
    console.log("voice name:", v.name ?? v.audioName ?? "—");
  }
  console.log("---");

  console.log("\nPaste into Developer sandbox (do not commit):");
  console.log(
    JSON.stringify(
      {
        apiOrigin: API_ORIGIN.replace(/\/$/, ""),
        accessToken: token,
        modelId: MODEL_ID,
        modelUrl: "(host files[] on YOUR server, then paste that directory URL)",
        files: modelRes.data?.files ?? [],
      },
      null,
      2,
    ),
  );

  if (modelRes.code === 200 && String(modelRes.data?.status) !== "1") {
    console.warn("\nNote: model is not ready. Wait or poll GET /avatars/models/{id}.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
