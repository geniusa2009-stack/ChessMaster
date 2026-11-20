import { test } from "node:test";
import assert from "node:assert/strict";
import { LOCALES, DEFAULT_LOCALE, isLocale, normalizeLocale, dirFor, RTL_LOCALES } from "../src/i18n/locales.ts";
import { getMessages, interpolate, makeTranslator } from "../src/i18n/index.ts";
import { en } from "../src/i18n/messages/en.ts";
import { ar } from "../src/i18n/messages/ar.ts";

test("supported locales are exactly the legacy set", () => {
  assert.deepEqual([...LOCALES].sort(), ["ar", "en", "es", "fr", "ru"]);
  assert.equal(DEFAULT_LOCALE, "en");
});

test("locale detection accepts supported, rejects everything else", () => {
  assert.ok(isLocale("ar")); assert.ok(isLocale("ru"));
  assert.equal(isLocale("de"), false);
  assert.equal(isLocale("en-US"), false);
  assert.equal(isLocale(""), false);
  assert.equal(isLocale(undefined), false);
});

test("invalid/stale/malicious locale falls back to default (whitelist)", () => {
  assert.equal(normalizeLocale("de"), "en");
  assert.equal(normalizeLocale("../../etc/passwd"), "en");
  assert.equal(normalizeLocale("<script>"), "en");
  assert.equal(normalizeLocale("ar"), "ar");
});

test("only Arabic is RTL; others LTR", () => {
  assert.deepEqual(RTL_LOCALES, ["ar"]);
  assert.equal(dirFor("ar"), "rtl");
  for (const l of ["en", "fr", "es", "ru"] as const) assert.equal(dirFor(l), "ltr");
});

test("every locale resolves every key via English fallback (no missing-key holes)", () => {
  const keys = Object.keys(en);
  for (const l of LOCALES) {
    const m = getMessages(l);
    for (const k of keys) assert.ok(m[k as keyof typeof en] && m[k as keyof typeof en].length > 0, `${l} missing ${k}`);
  }
});

test("translator returns a localized value and falls back to English for partial locales", () => {
  const tar = makeTranslator("ar");
  assert.equal(tar("nav.play"), "اللعب");           // translated
  assert.equal(makeTranslator("fr")("nav.home"), "Accueil");
  // a key only present in en still resolves in ru (fallback), never the raw key
  const tru = makeTranslator("ru");
  assert.notEqual(tru("home.title"), "home.title");
});

test("interpolation replaces {vars} and is inert to HTML/script injection", () => {
  assert.equal(interpolate("Hello {name}", { name: "Ada" }), "Hello Ada");
  // a malicious variable is inserted as PLAIN TEXT — no tags are created/parsed here;
  // React escapes on render, so this cannot become executable content.
  const out = interpolate("Hi {x}", { x: "<img src=x onerror=alert(1)>" });
  assert.equal(out, "Hi <img src=x onerror=alert(1)>");
  assert.equal(out.includes("<img"), true); // it's literal text, not DOM
  // unknown placeholders are left untouched (no crash)
  assert.equal(interpolate("A {missing} B", { other: 1 }), "A {missing} B");
});

test("Arabic catalog does not accidentally contain the wrong-language nav value", () => {
  assert.equal(ar["nav.play"], "اللعب");
  assert.notEqual(ar["nav.play"], en["nav.play"]);
});

test("no raw translation KEY leaks: translator never returns the dotted key for known keys", () => {
  const t = makeTranslator("es");
  for (const k of Object.keys(en)) {
    const v = t(k as keyof typeof en);
    assert.notEqual(v, k, `raw key leaked: ${k}`);
  }
});
