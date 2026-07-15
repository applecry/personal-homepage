import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  canonicalVenue,
  categoryOf,
  filingMatchesEvent,
  loadCuratedEvents,
  mergeFilingEvents,
  mergeVerifiedEvents,
  normalizeCountry,
  officialEventMatches,
  parseEventJsonLd,
  parseFilingDetail,
  parseFilingList,
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

test("normalizes Shanghai venue names from filing records", () => {
  assert.equal(canonicalVenue("国家会展中心(上海)(青浦区)"), "国家会展中心（上海）");
  assert.equal(canonicalVenue("新国际博览中心(浦东新区)"), "上海新国际博览中心");
  assert.equal(canonicalVenue("世博展览馆(浦东新区)"), "上海世博展览馆");
});

test("parses Shanghai filing list rows", () => {
  const html = `
    <table><tr>
      <td><a href="search-entp-expo.jspx?code=f7f58b45-ec58-4980-9e02-b5cadd73f7d2" class="ggxx">2026人工智能博览会</a></td>
      <td>上海东浩兰生会展(集团)有限公司<br/></td>
      <td>世博展览馆(浦东新区)</td>
      <td>涉外经济技术展</td>
      <td>2026-7-17 至 2026-7-20</td>
    </tr></table>`;
  const [event] = parseFilingList(html);
  assert.equal(event.nameZh, "2026人工智能博览会");
  assert.equal(event.venue, "上海世博展览馆");
  assert.equal(event.startDate, "2026-07-17");
  assert.deepEqual(event.organizers, ["上海东浩兰生会展(集团)有限公司"]);
  assert.equal(event.confidence, "official");
});

test("parses filing detail fields and concurrent exhibitions", () => {
  const html = `
    <li class="tableheadleft"><b>2026人工智能博览会</b></li>
    <li class="table01">
      主办：上海东浩兰生会展(集团)有限公司<br>
      日期：2026-7-17至2026-7-20<br/>
      展会状态:<font color="red">正常</font><br/>
      展会文号：沪商展览(2026)-XZ26-第301号<br/>
      地址：世博展览馆(浦东新区)&nbsp;&nbsp;面积：70000&nbsp;平方米<br/>
      内容：人工智能、算法算力大数据和智能机器人<br/>
      <font>*本平台仅展示本市已备案的会展活动信息。</font>
    </li>
    <a href="search-entp-expo.jspx?code=12345678-abcd-4abc-8abc-1234567890ab" class="ggxx">同期珠宝展</a>(Jul 17, 2026至 Jul 20, 2026)`;
  const event = parseFilingDetail(html, { filingCode: "main-code" });
  assert.equal(event.filingStatus, "正常");
  assert.equal(event.filingNumber, "沪商展览(2026)-XZ26-第301号");
  assert.equal(event.exhibitionArea, 70000);
  assert.equal(event.summary, "人工智能、算法算力大数据和智能机器人");
  assert.equal(event.concurrentEvents[0].nameZh, "同期珠宝展");
  assert.equal(event.concurrentEvents[0].startDate, "2026-07-17");
});

test("official filing enriches a matching curated record without changing its stable id", () => {
  const curated = {
    id: "cbme-china-2026",
    nameZh: "2026 CBME 国际孕婴童展",
    aliases: ["CBME"],
    startDate: "2026-07-15",
    endDate: "2026-07-17",
    summary: "精选简介",
    sourceUrl: "https://example.com/old",
  };
  const filing = {
    id: "sh-filing-code",
    nameZh: "2026CBME国际孕婴童展",
    startDate: "2026-07-15",
    endDate: "2026-07-17",
    venue: "国家会展中心（上海）",
    lat: 31.1889,
    lng: 121.299,
    source: "上海市会展业公共信息服务平台",
    sourceUrl: "https://example.com/filing",
    url: "https://example.com/filing",
    organizers: ["主办方"],
    filingStatus: "正常",
    collectedAt: "2026-07-15T00:00:00.000Z",
  };
  assert.equal(filingMatchesEvent(filing, curated), true);
  const [merged] = mergeFilingEvents([curated], [filing]);
  assert.equal(merged.id, "cbme-china-2026");
  assert.equal(merged.summary, "精选简介");
  assert.equal(merged.filingStatus, "正常");
  assert.equal(merged.sourceUrl, "https://example.com/filing");
});

test("filing identity survives an official date change", () => {
  const previous = {
    id: "sh-filing-code",
    filingCode: "code",
    nameZh: "示例展览会",
    startDate: "2026-08-01",
  };
  const changed = {
    id: "sh-filing-code",
    filingCode: "code",
    nameZh: "示例展览会",
    startDate: "2026-08-08",
  };
  assert.equal(filingMatchesEvent(changed, previous), true);
});

test("filing merge removes duplicate filing rows and prefers a stable business id", () => {
  const filing = {
    id: "sh-filing-code",
    filingCode: "code",
    nameZh: "2026上海国际示例展览会",
    startDate: "2026-08-08",
    endDate: "2026-08-10",
    source: "上海市会展业公共信息服务平台",
    sourceUrl: "https://example.com/filing",
    url: "https://example.com/filing",
    organizers: [],
  };
  const previousFiling = { ...filing, startDate: "2026-08-01" };
  const discovered = {
    id: "expofinder-stable-id",
    nameZh: "2026 上海国际示例展览会",
    startDate: "2026-08-08",
    endDate: "2026-08-10",
    summary: "保留更完整的业务简介",
    url: "https://example.com/organizer",
  };
  const merged = mergeFilingEvents([previousFiling, discovered], [filing]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "expofinder-stable-id");
  assert.equal(merged[0].startDate, "2026-08-08");
  assert.equal(merged[0].summary, "保留更完整的业务简介");
  assert.equal(merged[0].url, "https://example.com/organizer");
});

test("generated exhibition data keeps a complete, valid Shanghai baseline", async () => {
  const payload = JSON.parse(await readFile(new URL("../data/exhibitions.json", import.meta.url), "utf8"));
  const events = payload.events || [];
  const ids = events.map((event) => event.id);
  const invalid = events.filter((event) => !event.id
    || !event.nameZh
    || !event.startDate
    || !event.endDate
    || event.startDate > event.endDate
    || !Number.isFinite(event.lat)
    || !Number.isFinite(event.lng));

  assert.ok(events.length >= 100, `expected at least 100 exhibitions, received ${events.length}`);
  assert.ok(events.filter((event) => event.filingCode).length >= 80, "official filing coverage regressed");
  assert.ok(events.some((event) => event.id === "chinajoy-2026"), "ChinaJoy must remain in the baseline");
  assert.equal(new Set(ids).size, ids.length, "event ids must be unique");
  assert.deepEqual(invalid, []);
});
