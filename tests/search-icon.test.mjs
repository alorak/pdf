import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

test("navbar search uses the shared outlined toolbar icon style", () => {
  const button = html.match(/<button\\b[^>]*id="searchToggle"[\\s\\S]*?<\\/button>/)?.[0];
  assert.ok(button, "Search toggle button must be present");
  assert.match(button, /<svg\\b[^>]*class="view-current-icon"[^>]*aria-hidden="true"/);
  assert.match(button, /<circle\\b[^>]*\\/>/);
  assert.match(button, /<path\\b[^>]*\\/>/);
  assert.match(css, /\\.view-menu-button \\.view-current-icon\\s*\\{[^}]*fill:\\s*none;[^}]*stroke:\\s*currentColor;/s);
  assert.match(css, /\\.search-toggle\\s*\\{[^}]*width:\\s*34px;/s);
});
