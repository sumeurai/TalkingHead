/**
 * Hit Open API event-stats from the SDK helper (no token).
 * Default: https://api.sumeruai.us/v1/event-stats/increment, 5 times.
 *
 *   node scripts/ping-event-stats.mjs
 *   API_ORIGIN=https://api.sumeruai.us TIMES=1 node scripts/ping-event-stats.mjs
 */

import {
  API_ORIGINS,
  setApiOrigin,
  getEventStatsUrl,
  incrementEventStat,
  buildInstallSuccessPayload,
} from "../sdk/sumeru-event-stats.js";

const apiOrigin = (
  process.env.API_ORIGIN ||
  process.env.SITE_ORIGIN ||
  API_ORIGINS.prod
).replace(/\/$/, "");
const times = Math.max(1, Number(process.env.TIMES || 5));

setApiOrigin(apiOrigin);

console.log("POST", getEventStatsUrl());
console.log(
  JSON.stringify(
    buildInstallSuccessPayload({
      apiName: "createAvatar",
      fromPage: "cli/ping-event-stats",
      latencyMs: 0,
    }),
    null,
    2,
  ),
);

let ok = 0;
for (let i = 1; i <= times; i += 1) {
  const result = await incrementEventStat({
    oncePerBrowser: false,
    apiName: "createAvatar",
    fromPage: "cli/ping-event-stats",
    latencyMs: 0,
  });
  const detail = result.json ?? result.text ?? result.error?.message ?? result;
  console.log(`[${i}/${times}] status=${result.status ?? "n/a"}`, detail);
  if (result.ok) ok += 1;
}

console.log(`done: ${ok}/${times} ok`);
if (ok !== times) process.exit(1);
