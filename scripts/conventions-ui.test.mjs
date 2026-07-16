import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  conventionMatches,
  guestCount,
  guestsForWeekend,
  hasPublishedGuests,
  sortConventions,
} = require("../conventions-core.js");

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
  const state = { scope: "all", query: "赵成晨" };
  assert.equal(conventionMatches(events[0], state, "2026-07-16"), true);
  assert.equal(conventionMatches(events[2], state, "2026-07-16"), false);
});

test("Shanghai scope and guest-published scope stay independent", () => {
  assert.equal(conventionMatches(events[1], { scope: "shanghai" }, "2026-07-16"), true);
  assert.equal(conventionMatches(events[1], { scope: "guests" }, "2026-07-16"), false);
});

test("weekend board keeps each guest appearance and its event", () => {
  const guests = guestsForWeekend(events, "2026-07-16");
  assert.deepEqual(guests.map((guest) => guest.name), ["赵成晨", "郭鸿博"]);
  assert.ok(guests.every((guest) => guest.eventId === "ido"));
});

test("guest count deduplicates the same person across conventions", () => {
  assert.equal(guestCount(events), 2);
});

test("guest sorting prefers the fullest announced lineup", () => {
  assert.deepEqual(sortConventions(events.slice(0, 2), "guests").map((event) => event.id), ["ido", "axg"]);
});
