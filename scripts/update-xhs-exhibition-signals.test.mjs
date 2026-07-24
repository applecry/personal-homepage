import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isAllowedRefreshRequest, isLoopbackHostname, resolveStaticPath } from "./serve-exhibitions-local.mjs";
import { normalizeSignal, normalizeXhsUrl, parseOpenCliJson, uniqueSignals, updateSignals } from "./update-xhs-exhibition-signals.mjs";

test("parses OpenCLI result arrays", () => {
  const rows = parseOpenCliJson('[{"title":"上海展览","url":"https://www.xiaohongshu.com/note"}]');
  assert.equal(rows.length, 1);
});

test("normalizes likes and published date", () => {
  assert.deepEqual(normalizeSignal({
    rank: "2",
    title: " 上海七月展览 ",
    author: "applecry",
    likes: "1,234",
    published_at: "2026-07-14",
    url: "https://www.xiaohongshu.com/note?token=abc",
  }, 0), {
    rank: 2,
    title: "上海七月展览",
    author: "applecry",
    likes: 1234,
    publishedAt: "2026-07-14",
    url: "https://www.xiaohongshu.com/note?token=abc",
  });
});

test("rejects links outside the Xiaohongshu HTTPS origin", () => {
  assert.equal(normalizeXhsUrl("javascript:alert(1)"), "");
  assert.equal(normalizeXhsUrl("https://example.com/note"), "");
});

test("deduplicates the same note regardless of query token", () => {
  const rows = uniqueSignals([
    { title: "A", url: "https://www.xiaohongshu.com/note?token=one" },
    { title: "A", url: "https://www.xiaohongshu.com/note?token=two" },
  ]);
  assert.equal(rows.length, 1);
});

test("failed refresh preserves the previous signal file and reports failure", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "exhibit-atlas-xhs-"));
  const outputPath = path.join(directory, "signals.json");
  const previous = {
    updatedAt: "2026-07-14T06:30:31.567Z",
    role: "线索而非事实",
    items: [{ title: "旧线索", url: "https://www.xiaohongshu.com/search_result/old" }],
  };
  await writeFile(outputPath, JSON.stringify(previous), "utf8");
  context.after(() => rm(directory, { recursive: true, force: true }));

  await assert.rejects(
    updateSignals({
      outputPath,
      collectSignals: async () => { throw new Error("AUTH_REQUIRED"); },
    }),
    (error) => error.preserved === true && error.preservedCount === 1,
  );
  assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), previous);
});

test("successful refresh writes the disclaimer and a deterministic timestamp", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "exhibit-atlas-xhs-"));
  const outputPath = path.join(directory, "signals.json");
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(outputPath, JSON.stringify({ items: [{ title: "旧线索" }] }), "utf8");

  const result = await updateSignals({
    outputPath,
    now: () => new Date("2026-07-24T04:00:00Z"),
    collectSignals: async () => [{
      rank: 1,
      title: "新线索",
      author: "本地测试",
      likes: 8,
      publishedAt: "2026-07-24",
      url: "https://www.xiaohongshu.com/search_result/new",
    }],
  });
  const payload = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(result.count, 1);
  assert.equal(payload.updatedAt, "2026-07-24T04:00:00.000Z");
  assert.match(payload.role, /不作为日期、票价或场馆信息的事实来源/);
});

test("one-click refresh only accepts same-origin loopback POST requests with the local header", () => {
  const request = {
    method: "POST",
    headers: {
      host: "127.0.0.1:4173",
      origin: "http://127.0.0.1:4173",
      "x-exhibit-atlas-local": "refresh",
    },
  };
  assert.equal(isAllowedRefreshRequest(request, 4173), true);
  assert.equal(isAllowedRefreshRequest({ ...request, headers: { ...request.headers, origin: "https://example.com" } }, 4173), false);
  assert.equal(isAllowedRefreshRequest({ ...request, headers: { ...request.headers, host: "example.com:4173" } }, 4173), false);
  assert.equal(isAllowedRefreshRequest({ ...request, method: "GET" }, 4173), false);
  assert.equal(isLoopbackHostname("::1"), true);
});

test("local preview serves project files but rejects paths outside the project root", () => {
  const root = path.resolve("C:/safe/exhibit-atlas");
  assert.equal(resolveStaticPath("/exhibitions.html", root), path.join(root, "exhibitions.html"));
  assert.equal(resolveStaticPath("../secret.txt", root), "");
});
