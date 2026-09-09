import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  API_ORIGINS,
  createStyleGeneration,
  getStyleGeneration,
  pollStyleGeneration,
  queryStyles,
  setApiOrigin,
} from "../sdk/sumeru-atf-api.js";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  setApiOrigin(API_ORIGINS.overseas);
});

function mockApi(...responses) {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push(new Request(url, options));
    assert.ok(responses.length, "Unexpected API request");
    return Response.json(responses.shift());
  };
  return requests;
}

test("style listing uses an authenticated GET with no body", async () => {
  setApiOrigin("https://example.test/");
  const styles = [{ id: 123, name: "Casual" }];
  const requests = mockApi({ code: 200, data: styles });
  assert.deepEqual(await queryStyles("test-token"), styles);
  const [request] = requests;
  assert.equal(request.url, "https://example.test/v1/avatars/styles");
  assert.equal(request.method, "GET");
  assert.equal(request.headers.get("Authorization"), "Bearer test-token");
  assert.equal(request.headers.get("Content-Type"), null);
  assert.equal(request.body, null);
});

test("style creation sends file multipart bytes and styleId in the query", async () => {
  const photoFile = new File(["photo-content"], "portrait.png", { type: "image/png" });
  const data = { id: "task-123", expireMinutes: 60 };
  const requests = mockApi({ code: 200, data });
  assert.deepEqual(await createStyleGeneration("test-token", {
    styleId: "9223372036854775807", photoFile,
  }), data);
  const [request] = requests;
  const url = new URL(request.url);
  assert.equal(url.pathname, "/v1/avatars/styles");
  assert.equal(url.searchParams.get("styleId"), "9223372036854775807");
  assert.equal(request.method, "POST");
  assert.equal(request.headers.get("Authorization"), "Bearer test-token");
  assert.match(request.headers.get("Content-Type"), /^multipart\/form-data; boundary=/);
  const form = await request.formData();
  assert.deepEqual([...form.keys()], ["file"]);
  assert.equal(form.get("file").name, "portrait.png");
  assert.equal(form.get("file").type, "image/png");
  assert.equal(await form.get("file").text(), "photo-content");
});

test("provisioning Blob input retains the fallback photo filename", async () => {
  const requests = mockApi({ code: 200, data: { id: "task-123" } });
  await createStyleGeneration("test-token", {
    styleId: 123, photoFile: new Blob(["photo"], { type: "image/jpeg" }),
  });
  assert.equal((await requests[0].formData()).get("file").name, "photo.jpg");
});

test("result lookup uses the new path and escapes the task id", async () => {
  const data = { id: "a/b?c", status: "1", imgList: ["https://example.test/photo.jpg"] };
  const requests = mockApi({ code: 200, data });
  assert.deepEqual(await getStyleGeneration("test-token", data.id), data);
  assert.equal(new URL(requests[0].url).pathname, "/v1/avatars/styles/results/a%2Fb%3Fc");
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[0].body, null);
});

test("polling follows processing to success using the results endpoint", async () => {
  const done = { id: "task-123", status: "1", imgList: ["photo.jpg"] };
  const requests = mockApi(
    { code: 200, data: { status: "3" } },
    { code: 200, data: done },
  );
  assert.deepEqual(await pollStyleGeneration("test-token", "task-123", { intervalMs: 0 }), done);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(new URL(request.url).pathname, "/v1/avatars/styles/results/task-123");
  }
});

test("polling reports failed or expired generation tasks", async () => {
  mockApi({ code: 200, data: { status: "4" } });
  await assert.rejects(pollStyleGeneration("test-token", "expired"), /Style generation failed/);
});

test("polling respects its timeout", async () => {
  const requests = mockApi();
  await assert.rejects(pollStyleGeneration("test-token", "task-123", { timeoutMs: 0 }), /Poll style timeout/);
  assert.equal(requests.length, 0);
});

test("style API errors are surfaced to the caller", async () => {
  mockApi({ code: 401, msg: "Token expired" });
  await assert.rejects(queryStyles("test-token"), /Token expired/);
});
