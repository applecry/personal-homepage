import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryOf,
  loadCuratedEvents,
  mergeVerifiedEvents,
  normalizeCountry,
  officialEventMatches,
  parseEventJsonLd,
  roundRobinPaths,
} from "./update-exhibitions.mjs";

test("normalizes Taiwan and Hong Kong labels", () => {
  assert.equal(normalizeCountry("Taiwan", "Taipei"), "中国台湾");
  assert.equal(normalizeCountry("中国", "台北"), "中国台湾");
  assert.equal(normalizeCountry("Hong Kong", "Hong Kong"), "中国香港");
  assert.equal(normalizeCountry("中国", "香港"), "中国香港");
});

test("reads Event JSON-LD from a Next.js flight payload", () => {
  const event = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: "测试上海展会",
    startDate: "2026-08-12T16:00:00.000Z",
    endDate: "2026-08-16T15:59:59.999Z",
    location: { "@type": "Place", name: "中国·上海·上海世博展览馆" },
  };
  const flightValue = JSON.stringify(JSON.stringify(event));
  const html = `<script>self.__next_f.push([1,${flightValue}])</script>`;
  assert.deepEqual(parseEventJsonLd(html), event);
});

test("reads Event JSON-LD from a standard script and @graph", () => {
  const event = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: "ChinaJoy 2026",
    startDate: "2026-07-31",
    endDate: "2026-08-03",
  };
  const html = `<script type="application/ld+json">${JSON.stringify({ "@graph": [{ "@type": "WebSite" }, event] })}</script>`;
  assert.deepEqual(parseEventJsonLd(html), event);
});

test("classifies ChinaJoy and digital entertainment as games", () => {
  assert.equal(categoryOf("ChinaJoy 2026", "AI 数字娱乐体验"), "游戏");
  assert.equal(categoryOf("中国国际数码互动娱乐展览会", ""), "游戏");
});

test("keeps discovery balanced across search terms", () => {
  const paths = roundRobinPaths([
    ["/detail/a1", "/detail/a2", "/detail/a3"],
    ["/detail/b1", "/detail/b2", "/detail/b3"],
  ], 8);
  assert.deepEqual(paths.slice(4), ["/detail/a1", "/detail/b1", "/detail/a2", "/detail/b2"]);
});

test("curated Shanghai baseline contains ChinaJoy and broad future coverage", async () => {
  const events = await loadCuratedEvents();
  assert.ok(events.length >= 30);
  assert.ok(events.some((event) => event.id === "chinajoy-2026" && event.category === "游戏"));
  assert.ok(new Set(events.map((event) => event.startDate.slice(0, 7))).size >= 6);
});

test("official events replace matching aggregator records", () => {
  const aggregator = {
    id: "aggregator-waic",
    nameZh: "2026上海世界人工智能大会 WAIC",
    startDate: "2026-07-17",
  };
  const official = {
    id: "waic-2026",
    nameZh: "2026世界人工智能大会",
    aliases: ["WAIC", "世界人工智能大会"],
    startDate: "2026-07-17",
  };
  assert.equal(officialEventMatches(aggregator, official), true);
  assert.deepEqual(mergeVerifiedEvents([aggregator], [official]), [official]);
});

test("similarly named events on another date are preserved", () => {
  const event = { id: "other-waic", nameZh: "WAIC 城市活动", startDate: "2026-07-21" };
  const official = { id: "waic-2026", aliases: ["WAIC"], startDate: "2026-07-17" };
  assert.deepEqual(mergeVerifiedEvents([event], [official]), [event, official]);
});
