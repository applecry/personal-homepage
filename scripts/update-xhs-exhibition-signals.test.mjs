import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSignal, normalizeXhsUrl, parseOpenCliJson, uniqueSignals } from "./update-xhs-exhibition-signals.mjs";

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
