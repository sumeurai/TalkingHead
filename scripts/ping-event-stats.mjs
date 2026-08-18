/**
 * Hit C-end event-stats from the SDK helper (no token).
 * Default: test site, eventType=2, 5 times.
 *
 *   node scripts/ping-event-stats.mjs
 *   SITE_ORIGIN=https://www.sumeruai.us TIMES=1 node scripts/ping-event-stats.mjs
 */

import {
  SITE_ORIGINS,
  TALKINGHEAD_BIZ_TYPE,
  TALKINGHEAD_EVENT_KEY,
  EVENT_TYPE,
  setSiteOrigin,
  getEventStatsUrl,
  incrementEventStat,
} from "../sdk/sumeru-event-stats.js";

const siteOrigin = (
  process.env.SITE_ORIGIN || SITE_ORIGINS.test
).replace(/\/$/, "");
const times = Math.max(1, Number(process.env.TIMES || 5));

setSiteOrigin(siteOrigin);

console.log("POST", getEventStatsUrl());
console.log(
  JSON.stringify(
    {
      bizType: TALKINGHEAD_BIZ_TYPE,
      eventType: EVENT_TYPE.installSuccess,
      eventKey: TALKINGHEAD_EVENT_KEY,
    },
    null,
    2,
  ),
);

let ok = 0;
for (let i = 1; i <= times; i += 1) {
  const result = await incrementEventStat({
    eventType: EVENT_TYPE.installSuccess,
    oncePerBrowser: false,
  });
  const detail = result.json ?? result.text ?? result.error?.message ?? result;
  console.log(`[${i}/${times}] status=${result.status ?? "n/a"}`, detail);
  if (result.ok) ok += 1;
}

console.log(`done: ${ok}/${times} ok`);
if (ok !== times) process.exit(1);
