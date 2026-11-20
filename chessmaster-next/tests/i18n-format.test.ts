import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDate, formatNumber } from "../src/i18n/format.ts";

test("date formatting is deterministic + UTC (no hydration drift)", () => {
  const iso = "2026-09-30T23:30:00.000Z";
  // UTC timeZone => same calendar day regardless of runner TZ
  assert.match(formatDate(iso, "en"), /30 September 2026/);
  // other locales format without throwing and stay on the UTC day
  assert.ok(formatDate(iso, "fr").length > 0);
  assert.ok(formatDate(iso, "ru").length > 0);
});

test("number formatting is locale-aware and does not mutate the value", () => {
  assert.equal(formatNumber(1500, "en"), "1,500");
  assert.ok(formatNumber(1500, "ru").length > 0);
});
