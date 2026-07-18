import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBilibiliDetail,
  conventionFromBilibiliListItem,
  diffEvents,
  mergeCandidate,
  parseYunmanzhanHtml,
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
    sourceUrl: "https://www.yunmanzhan.com/index.php?search=9802",
  });
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
