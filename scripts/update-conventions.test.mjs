import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBilibiliDetail,
  conventionFromBilibiliListItem,
  diffEvents,
  mergeCandidate,
  parseYunmanzhanHtml,
  parseYunmanzhanPageCount,
  updateConventionDataset,
} from "./update-conventions.mjs";

const observedAt = "2026-07-18T18:00:00+08:00";

const validEvent = {
  id: "worldline",
  name: "第二十四届世界线动漫展",
  type: "综合漫展",
  city: "成都",
  venue: "中国西部国际博览城",
  startDate: "2026-07-16",
  endDate: "2026-07-20",
  price: "¥69.9 起",
  ticketStatus: "售票中",
  guestStatus: "pending",
  summary: "大型综合漫展。",
  guests: [],
  ticketSources: [{ platform: "B站会员购", url: "https://show.bilibili.com/platform/home.html", label: "购票" }],
  verification: "人工核验。",
};

test("Yunmanzhan parser extracts stable row fields without trusting guests", () => {
  const html = `
    <table><tbody><tr>
      <td><div class="con-title-container" id="title-9802"><div class="con-title-text">
        <span class="badge">改</span><strong>成都·第二十四届世界线动漫展【突破升级】</strong>
      </div><small class="text-muted">四川·成都</small></div></td>
      <td>2026-07-16 至 2026-07-20</td>
      <td><div class="venue-text">中国西部国际博览城<br><small>9号馆</small></div></td>
      <td>69.9元 起</td>
      <td><span class="badge status-ongoing">进行中</span></td>
    </tr></tbody></table>`;
  const [event] = parseYunmanzhanHtml(html, 1);
  assert.deepEqual(event, {
    externalId: "9802",
    page: 1,
    name: "第二十四届世界线动漫展【突破升级】",
    city: "成都",
    venue: "中国西部国际博览城 · 9号馆",
    startDate: "2026-07-16",
    endDate: "2026-07-20",
    price: "69.9元 起",
    discoveryStatus: "进行中",
    ticketStatus: "待票务复核",
    sourceUrl: "https://www.yunmanzhan.com/index.php?search=%E7%AC%AC%E4%BA%8C%E5%8D%81%E5%9B%9B%E5%B1%8A%E4%B8%96%E7%95%8C%E7%BA%BF%E5%8A%A8%E6%BC%AB%E5%B1%95%E3%80%90%E7%AA%81%E7%A0%B4%E5%8D%87%E7%BA%A7%E3%80%91",
  });
});

test("Yunmanzhan parser handles alternate city separators and honest unknown-city fallbacks", () => {
  const html = `
    <table><tbody>
      <tr><td><div id="title-1"><strong>天津•同人ONLY</strong><small class="text-muted">天津•天津</small></div></td><td>2026-08-08</td><td>品所中心</td><td>78元</td><td>未开始</td></tr>
      <tr><td><div id="title-2"><strong>2026鹰角嘉年华</strong><small class="text-muted"></small></div></td><td>2026-08-09</td><td>国家会展中心</td><td>待定</td><td>未开始</td></tr>
    </tbody></table>`;
  const parsed = parseYunmanzhanHtml(html, 1);
  assert.equal(parsed[0].city, "天津");
  assert.equal(parsed[0].name, "同人ONLY");
  assert.equal(parsed[1].city, "城市待确认");
});

test("Yunmanzhan pagination parser finds the actual last page", () => {
  const html = `
    <a href="index.php?year=2026&month=8&page=2">2</a>
    <a href="index.php?year=2026&month=8&page=17">Last</a>
    <input type="number" min="1" max="17">
    <span>页 / 共 17 页</span>`;
  assert.equal(parseYunmanzhanPageCount(html), 17);
  assert.equal(parseYunmanzhanPageCount("<table></table>"), 1);
});

test("Bilibili list mapping keeps official field provenance", () => {
  const event = conventionFromBilibiliListItem({
    project_id: 1003947,
    project_name: "上海·明日方舟Only同人展 卡兰托之雨",
    city: "上海市",
    venue_name: "泰美术馆",
    start_time: "2026-07-31",
    end_time: "2026-08-01",
    isFree: false,
    price_low: 8900,
    price_high: 13800,
    sale_flag: "预售中",
    third_category_name: "Only同人展",
  }, observedAt);
  assert.equal(event.id, "bilibili-1003947");
  assert.equal(event.city, "上海");
  assert.equal(event.price, "¥89 起");
  assert.equal(event.verificationLevel, "ticket-verified");
  assert.equal(event.fieldSources.guests, "bilibili-membership");
});

test("discovery records merge into an existing curated event instead of duplicating it", () => {
  const events = [structuredClone(validEvent)];
  const candidate = {
    ...structuredClone(validEvent),
    id: "yunmanzhan-9802",
    name: "成都·第二十四届世界线动漫展【突破升级，为你而来】",
    ticketStatus: "待票务复核",
    sourceIds: ["yunmanzhan"],
    externalIds: { yunmanzhan: "9802" },
    ticketSources: [{ platform: "次元黄页", url: "https://www.yunmanzhan.com/", label: "发现记录" }],
    fieldSources: { discovery: "yunmanzhan" },
  };
  mergeCandidate(events, candidate, observedAt);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "worldline");
  assert.equal(events[0].externalIds.yunmanzhan, "9802");
  assert.deepEqual(events[0].sourceIds, ["yunmanzhan"]);
  assert.equal(events[0].ticketSources.length, 2);
});

