import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const homepage = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const projects = readFileSync(new URL("../projects.html", import.meta.url), "utf8");
const quietRoom = readFileSync(
  new URL("../after-market-closes/index.html", import.meta.url),
  "utf8",
);
const quietRoomScript = readFileSync(
  new URL("../after-market-closes/script.js", import.meta.url),
  "utf8",
);

test("homepage and project archive use the same-origin quiet-room route", () => {
  assert.match(homepage, /href="\.\/after-market-closes\/"/);
  assert.match(projects, /href="\.\/after-market-closes\/"/);
  assert.doesNotMatch(homepage, /chatgpt\.site/);
  assert.doesNotMatch(projects, /chatgpt\.site/);
});

test("quiet room is a standalone static page with local assets", () => {
  assert.match(quietRoom, /src="\.\/assets\/warm-night-room-v1\.png"/);
  assert.match(quietRoom, /src="\.\/assets\/small-lights-v1\.png"/);
  assert.match(quietRoom, /src="\.\/script\.js"/);
  assert.ok(
    existsSync(
      new URL(
        "../after-market-closes/assets/warm-night-room-v1.png",
        import.meta.url,
      ),
    ),
  );
  assert.ok(
    existsSync(
      new URL(
        "../after-market-closes/assets/small-lights-v1.png",
        import.meta.url,
      ),
    ),
  );
});

test("standalone quiet room retains its interactive comfort tools", () => {
  assert.match(quietRoomScript, /data-mood/);
  assert.match(quietRoomScript, /data-room-toggle/);
  assert.match(quietRoomScript, /after-market-decision/);
});
