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
  assert.ok(Array.isArray(payload.sourceHealth) && payload.sourceHealth.length >= 3);
  assert.ok(Array.isArray(payload.changes));
  assert.ok(payload.stats && Number.isInteger(payload.stats.eventCount));
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

test("source health and recent changes remain machine-readable", () => {
  const allowedHealth = new Set(["healthy", "partial", "unavailable", "manual-review"]);
  const sourceIds = new Set(payload.sources.map((source) => source.id));
  payload.sourceHealth.forEach((health) => {
    assert.ok(sourceIds.has(health.sourceId), `unknown health source ${health.sourceId}`);
    assert.ok(allowedHealth.has(health.status), `unknown health status ${health.status}`);
    assert.ok(!Number.isNaN(Date.parse(health.checkedAt)), `${health.sourceId} has no checkedAt`);
    assert.ok(Number.isInteger(health.itemCount) && health.itemCount >= 0);
    assert.ok(typeof health.note === "string" && health.note.length > 5);
  });
  payload.changes.forEach((change) => {
    assert.ok(change.id && change.type && change.eventId && change.eventName && change.summary);
    assert.ok(!Number.isNaN(Date.parse(change.at)));
    assert.ok(Array.isArray(change.sourceIds));
  });
  assert.equal(payload.stats.eventCount, payload.events.length);
  assert.equal(payload.stats.guestVerifiedEvents, payload.events.filter((event) => event.guests.length).length);
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
    assert.ok(Array.isArray(event.sourceIds), `${event.id} sourceIds must be an array`);
    assert.ok(["discovery-only", "ticket-verified", "guest-verified"].includes(event.verificationLevel), `${event.id} has invalid verificationLevel`);
    assert.ok(!Number.isNaN(Date.parse(event.firstSeenAt)), `${event.id} missing firstSeenAt`);
    assert.ok(!Number.isNaN(Date.parse(event.lastSeenAt)), `${event.id} missing lastSeenAt`);
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
