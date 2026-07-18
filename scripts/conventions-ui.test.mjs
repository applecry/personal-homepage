import assert from "node:assert/strict";
import test from "node:test";

await import("../conventions-core.js");
const {
  conventionMatches,
  dateWindow,
  findNewGuests,
  guestCount,
  guestsForWeekend,
  hasPublishedGuests,
  progressiveSlice,
  sortConventions,
} = globalThis.ConventionRadarCore;

const events = [
  {
    id: "ido",
    name: "IDO 动漫游戏嘉年华",
    city: "北京",
    venue: "亦创会展中心",
    startDate: "2026-07-18",
    endDate: "2026-07-19",
    guestUpdatedAt: "2026-07-15",
    guests: [
      { name: "赵成晨", role: "配音演员", date: "2026-07-18" },
      { name: "郭鸿博", role: "配音演员", date: "2026-07-19" },
    ],
  },
  {
    id: "axg",
    name: "AXG 动漫游戏嘉年华",
    city: "上海",
    venue: "诺瓦城",
    startDate: "2026-07-18",
    endDate: "2026-07-18",
    guestUpdatedAt: "2026-07-10",
    guests: [],
  },
  {
    id: "future",
    name: "未来动漫展",
    city: "上海",
    venue: "展览馆",
    startDate: "2026-08-20",
    endDate: "2026-08-21",
    guests: [{ name: "新嘉宾", date: "2026-08-20" }],
  },
  {
    id: "past",
    name: "往期漫展",
    city: "上海",
    venue: "展览馆",
    startDate: "2026-07-01",
    endDate: "2026-07-02",
    guests: [{ name: "赵成晨" }],
  },
];

test("guest-published state depends on structured guest records", () => {
  assert.equal(hasPublishedGuests(events[0]), true);
  assert.equal(hasPublishedGuests(events[1]), false);
});

test("guest search matches names and excludes past events", () => {
  const state = { scope: "all", city: "all", dateMode: "all", query: "赵成晨" };
  assert.equal(conventionMatches(events[0], state, "2026-07-16"), true);
  assert.equal(conventionMatches(events[3], state, "2026-07-16"), false);
});

test("city, pending and saved filters compose", () => {
  assert.equal(conventionMatches(events[1], { city: "上海", scope: "pending" }, "2026-07-16"), true);
  assert.equal(conventionMatches(events[0], { city: "上海", scope: "all" }, "2026-07-16"), false);
  assert.equal(conventionMatches(events[0], { city: "all", scope: "saved", savedIds: new Set(["ido"]) }, "2026-07-16"), true);
  assert.equal(conventionMatches(events[1], { city: "all", scope: "saved", savedIds: new Set(["ido"]) }, "2026-07-16"), false);
});

test("date modes select today, weekend and the next 30 days", () => {
  assert.deepEqual(dateWindow("2026-07-16", "today"), { start: "2026-07-16", end: "2026-07-16" });
  assert.deepEqual(dateWindow("2026-07-16", "weekend"), { start: "2026-07-18", end: "2026-07-19" });
  assert.deepEqual(dateWindow("2026-07-16", "month"), { start: "2026-07-16", end: "2026-08-14" });
  assert.equal(conventionMatches(events[0], { scope: "all", city: "all", dateMode: "weekend" }, "2026-07-16"), true);
  assert.equal(conventionMatches(events[2], { scope: "all", city: "all", dateMode: "month" }, "2026-07-16"), false);
});

test("weekend board keeps each guest appearance and its event", () => {
  const guests = guestsForWeekend(events, "2026-07-16");
  assert.deepEqual(guests.map((guest) => guest.name), ["赵成晨", "郭鸿博"]);
  assert.ok(guests.every((guest) => guest.eventId === "ido"));
});

test("guest snapshots only report additions for known events", () => {
  assert.deepEqual(findNewGuests(events[0], ["赵成晨"]).map((guest) => guest.name), ["郭鸿博"]);
  assert.deepEqual(findNewGuests(events[0], undefined), []);
});

test("guest count deduplicates the same person across conventions", () => {
  assert.equal(guestCount(events), 3);
});

test("guest sorting prefers the fullest announced lineup", () => {
  assert.deepEqual(sortConventions(events.slice(0, 2), "guests").map((event) => event.id), ["ido", "axg"]);
});

test("progressive rendering reports shown and remaining events", () => {
  assert.deepEqual(progressiveSlice(events, 2), {
    items: events.slice(0, 2),
    shown: 2,
    remaining: 2,
    total: 4,
  });
});
