import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const imageNames = [
  "world-after-market-closes.png",
  "project-baishi-daotu.png",
  "project-exhibit-atlas.png",
  "project-understand-everything.png",
  "project-learning-map.png",
];

test("every homepage project card has a descriptive image", () => {
  const projectSection = html.match(/<div class="work-grid">([\s\S]*?)<\/div>\s*<\/section>/)?.[1] || "";
  assert.equal((projectSection.match(/class="work-card-image"/g) || []).length, 5);
  assert.equal((projectSection.match(/<a class="work-card[^"]*"/g) || []).length, 5);
  assert.ok(!projectSection.includes('alt=""'));
  imageNames.forEach((name) => assert.ok(projectSection.includes(`./assets/${name}`), `${name} is not referenced`));
  assert.match(projectSection, /baishi-daotu-game\.glassy-char-8356\.chatgpt\.site/);
  assert.match(projectSection, /无需登录，立即开玩/);
});

test("generated project images are optimized landscape PNGs", async () => {
  for (const name of imageNames.slice(1)) {
    const image = await readFile(new URL(`assets/${name}`, root));
    assert.equal(image.subarray(1, 4).toString("ascii"), "PNG", `${name} is not a PNG`);
    assert.equal(image.readUInt32BE(16), 1200, `${name} width`);
    assert.ok([630, 632].includes(image.readUInt32BE(20)), `${name} height`);
    assert.ok(image.length < 2_000_000, `${name} is too large for a card asset`);
  }
});
