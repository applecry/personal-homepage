import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const payload = JSON.parse(await readFile(new URL("../data/conventions.json", import.meta.url), "utf8"));
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const allowedGuestStatuses = new Set(["announced", "rolling", "pending"]);

test("convention dataset has traceable top-level metadata", () => {
  assert.ok(!Number.isNaN(Date.parse(payload.updatedAt)), "updatedAt must be a timestamp");
  assert.ok(!Number.isNaN(Date.parse(payload.checkedAt)), "checkedAt must be a timestamp");
  assert.ok(typeof payload.coverage === "string" && payload.coverage.length > 10);
  assert.ok(typeof payload.policy === "string" && payload.policy.includes("嘉宾"));
  assert.ok(Array.isArray(payload.sources) && payload.sources.length >= 2);
  assert.ok(Array.isArray(payload.events) && payload.events.length > 0);
});

test("source definitions use unique ids and secure public URLs", () => {
  const ids = payload.sources.map((source) => source.id);
  assert.equal(new Set(ids).size, ids.length, "source ids must be unique");
  payload.sources.forEach((source) => {
    assert.ok(source.name && source.role && source.status);
    assert.equal(new URL(source.url).protocol, "https:");
  });
});

test("every convention has coherent dates, sources and guest status", () => {
  const ids = payload.events.map((event) => event.id);
  assert.equal(new Set(ids).size, ids.length, "event ids must be unique");

  payload.events.forEach((event) => {
    for (const field of ["id", "name", "type", "city", "venue", "startDate", "endDate", "price", "ticketStatus", "guestStatus", "summary", "verification"]) {
      assert.ok(typeof event[field] === "string" && event[field].trim(), `${event.id || "event"} missing ${field}`);
    }
    assert.match(event.startDate, isoDate);
    assert.match(event.endDate, isoDate);
    assert.ok(event.startDate <= event.endDate, `${event.id} has an inverted date range`);
    assert.ok(allowedGuestStatuses.has(event.guestStatus), `${event.id} has an unknown guestStatus`);
    assert.ok(Array.isArray(event.guests), `${event.id} guests must be an array`);
    assert.ok(Array.isArray(event.ticketSources) && event.ticketSources.length, `${event.id} needs a ticket source`);
    assert.equal(event.guestStatus === "pending", event.guests.length === 0, `${event.id} guestStatus conflicts with guests`);

    const guestNames = event.guests.map((guest) => guest.name);
    assert.equal(new Set(guestNames).size, guestNames.length, `${event.id} repeats a guest`);
    event.guests.forEach((guest) => {
      assert.ok(guest.name && guest.role, `${event.id} has an incomplete guest`);
      if (guest.date) {
        assert.match(guest.date, isoDate);
        assert.ok(guest.date >= event.startDate && guest.date <= event.endDate, `${event.id}/${guest.name} is outside the event`);
      }
    });

    event.ticketSources.forEach((source) => {
      assert.ok(source.platform && source.label, `${event.id} has an incomplete ticket source`);
      assert.equal(new URL(source.url).protocol, "https:");
    });
  });
});
