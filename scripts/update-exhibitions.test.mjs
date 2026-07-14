import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCountry, parseEventJsonLd } from "./update-exhibitions.mjs";

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