test("same stable id wins even when a previous same-source merge changed the external id", () => {
  const events = [{
    ...structuredClone(validEvent),
    id: "yunmanzhan-11241",
    sourceIds: ["yunmanzhan"],
    externalIds: { yunmanzhan: "11242" },
    verificationLevel: "discovery-only",
  }];
  const candidate = {
    ...structuredClone(events[0]),
    externalIds: { yunmanzhan: "11241" },
    city: "上海",
  };
  mergeCandidate(events, candidate, observedAt);
  assert.equal(events.length, 1);
  assert.equal(events[0].city, "上海");
});

test("Bilibili details add unique structured guests and preserve known appearance dates", () => {
  const event = {
    ...structuredClone(validEvent),
    guestStatus: "rolling",
    guests: [{ name: "卡琳娜", role: "Coser", date: "2026-07-18", time: "14:00" }],
  };
  applyBilibiliDetail(event, {
    data: {
      guests: [
        { name: "卡琳娜", description: "知名 coser" },
        { name: "白芥子", description: "长佩文学网人气作者" },
        { name: "白芥子", description: "重复条目" },
      ],
    },
  }, observedAt);
  assert.deepEqual(event.guests, [
    { name: "卡琳娜", role: "Coser", date: "2026-07-18", time: "14:00" },
    { name: "白芥子", role: "作者" },
  ]);
  assert.equal(event.guestStatus, "rolling");
  assert.equal(event.verificationLevel, "guest-verified");
});

test("change tracking reports guest, date, venue and ticket changes", () => {
  const before = structuredClone(validEvent);
  before.guests = [{ name: "旧嘉宾", role: "参展嘉宾" }];
  const after = structuredClone(before);
  after.guests = [{ name: "新嘉宾", role: "参展嘉宾" }];
  after.startDate = "2026-07-17";
  after.venue = "新场馆";
  after.ticketStatus = "已取消";
  const changes = diffEvents([before], [after], observedAt);
  assert.deepEqual(changes.map((change) => change.type).sort(), [
    "guest_added",
    "guest_removed",
    "schedule_changed",
    "ticket_status_changed",
    "venue_changed",
  ]);
  assert.ok(changes.every((change) => change.id.length === 12));
});

test("collector preserves old data and exposes health when both automated sources fail", async () => {
  const previous = {
    updatedAt: "2026-07-17T08:00:00+08:00",
    checkedAt: "2026-07-17T08:00:00+08:00",
    coverage: "test coverage",
    policy: "test policy with 嘉宾",
    sources: [],
    events: [structuredClone(validEvent)],
  };
  const next = await updateConventionDataset({
    previous,
    now: new Date("2026-07-18T10:00:00Z"),
    yunmanzhanPages: 1,
    fetchers: {
      bilibiliList: async () => { throw new Error("B站 timeout"); },
      yunmanzhan: async () => { throw new Error("黄页 timeout"); },
    },
  });
  assert.equal(next.events.length, 1);
  assert.equal(next.events[0].name, validEvent.name);
  assert.equal(next.sourceHealth.find((source) => source.sourceId === "bilibili-membership").status, "unavailable");
  assert.equal(next.sourceHealth.find((source) => source.sourceId === "yunmanzhan").status, "unavailable");
  assert.equal(next.stats.eventCount, 1);
});

test("complete scans give missing discovery records three-run grace instead of deleting immediately", async () => {
  const discoveryEvent = {
    ...structuredClone(validEvent),
    id: "yunmanzhan-9802",
    sourceIds: ["yunmanzhan"],
    externalIds: { yunmanzhan: "9802" },
    verificationLevel: "discovery-only",
    ticketSources: [{
      platform: "次元黄页",
      url: "https://www.yunmanzhan.com/index.php?search=9802",
      label: "查看发现记录",
    }],
    firstSeenAt: "2026-07-17T08:00:00+08:00",
    lastSeenAt: "2026-07-17T08:00:00+08:00",
  };
  const fetchers = {
    bilibiliList: async () => [],
    yunmanzhan: async () => ({ items: [], pagesChecked: 1, complete: true }),
  };
  let previous = {
    updatedAt: discoveryEvent.lastSeenAt,
    checkedAt: discoveryEvent.lastSeenAt,
    coverage: "test coverage",
    policy: "test policy with 嘉宾",
    sources: [],
    events: [discoveryEvent],
  };
  for (let run = 1; run <= 2; run += 1) {
    previous = await updateConventionDataset({
      previous,
      now: new Date(`2026-07-${18 + run}T10:00:00Z`),
      fetchers,
    });
    assert.equal(previous.events.length, 1);
    assert.equal(previous.events[0].missingRuns, run);
  }
  const third = await updateConventionDataset({
    previous,
    now: new Date("2026-07-21T10:00:00Z"),
    fetchers,
  });
  assert.equal(third.events.length, 0);
});

test("collector no longer truncates a valid horizon at 260 events", async () => {
  const previous = {
    updatedAt: "2026-07-17T08:00:00+08:00",
    checkedAt: "2026-07-17T08:00:00+08:00",
    coverage: "test coverage",
    policy: "test policy with 嘉宾",
    sources: [],
    events: Array.from({ length: 300 }, (_, index) => ({
      ...structuredClone(validEvent),
      id: `official-${index}`,
      name: `未来漫展 ${index}`,
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      sourceIds: ["bilibili-membership"],
      verificationLevel: "ticket-verified",
      firstSeenAt: "2026-07-17T08:00:00+08:00",
      lastSeenAt: "2026-07-17T08:00:00+08:00",
    })),
  };
  const next = await updateConventionDataset({
    previous,
    now: new Date("2026-07-18T10:00:00Z"),
    fetchers: {
      bilibiliList: async () => { throw new Error("offline"); },
      yunmanzhan: async () => { throw new Error("offline"); },
    },
  });
  assert.equal(next.events.length, 300);
});
