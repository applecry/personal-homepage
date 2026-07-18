import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("conventions.html", root), "utf8");
const image = await readFile(new URL("assets/conventions-anime-hero.jpg", root));

const jpegDimensions = (buffer) => {
  assert.equal(buffer.readUInt16BE(0), 0xffd8, "hero must be a JPEG");
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = buffer.readUInt16BE(offset);
    if (sofMarkers.has(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  throw new Error("JPEG dimensions not found");
};

test("convention hero uses a descriptive anime key visual", () => {
  assert.ok(html.includes('class="con-anime-visual"'));
  assert.ok(html.includes('src="./assets/conventions-anime-hero.jpg"'));
  assert.ok(html.includes('alt="两位原创动漫角色站在漫展舞台与漫画分镜拼贴之间"'));
  assert.ok(html.includes("con-signal-strip"));
  assert.ok(html.includes("https://applecry.github.io/personal-homepage/assets/conventions-anime-hero.jpg"));
});

test("convention section exposes cascading province and fuzzy city controls", () => {
  assert.ok(html.includes("<title>漫展专区 | Exhibit Atlas</title>"));
  assert.ok(html.includes("data-province"));
  assert.ok(html.includes("data-city-input"));
  assert.ok(html.includes("data-city-options"));
  assert.ok(html.includes("手输"));
});

test("anime hero is an optimized social-preview-sized JPEG", () => {
  assert.deepEqual(jpegDimensions(image), { width: 1200, height: 633 });
  assert.ok(image.length > 100_000, "hero image is unexpectedly small");
  assert.ok(image.length < 500_000, "hero image should remain fast to load");
});
