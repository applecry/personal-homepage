import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const rootPages = ["index.html", "projects.html", "exhibitions.html", "conventions.html"];
const nestedPages = [
  "notes/index.html",
  "notes/agent-boundary.html",
  "notes/knowledge-workflow.html",
  "notes/pageagent-voice.html",
  "notes/proven-better-new.html",
  "notes/two-day-prototype.html",
  "after-market-closes/index.html",
];

test("every first-party page loads the persistent music player", async () => {
  for (const page of rootPages) {
    const html = await readFile(new URL(page, root), "utf8");
    assert.match(html, /src="\.\/persistent-music\.js\?v=\d+-\d+"/, page);
  }

  for (const page of nestedPages) {
    const html = await readFile(new URL(page, root), "utf8");
    assert.match(html, /src="\.\.\/persistent-music\.js\?v=\d+-\d+"/, page);
  }
});

test("homepage tracks expose stable ids for cross-page restoration", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  for (const id of ["night-dancer", "judgement", "night-cruising", "sunset-road"]) {
    assert.ok(html.includes(`data-track-id="${id}"`), id);
  }
});

test("player keeps one audio instance during active same-origin navigation", async () => {
  const source = await readFile(new URL("persistent-music.js", root), "utf8");
  assert.match(source, /sessionStorage\.setItem/);
  assert.match(source, /document\.createElement\("iframe"\)/);
  assert.match(source, /window\.history\.pushState/);
  assert.match(source, /window\.top\.QiaomuPersistentMusic/);
});
