import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  auth,
  decodeMugenMorphDtResponse,
  getApiBase,
  mugenMorphDt,
  pollModel,
  queryStyles,
  requestMugenMorphDt,
  setApiOrigin,
} from "../sdk/sumeru-mugen-morph-api.js";
import { DEFAULT_API_ORIGIN } from "../sdk/sumeru-api-config.js";
import { buildDriveFromAudioBase64 } from "../sdk/sumeru-drive.js";
import {
  getEventStatsUrl,
  incrementEventStat,
  setApiOrigin as setEventApiOrigin,
} from "../sdk/sumeru-event-stats.js";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  setApiOrigin(DEFAULT_API_ORIGIN);
  setEventApiOrigin(DEFAULT_API_ORIGIN);
});

// Fixed wire fixture from the companion .proto: fps=25, num_frames=2,
// model_id=mdl-1 and one byte in each ABI/AK/API/ATI field.
const innerProto = Uint8Array.from([
  0x08, 25, 0x10, 2, 0x1a, 5, 109, 100, 108, 45, 49,
  0x22, 4, 65, 65, 61, 61,
  0x2a, 4, 65, 81, 61, 61,
  0x32, 4, 65, 103, 61, 61,
  0x3a, 4, 65, 119, 61, 61,
]);
const envelopeProto = Uint8Array.from([
  0x08, 0xc8, 0x01, // code=200
  0x12, 2, 111, 107, // msg=ok
  0x1a, innerProto.length, ...innerProto,
]);

function protobufResponse(bytes = envelopeProto) {
  return new Response(bytes, { headers: { "Content-Type": "application/x-protobuf" } });
}

function mockFetch(...responses) {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push(new Request(url, options));
    assert.ok(responses.length, "Unexpected request or automatic retry");
    return responses.shift();
  };
  return requests;
}

function wavBase64(seconds) {
  const bytes = new Uint8Array(44 + seconds * 8000 * 2);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode("WAVEfmt "), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  bytes.set(new TextEncoder().encode("data"), 36);
  view.setUint32(40, bytes.length - 44, true);
  return Buffer.from(bytes).toString("base64");
}

test("production defaults use the Mugen3D gateway for API and independent event stats", () => {
  assert.equal(getApiBase(), "https://api.mugen3d.ai/v1");
  assert.equal(getEventStatsUrl(), "https://api.mugen3d.ai/v1/event-stats/increment");
});

test("custom origins accept a /v1 suffix and trailing slashes without duplicating it", async () => {
  for (const origin of [
    " https://example.test/// ", "https://example.test/v1/", "https://example.test/V1///",
  ]) {
    setApiOrigin(origin);
    setEventApiOrigin(origin);
    assert.equal(getApiBase(), "https://example.test/v1");
    assert.equal(getEventStatsUrl(), "https://example.test/v1/event-stats/increment");
  }
  const requests = mockFetch(Response.json({ code: 200, data: [] }));
  await queryStyles("token");
  assert.equal(requests[0].url, "https://example.test/v1/avatars/styles");
});

test("auth uses the new gateway and preserves the accessToken return value", async () => {
  const requests = mockFetch(Response.json({ code: 200, data: { accessToken: "token", expiresIn: 7200 } }));
  assert.equal(await auth("access-key", "secret-key"), "token");
  const [request] = requests;
  assert.equal(request.url, "https://api.mugen3d.ai/v1/access/auth");
  assert.equal(request.method, "POST");
  assert.equal(request.headers.get("Content-Type"), "application/json");
  assert.equal(request.headers.get("Authorization"), null);
  assert.deepEqual(await request.json(), { accessKey: "access-key", secretKey: "secret-key" });
});

test("HTTP failures cannot be treated as successful auth or JSON results", async () => {
  const requests = mockFetch(
    Response.json({ code: 200, msg: "Gateway unavailable" }, { status: 503 }),
    Response.json({ code: 200, msg: "Gateway unavailable" }, { status: 503 }),
  );
  await assert.rejects(auth("key", "secret"), /Gateway unavailable/);
  await assert.rejects(queryStyles("token"), /Gateway unavailable/);
  assert.equal(requests.length, 2);
});

test("the renamed decoder accepts both bare DT protobuf and the gateway envelope", () => {
  for (const bytes of [innerProto, envelopeProto]) {
    const decoded = decodeMugenMorphDtResponse(bytes);
    assert.equal(decoded.fps, 25);
    assert.equal(decoded.num_frames, 2);
    assert.equal(decoded.modelId, "mdl-1");
    assert.deepEqual([decoded.ABI, decoded.AK, decoded.API, decoded.ATI], ["AA==", "AQ==", "Ag==", "Aw=="]);
  }
});

