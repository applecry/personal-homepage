import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGoogleUrl,
  buildNewsHistory,
  includesKeyword,
  newsDateKey,
  parseRssItems,
  selectArticles,
  validateFeedXml,
} from "./update-news.mjs";

const topic = {
  id: "ai",
  label: "AI",
  requiredKeywords: ["AI", "人工智能", "OpenAI"],
  keywords: ["AI", "OpenAI"],
};

test("rejects HTTP 200 HTML and feeds without entries", () => {
  assert.throws(() => validateFeedXml("<!doctype html><html><body>blocked</body></html>", "bing"), /HTML with 0 items/);
  assert.throws(() => validateFeedXml("<rss><channel></channel></rss>", "empty"), /invalid XML with 0 items/);
});

test("accepts RSS and Atom feeds with entries", () => {
  assert.equal(validateFeedXml("<rss><channel><item><title>x</title></item></channel></rss>"), 1);
  assert.equal(validateFeedXml("<feed><entry><title>x</title></entry></feed>"), 1);
});

test("parses Atom links and publication dates", () => {
  const xml = `<feed><entry><title>OpenAI ships an AI model</title><link href="https://example.com/ai"/><published>2026-07-14T01:00:00Z</published><summary>Model release</summary></entry></feed>`;
  const [item] = parseRssItems(xml, topic, "wired-ai");
  assert.equal(item.url, "https://example.com/ai");
  assert.equal(item.source, "WIRED");
  assert.equal(item.publishedAt, "2026-07-14T01:00:00.000Z");
});

test("matches short ASCII keywords as words instead of substrings", () => {
  assert.equal(includesKeyword("AI agent released", "AI"), true);
  assert.equal(includesKeyword("company said results improved", "AI"), false);
});

test("Google query includes a recent-news window", () => {
  const url = buildGoogleUrl({ ...topic }, "人工智能 OpenAI");
  assert.match(url.searchParams.get("q"), /when:2d$/);
});

test("selects relevant, recent and unique stories", () => {
  const publishedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const items = selectArticles([
    { title: "OpenAI 发布 AI 新模型", url: "https://example.com/1", source: "A", publishedAt, summary: "清晰的中文摘要用于测试新闻选择逻辑。", tags: ["AI"] },
    { title: "OpenAI 发布 AI 新模型", url: "https://example.com/2", source: "B", publishedAt, summary: "重复标题。", tags: ["AI"] },
    { title: "Company said quarterly results improved", url: "https://example.com/3", source: "C", publishedAt, summary: "与人工智能无关的新闻摘要内容。", tags: [] },
  ], topic);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://example.com/1");
});

test("uses the Shanghai calendar date for news snapshots", () => {
  assert.equal(newsDateKey("2026-07-22T16:30:00.000Z"), "2026-07-23");
});

test("keeps one snapshot per day for the latest seven calendar days", () => {
  const makeTopic = (title) => [{ id: "ai", label: "AI", items: [{ title, url: `https://example.com/${title}` }] }];
  const history = buildNewsHistory({
    checkedAt: "2026-07-22T08:00:00.000Z",
    topics: makeTopic("22-latest"),
    history: [
      { date: "2026-07-22", checkedAt: "2026-07-22T01:00:00.000Z", topics: makeTopic("22-old") },
      { date: "2026-07-21", checkedAt: "2026-07-21T01:00:00.000Z", topics: makeTopic("21") },
      { date: "2026-07-16", checkedAt: "2026-07-16T01:00:00.000Z", topics: makeTopic("expired") },
    ],
  }, {
    checkedAt: "2026-07-23T03:00:00.000Z",
    topics: makeTopic("23"),
  }, "2026-07-23T03:00:00.000Z");

  assert.deepEqual(history.map((snapshot) => snapshot.date), ["2026-07-23", "2026-07-22", "2026-07-21"]);
  assert.equal(history[1].topics[0].items[0].title, "22-latest");
});
