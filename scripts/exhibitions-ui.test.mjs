import assert from "node:assert/strict";
import test from "node:test";

await import("../exhibitions-core.js");
const {
  addDays,
  buildIcs,
  calendarDaysForMonth,
  dateRangeFor,
  deriveEventStatus,
  eventsOnDate,
  eventMatchesDate,
  sortEvents,
  todayInTimeZone,
} = globalThis.ExhibitionAtlasCore;

const event = {
  id: "chinajoy-2026",
  nameZh: "2026 中国国际数码互动娱乐展览会（ChinaJoy）",
  summary: "游戏、动漫与数字娱乐；面向玩家，也面向行业。",
  city: "上海",
  country: "中国",
  venue: "上海新国际博览中心",
  startDate: "2026-07-31",
  endDate: "2026-08-03",
  url: "https://chinajoy.net/",
};

test("uses Shanghai calendar date rather than the machine timezone", () => {
  assert.equal(todayInTimeZone(new Date("2026-07-14T16:30:00Z")), "2026-07-15");
});

test("date filters include events whose date ranges overlap", () => {
  const today = dateRangeFor("ongoing", "2026-08-01");
  assert.equal(eventMatchesDate(event, today), true);
  assert.equal(eventMatchesDate(event, dateRangeFor("ongoing", "2026-08-04")), false);
});

test("Sunday still resolves to the current Saturday-Sunday weekend", () => {
  assert.deepEqual(dateRangeFor("weekend", "2026-07-19"), {
    start: "2026-07-18",
    end: "2026-07-19",
  });
});

test("custom ranges reject an end date before the start date", () => {
  const range = dateRangeFor("custom", "2026-07-15", "2026-08-10", "2026-08-01");
  assert.equal(range.invalid, true);
  assert.equal(eventMatchesDate(event, range), false);
});

test("future 30 days includes today and the twenty-ninth following day", () => {
  assert.deepEqual(dateRangeFor("month", "2026-07-15"), {
    start: "2026-07-15",
    end: "2026-08-13",
  });
});

test("calendar month uses a stable Monday-first six-week grid", () => {
  const days = calendarDaysForMonth("2026-07");
  assert.equal(days.length, 42);
  assert.deepEqual(days[0], { date: "2026-06-29", day: 29, inMonth: false });
  assert.deepEqual(days[41], { date: "2026-08-09", day: 9, inMonth: false });
});

test("calendar date includes every overlapping multi-day exhibition", () => {
  assert.deepEqual(eventsOnDate([
    event,
    { ...event, id: "later", startDate: "2026-08-04", endDate: "2026-08-05" },
  ], "2026-08-01").map((item) => item.id), ["chinajoy-2026"]);
});

test("derived status respects explicit cancellation before calendar dates", () => {
  assert.deepEqual(deriveEventStatus({ ...event, status: "cancelled" }, "2026-08-01"), {
    key: "cancelled",
    label: "已取消",
  });
  assert.equal(deriveEventStatus(event, "2026-08-01").key, "ongoing");
});

test("featured sorting keeps dates deterministic inside each group", () => {
  const values = [
    { nameZh: "乙", startDate: "2026-08-02" },
    { nameZh: "甲", startDate: "2026-08-03", featured: true },
    { nameZh: "丙", startDate: "2026-08-01", featured: true },
  ];
  assert.deepEqual(sortEvents(values, "featured").map((item) => item.nameZh), ["丙", "甲", "乙"]);
});

test("calendar export is all-day and uses an exclusive next-day end", () => {
  const ics = buildIcs(event, { now: new Date("2026-07-15T00:00:00Z") });
  const unfolded = ics.replace(/\r\n[ \t]/g, "");
  assert.match(unfolded, /DTSTART;VALUE=DATE:20260731\r\n/);
  assert.match(unfolded, /DTEND;VALUE=DATE:20260804\r\n/);
  assert.match(unfolded, /SUMMARY:2026 中国国际数码互动娱乐展览会（ChinaJoy）/);
  assert.match(unfolded, /DESCRIPTION:游戏、动漫与数字娱乐；面向玩家，也面向行业。\\n官方信息/);
  assert.match(ics, /\r\n /);
  assert.ok(ics.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75));
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