test("DT requests use mugen-morph with Bearer auth, JSON input and protobuf output", async () => {
  const requests = mockFetch(protobufResponse());
  const result = await requestMugenMorphDt("token", {
    modelId: "mdl-1", traceId: "trace-1", status: "start", audioBase64: "UklGRg==",
  });
  const [request] = requests;
  assert.equal(request.url, "https://api.mugen3d.ai/v1/mugen-morph/dt");
  assert.equal(request.method, "POST");
  assert.equal(request.headers.get("Authorization"), "Bearer token");
  assert.equal(request.headers.get("Content-Type"), "application/json");
  assert.equal(request.headers.get("Accept"), "application/x-protobuf");
  assert.deepEqual(await request.json(), {
    modelId: "mdl-1", traceId: "trace-1", status: "start", data: "UklGRg==",
  });
  assert.equal(result.AK, "AQ==");
});

test("DT JSON failures and 404 are surfaced without retrying or switching gateways", async () => {
  for (const status of [400, 500, 404]) {
    const requests = mockFetch(Response.json({ code: status, msg: "DT rejected" }, { status }));
    await assert.rejects(requestMugenMorphDt("token", {
      modelId: "mdl-1", traceId: "trace-1", audioBase64: "UklGRg==",
    }), status === 404 ? /mugen-morph\/dt returned 404/ : /DT rejected/);
    assert.equal(requests.length, 1);
  }
});

test("DT validates required model and audio data before sending a request", async () => {
  const requests = mockFetch();
  await assert.rejects(requestMugenMorphDt("token", { audioBase64: "UklGRg==" }), /modelId is required/);
  await assert.rejects(requestMugenMorphDt("token", { modelId: "mdl-1", status: "middle" }), /data .*required/);
  assert.equal(requests.length, 0);
});

test("long WAV streams preserve traceId and independently playable headers through start/middle/end", async () => {
  const audioBase64 = wavBase64(31);
  const requests = mockFetch(protobufResponse(), protobufResponse(), new Response(null));
  const drive = await mugenMorphDt("token", { modelId: "mdl-1", traceId: "trace-1", audioBase64 });
  const bodies = await Promise.all(requests.map((request) => request.json()));
  assert.deepEqual(bodies.map((body) => body.status), ["start", "middle", "end"]);
  assert.ok(bodies.every((body) => body.traceId === "trace-1" && body.modelId === "mdl-1"));
  assert.ok(requests.every((request) => request.url === "https://api.mugen3d.ai/v1/mugen-morph/dt"));
  const segments = bodies.slice(0, 2).map((body) => Buffer.from(body.data, "base64"));
  for (const segment of segments) {
    assert.equal(segment.toString("ascii", 0, 4), "RIFF");
    assert.equal(segment.toString("ascii", 8, 12), "WAVE");
    assert.equal(segment.readUInt32LE(4), segment.length - 8);
    assert.equal(segment.readUInt32LE(40), segment.length - 44);
  }
  assert.deepEqual(segments.map((segment) => (segment.length - 44) / 16000), [30, 1]);
  assert.equal(bodies[2].data, "");
  assert.equal(drive.num_frames, 4);
  assert.equal(drive.AK, "AQE=");
  assert.deepEqual(drive.audioArray, new Uint8Array(Buffer.from(audioBase64, "base64")));
});

test("drive helpers resolve the renamed API module and attach the caller's audio", async () => {
  const requests = mockFetch(protobufResponse(), new Response(null));
  const audioBase64 = wavBase64(1);
  const drive = await buildDriveFromAudioBase64("token", { modelId: "mdl-1", audioBase64 });
  assert.equal(drive.modelId, "mdl-1");
  assert.equal(drive.ABI, "AA==");
  assert.deepEqual(drive.audioArray, new Uint8Array(Buffer.from(audioBase64, "base64")));
  assert.equal(requests.length, 2);
});

test("model polling waits for files instead of returning a downloadLink alone", async () => {
  const ready = { status: "1", files: [{ name: "info.json", url: "https://files.test/info.json" }] };
  const requests = mockFetch(
    Response.json({ code: 200, data: { status: "3" } }),
    Response.json({ code: 200, data: { status: "1", downloadLink: "https://files.test/model.bin" } }),
    Response.json({ code: 200, data: ready }),
  );
  assert.deepEqual(await pollModel("token", "mdl-1", { intervalMs: 0 }), ready);
  assert.equal(requests.length, 3);
  assert.ok(requests.every((request) => request.url === "https://api.mugen3d.ai/v1/avatars/models/mdl-1"));
});

test("event reporting uses the new host while retaining its independent path and anonymous payload", async () => {
  const requests = mockFetch(Response.json({ code: 200 }));
  const result = await incrementEventStat({ oncePerBrowser: false });
  const [request] = requests;
  assert.equal(result.ok, true);
  assert.equal(request.url, "https://api.mugen3d.ai/v1/event-stats/increment");
  assert.equal(request.method, "POST");
  assert.equal(request.headers.get("Authorization"), null);
  const body = await request.json();
  assert.equal(body.bizType, "10");
  assert.equal(body.eventType, "2");
  assert.equal(body.eventKey, "sdk/talkinghead/install_success");
});
