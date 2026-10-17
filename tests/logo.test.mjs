import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOGO_SVG, LOGO_SVG_SQUARE } from "@/lib/logo";

const ICON = readFileSync(new URL("../src/app/icon.svg", import.meta.url), "utf8").trim();

test("the favicon and the mark on the pages are the same artwork", () => {
  assert.equal(LOGO_SVG, ICON);
});

test("the mark is self-contained, so it renders under the site's strict CSP", () => {
  assert.match(LOGO_SVG, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[^"]+">/);
  assert.match(LOGO_SVG, /<\/svg>$/);
  assert.doesNotMatch(LOGO_SVG, /<script|<style|<image|href="http|url\((?!#)/i);
});

test("the home-screen version is full bleed and otherwise identical", () => {
  assert.match(LOGO_SVG, /rx="120" /);
  assert.doesNotMatch(LOGO_SVG_SQUARE, /rx="120"/);
  assert.equal(LOGO_SVG_SQUARE.length, LOGO_SVG.length - 'rx="120" '.length);
});
