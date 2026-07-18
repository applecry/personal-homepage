import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_URL = new URL("../data/conventions.json", import.meta.url);
const require = createRequire(import.meta.url);
const { resolveProvince } = require("../conventions-regions.js");
const BILIBILI_LIST_URL = "https://show.bilibili.com/api/ticket/project/listV2";
const BILIBILI_DETAIL_URL = "https://show.bilibili.com/api/ticket/project/getV2";
const YUNMANZHAN_URL = "https://www.yunmanzhan.com/index.php";
const BILIBILI_VERSION = "134";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_YUNMANZHAN_PAGES = 4;
const DEFAULT_DISCOVERY_MODE = "full";
const DISCOVERY_CONCURRENCY = 3;
const MISSING_RUN_LIMIT = 3;
const DISCOVERY_SOURCE = {
  id: "yunmanzhan",
  name: "次元黄页",
  short: "广",
  role: "全国漫展广覆盖发现；日期、城市、场馆与状态线索",
  url: "https://www.yunmanzhan.com/",
  status: "发现源",
};

const normalizeSpace = (value = "") => String(value).replace(/\s+/g, " ").trim();

const decodeHtml = (value = "") => normalizeSpace(String(value)
  .replace(/<br\s*\/?>/gi, " · ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, "\"")
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))));

const dateInShanghai = (value = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(value);

const timestampInShanghai = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}+08:00`;
};

const addDays = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const cleanCity = (value = "", fallbackName = "") => {
  const prefix = normalizeSpace(fallbackName)
    .replace(/^【[^】]+】/u, "")
    .match(/^([^·•・]{1,12})[·•・]/u)?.[1];
  const raw = prefix || normalizeSpace(value).split(/[·•・]/u).at(-1) || "";
  return raw
    .replace(/(壮族|回族|维吾尔族|彝族|土家族|苗族|蒙古族|藏族|傣族|白族|哈尼族|朝鲜族)*自治州$/u, "")
    .replace(/特别行政区$|市$/u, "")
    .trim() || normalizeSpace(value) || "城市待确认";
};

const cleanEventName = (value = "") => normalizeSpace(value)
  .replace(/^[^·•・]{1,12}[·•・]/u, "")
  .replace(/^【免费(?:活动|漫展)?】/u, "")
  .trim();

const normalizeEventName = (value = "") => cleanEventName(value)
  .replace(/[【\[].*?[】\]]/gu, "")
  .replace(/[（(].*?[）)]/gu, "")
  .replace(/动漫游戏|动漫|次元|嘉年华|博览会|同人展/gu, "")
  .replace(/only/giu, "")
  .replace(/[^\p{Script=Han}a-z0-9]/giu, "")
  .toLowerCase();

const bigrams = (value) => {
  if (value.length < 2) return new Set([value]);
  return new Set(Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)));
};

const nameSimilarity = (left, right) => {
  const a = normalizeEventName(left);
  const b = normalizeEventName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const aa = bigrams(a);
  const bb = bigrams(b);
  const common = [...aa].filter((item) => bb.has(item)).length;
  return (2 * common) / (aa.size + bb.size);
};

const datesOverlap = (left, right) => left.startDate <= right.endDate && left.endDate >= right.startDate;

const inferType = (name = "", sourceType = "") => {
  if (sourceType) return sourceType.replace("Only", "ONLY");
  if (/only|同人/iu.test(name)) return "IP ONLY";
  if (/游戏|电竞/iu.test(name)) return "动漫游戏展";
  if (/国潮/iu.test(name)) return "国潮动漫展";
  return "综合漫展";
};

const priceFromBilibili = (item = {}) => {
  if (item.isFree) return "免费";
  if (!Number.isFinite(item.price_low)) return "票价待定";
  const value = item.price_low / 100;
  return `¥${Number.isInteger(value) ? value : value.toFixed(1)}${item.price_high > item.price_low ? " 起" : ""}`;
};

const roleFromDescription = (description = "") => {
  if (/配音|声优/u.test(description)) return "配音演员";
  if (/漫画家|画师|插画/u.test(description)) return "画师 / 漫画家";
  if (/作家|作者|写手/u.test(description)) return "作者";
  if (/舞见/u.test(description)) return "舞见";
  if (/唱见|歌手/u.test(description)) return "唱见 / 歌手";
  if (/coser|cosplay/iu.test(description)) return "Coser";
  return "参展嘉宾";
};

const isConventionLike = (item = {}) => {
  const category = String(item.third_category_name || "");
  const name = String(item.project_name || "");
  return /漫展|同人/u.test(category) || /动漫|二次元|漫展|同人|only|cos/iu.test(name);
};

const isYunmanzhanConventionLike = (item = {}) => {
  const name = String(item.name || "");
  if (/宠物产业|汽车文化|车展|家博会|茶博会|婚博会/u.test(name)) return false;
  return /漫|动漫|二次元|次元|同人|only|cos|acg|电竞|游戏|国潮|宅舞|嘉年华/iu.test(name);
};

const sourceUrlForYunmanzhan = (name) => `${YUNMANZHAN_URL}?search=${encodeURIComponent(cleanEventName(name))}`;

export const parseYunmanzhanHtml = (html, page = 1) => {
  const events = [];
  const rows = String(html).match(/<tr>\s*<td>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const externalId = row.match(/id=["']title-(\d+)["']/i)?.[1];
    if (!externalId) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < 5) continue;
    const rawName = decodeHtml(cells[0].match(/<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1] || "");
    const location = decodeHtml(cells[0].match(/<small[^>]*class=["'][^"']*text-muted[^"']*["'][^>]*>([\s\S]*?)<\/small>/i)?.[1] || "");
    const dates = decodeHtml(cells[1]).match(/(\d{4}-\d{2}-\d{2})(?:\s*至\s*(\d{4}-\d{2}-\d{2}))?/);
    if (!rawName || !dates) continue;
    const startDate = dates[1];
    const endDate = dates[2] || startDate;
    const statusText = decodeHtml(cells[4]);
    events.push({
      externalId,
      page,
      name: cleanEventName(rawName),
      city: cleanCity(location, rawName),
      venue: decodeHtml(cells[2]) || "场馆待确认",
      startDate,
      endDate,
      price: decodeHtml(cells[3]) || "票价待定",
      discoveryStatus: statusText,
      ticketStatus: /取消/u.test(statusText)
        ? "已取消"
        : /延期/u.test(statusText)
          ? "已延期"
          : "待票务复核",
      sourceUrl: sourceUrlForYunmanzhan(rawName),
    });
  }
  return events;
};

export const conventionFromBilibiliListItem = (item, observedAt) => {
  const name = cleanEventName(item.project_name);
  const detailUrl = `https://show.bilibili.com/platform/detail.html?id=${item.project_id}`;
  const city = cleanCity(item.city, item.project_name);
  return {
    id: `bilibili-${item.project_id}`,
    name,
    type: inferType(name, item.third_category_name),
    province: resolveProvince(city),
    city,
    venue: normalizeSpace(item.venue_name) || "场馆待确认",
    startDate: item.start_time,
    endDate: item.end_time || item.start_time,
    price: priceFromBilibili(item),
    ticketStatus: normalizeSpace(item.sale_flag) || "票务状态待确认",
    guestStatus: "pending",
    summary: `${item.third_category_name || "漫展"}；活动、票务与场馆来自 B站会员购公开列表。`,
    guests: [],
    ticketSources: [{
      platform: "B站会员购",
      url: detailUrl,
      label: "查看官方票务与嘉宾",
      primary: true,
    }],
    verification: "活动日期、场馆、票价和售票状态来自 B站会员购公开列表；嘉宾只在详情接口返回实名条目后展示。",
    sourceIds: ["bilibili-membership"],
    externalIds: { bilibili: String(item.project_id) },
    fieldSources: {
      schedule: "bilibili-membership",
      venue: "bilibili-membership",
      price: "bilibili-membership",
      ticketStatus: "bilibili-membership",
      guests: "bilibili-membership",
    },
    verificationLevel: "ticket-verified",
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
  };
};

export const conventionFromYunmanzhan = (item, observedAt) => ({
  id: `yunmanzhan-${item.externalId}`,
  name: item.name,
  type: inferType(item.name),
  province: resolveProvince(item.city),
  city: item.city,
  venue: item.venue,
  startDate: item.startDate,
  endDate: item.endDate,
  price: item.price === "免费" ? "免费" : item.price.replace(/^(\d)/, "¥$1"),
  ticketStatus: item.ticketStatus,
  guestStatus: "pending",
  summary: "由全国漫展黄页发现，票务与嘉宾仍需到 B站会员购、大麦或主办方官宣复核。",
  guests: [],
  ticketSources: [{
    platform: "次元黄页",
    url: item.sourceUrl,
    label: "查看发现记录",
    primary: false,
  }],
  verification: `发现源记录状态为“${item.discoveryStatus || "未标注"}”；尚未取得票务平台或主办方的结构化嘉宾名单。`,
  sourceIds: ["yunmanzhan"],
  externalIds: { yunmanzhan: String(item.externalId) },
  fieldSources: {
    discovery: "yunmanzhan",
    schedule: "yunmanzhan",
    venue: "yunmanzhan",
    price: "yunmanzhan",
  },
  verificationLevel: "discovery-only",
  firstSeenAt: observedAt,
  lastSeenAt: observedAt,
});

const findMatch = (events, candidate) => {
  const idMatch = events.find((event) => event.id === candidate.id);
  if (idMatch) return idMatch;
  const externalMatch = events.find((event) => Object.entries(candidate.externalIds || {})
    .some(([key, value]) => String(event.externalIds?.[key] || "") === String(value)));
  if (externalMatch) return externalMatch;
  return events
    .filter((event) => cleanCity(event.city) === cleanCity(candidate.city) && datesOverlap(event, candidate))
    .map((event) => ({ event, score: nameSimilarity(event.name, candidate.name) }))
    .filter((match) => match.score >= 0.68)
    .sort((a, b) => b.score - a.score)[0]?.event;
};

export const uniqueSources = (sources = []) => {
  const unique = new Map();
  for (const source of sources) {
    const key = `${String(source.platform || "").trim().toLowerCase()}|${String(source.label || "").trim().toLowerCase()}`;
    const current = unique.get(key);
    if (!current || (!current.primary && source.primary)) unique.set(key, source);
  }
  return [...unique.values()];
};

export const mergeCandidate = (events, candidate, observedAt) => {
  const match = findMatch(events, candidate);
  if (!match) {
    events.push(candidate);
    return candidate;
  }
  const isDiscoveryOnly = match.verificationLevel === "discovery-only"
    || match.id.startsWith("yunmanzhan-");
  const candidateIsOfficial = candidate.sourceIds?.includes("bilibili-membership");
  if (isDiscoveryOnly || candidateIsOfficial) {
    for (const field of ["name", "type", "province", "city", "venue", "startDate", "endDate", "price", "ticketStatus", "summary", "verification"]) {
      if (candidate[field]) match[field] = candidate[field];
    }
    if (candidateIsOfficial) match.verificationLevel = "ticket-verified";
  }
  match.externalIds = { ...(match.externalIds || {}), ...(candidate.externalIds || {}) };
  match.sourceIds = [...new Set([...(match.sourceIds || []), ...(candidate.sourceIds || [])])];
  match.fieldSources = { ...(match.fieldSources || {}), ...(candidate.fieldSources || {}) };
  match.ticketSources = uniqueSources([...(match.ticketSources || []), ...(candidate.ticketSources || [])]);
  match.firstSeenAt ||= candidate.firstSeenAt || observedAt;
  match.lastSeenAt = observedAt;
  delete match.missingSinceAt;
  delete match.missingRuns;
  return match;
};

export const applyBilibiliDetail = (event, payload, observedAt) => {
  const data = payload?.data;
  if (!data || !Array.isArray(data.guests)) return event;
  const previousByName = new Map((event.guests || []).map((guest) => [normalizeSpace(guest.name), guest]));
  const guests = [];
  for (const raw of data.guests) {
    const name = normalizeSpace(raw.name || raw.guest_name);
    if (!name || guests.some((guest) => guest.name === name)) continue;
    const previous = previousByName.get(name);
    guests.push({
      name,
      role: previous?.role || roleFromDescription(raw.description || raw.guest_brief),
      ...(previous?.date ? { date: previous.date } : event.startDate === event.endDate ? { date: event.startDate } : {}),
      ...(previous?.time ? { time: previous.time } : {}),
    });
  }
  if (guests.length) {
    event.guests = guests;
    event.guestStatus = event.guestStatus === "rolling" ? "rolling" : "announced";
    event.guestUpdatedAt = dateInShanghai(new Date(observedAt));
    event.verificationLevel = "guest-verified";
    event.fieldSources = { ...(event.fieldSources || {}), guests: "bilibili-membership" };
    event.verification = "活动与实名嘉宾条目来自 B站会员购公开详情接口；多日活动如未标注逐日出席，日期仍以主办方现场官宣为准。";
  } else if (!(event.guests || []).length) {
    event.guestStatus = "pending";
  }
  event.lastSeenAt = observedAt;
  return event;
};

const stableChangeId = (change) => createHash("sha1")
  .update(`${change.type}|${change.eventId}|${change.at}|${change.summary}`)
  .digest("hex")
  .slice(0, 12);

export const diffEvents = (previousEvents, nextEvents, observedAt) => {
  const changes = [];
  const previous = new Map(previousEvents.map((event) => [event.id, event]));
  for (const event of nextEvents) {
    const before = previous.get(event.id);
    if (!before) {
      changes.push({
        type: "event_added",
        eventId: event.id,
        eventName: event.name,
        at: observedAt,
        summary: `新增收录：${event.city} · ${event.name}`,
        sourceIds: event.sourceIds || [],
      });
      continue;
    }
    const beforeGuests = new Set((before.guests || []).map((guest) => guest.name));
    const nextGuests = new Set((event.guests || []).map((guest) => guest.name));
    for (const name of nextGuests) {
      if (!beforeGuests.has(name)) changes.push({
        type: "guest_added",
        eventId: event.id,
        eventName: event.name,
        at: observedAt,
        summary: `新增嘉宾：${name}`,
        sourceIds: event.sourceIds || [],
      });
    }
    for (const name of beforeGuests) {
      if (!nextGuests.has(name)) changes.push({
        type: "guest_removed",
        eventId: event.id,
        eventName: event.name,
        at: observedAt,
        summary: `嘉宾移除或待复核：${name}`,
        sourceIds: event.sourceIds || [],
      });
    }
    if (before.startDate !== event.startDate || before.endDate !== event.endDate) changes.push({
      type: "schedule_changed",
      eventId: event.id,
      eventName: event.name,
      at: observedAt,
      summary: `日期变更：${before.startDate}—${before.endDate} → ${event.startDate}—${event.endDate}`,
      sourceIds: event.sourceIds || [],
    });
    if (before.venue !== event.venue) changes.push({
      type: "venue_changed",
      eventId: event.id,
      eventName: event.name,
      at: observedAt,
      summary: `场馆变更：${before.venue} → ${event.venue}`,
      sourceIds: event.sourceIds || [],
    });
    if (before.ticketStatus !== event.ticketStatus) changes.push({
      type: "ticket_status_changed",
      eventId: event.id,
      eventName: event.name,
      at: observedAt,
      summary: `票务状态：${before.ticketStatus} → ${event.ticketStatus}`,
      sourceIds: event.sourceIds || [],
    });
  }
  return changes.map((change) => ({ id: stableChangeId(change), ...change }));
};

const request = async (url, { json = false, retries = 2, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: json ? "application/json" : "text/html,application/xhtml+xml",
          "User-Agent": "ExhibitAtlasConventionRadar/1.0 (+https://applecry.github.io/personal-homepage/)",
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return json ? await response.json() : await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
};

const fetchBilibiliList = async () => {
  const fetchPage = async (page) => {
    const url = new URL(BILIBILI_LIST_URL);
    url.searchParams.set("version", BILIBILI_VERSION);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pagesize", "20");
    url.searchParams.set("area", "-1");
    url.searchParams.set("filter", "0");
    url.searchParams.set("platform", "web");
    url.searchParams.set("p_type", "10");
    const payload = await request(url, { json: true });
    if (payload?.code !== 0 && payload?.errno !== 0) throw new Error(payload?.message || "B站列表接口返回错误");
    return payload?.data || {};
  };
  const first = await fetchPage(1);
  const pages = [first];
  const pageCount = Math.min(5, Math.ceil(Number(first.total || first.numResults || 0) / 20));
  for (let page = 2; page <= pageCount; page += 1) pages.push(await fetchPage(page));
  return pages.flatMap((payload) => payload.result || []).filter(isConventionLike);
};

const fetchBilibiliDetail = async (projectId) => {
  const url = new URL(BILIBILI_DETAIL_URL);
  url.searchParams.set("version", BILIBILI_VERSION);
  url.searchParams.set("id", String(projectId));
  url.searchParams.set("project_id", String(projectId));
  url.searchParams.set("requestSource", "pc-new");
  const payload = await request(url, { json: true });
  if (payload?.code !== 0 && payload?.errno !== 0) throw new Error(payload?.message || "B站详情接口返回错误");
  return payload;
};

const fetchYunmanzhanPages = async (pageCount) => {
  const pages = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const url = new URL(YUNMANZHAN_URL);
    url.searchParams.set("current_year", "1");
    url.searchParams.set("page", String(page));
    const html = await request(url);
    const parsed = parseYunmanzhanHtml(html, page);
    if (!parsed.length) throw new Error(`第 ${page} 页没有解析到漫展行`);
    pages.push(...parsed);
  }
  return pages;
};

export const parseYunmanzhanPageCount = (html = "") => {
  const candidates = [
    ...[...String(html).matchAll(/[?&]page=(\d+)/g)].map((match) => Number(match[1])),
    ...[...String(html).matchAll(/\bmax=["'](\d+)["']/g)].map((match) => Number(match[1])),
    ...[...String(html).matchAll(/共\s*(\d+)\s*页/g)].map((match) => Number(match[1])),
  ].filter((value) => Number.isInteger(value) && value > 0);
  return candidates.length ? Math.max(...candidates) : 1;
};

const monthWindows = (startDate, endDate) => {
  const current = new Date(`${startDate.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00Z`);
  const windows = [];
  while (current <= end) {
    windows.push({
      year: current.getUTCFullYear(),
      month: current.getUTCMonth() + 1,
    });
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return windows;
};

const fetchYunmanzhanMonthPage = async ({ year, month, page }) => {
  const url = new URL(YUNMANZHAN_URL);
  url.searchParams.set("current_year", "1");
  url.searchParams.set("year", String(year));
  url.searchParams.set("month", String(month));
  url.searchParams.set("sort", "time");
  url.searchParams.set("page", String(page));
  const html = await request(url);
  const parsed = parseYunmanzhanHtml(html, page);
  if (!parsed.length) throw new Error(`${year}-${String(month).padStart(2, "0")} 第 ${page} 页没有解析到漫展行`);
  return { html, parsed };
};

const fetchYunmanzhanHorizon = async (today, horizon) => {
  const events = [];
  let pagesChecked = 0;
  for (const window of monthWindows(today, horizon)) {
    const first = await fetchYunmanzhanMonthPage({ ...window, page: 1 });
    events.push(...first.parsed);
    pagesChecked += 1;
    const pageCount = parseYunmanzhanPageCount(first.html);
    for (let page = 2; page <= pageCount; page += DISCOVERY_CONCURRENCY) {
      const batch = Array.from(
        { length: Math.min(DISCOVERY_CONCURRENCY, pageCount - page + 1) },
        (_, index) => fetchYunmanzhanMonthPage({ ...window, page: page + index }),
      );
      const results = await Promise.all(batch);
      results.forEach((result) => events.push(...result.parsed));
      pagesChecked += results.length;
    }
  }
  return {
    items: events,
    pagesChecked,
    complete: true,
    coverageMode: "full",
  };
};

const bilibiliProjectIdsFromEvents = (events) => new Set(events.flatMap((event) => (event.ticketSources || [])
  .filter((source) => /B站会员购/u.test(source.platform))
  .map((source) => source.url.match(/[?&]id=(\d+)/)?.[1])
  .filter(Boolean)));

const withBaselineMetadata = (event, observedAt) => ({
  ...event,
  province: event.province && event.province !== "待确认" ? event.province : resolveProvince(event.city),
  ticketSources: uniqueSources(event.ticketSources || []),
  sourceIds: event.sourceIds?.length
    ? event.sourceIds
    : [...new Set((event.ticketSources || []).map((source) => {
      if (/B站/u.test(source.platform)) return "bilibili-membership";
      if (/大麦/u.test(source.platform)) return "damai";
      if (/官宣|主办/u.test(source.platform)) return "organizer";
      return null;
    }).filter(Boolean))],
  verificationLevel: event.verificationLevel
    || ((event.guests || []).length ? "guest-verified" : "ticket-verified"),
  firstSeenAt: event.firstSeenAt || observedAt,
  lastSeenAt: event.lastSeenAt || observedAt,
});

const compactError = (error) => normalizeSpace(error?.message || String(error)).slice(0, 180);

export const updateConventionDataset = async ({
  previous,
  now = new Date(),
  yunmanzhanPages = Number(process.env.CONVENTION_DISCOVERY_PAGES || DEFAULT_YUNMANZHAN_PAGES),
  discoveryMode = process.env.CONVENTION_DISCOVERY_MODE || DEFAULT_DISCOVERY_MODE,
  fetchers = {},
} = {}) => {
  const observedAt = timestampInShanghai(now);
  const today = dateInShanghai(now);
  const horizon = addDays(today, 120);
  const uniquePreviousEvents = [...new Map(previous.events.map((event) => [event.id, event])).values()];
  const events = uniquePreviousEvents.map((event) => withBaselineMetadata(structuredClone(event), observedAt));
  const sourceHealth = [];
  let bilibiliItems = [];
  let yunmanzhanHealthy = false;
  let yunmanzhanComplete = false;
  let yunmanzhanPagesChecked = 0;
  let yunmanzhanItemCount = 0;

  try {
    bilibiliItems = await (fetchers.bilibiliList || fetchBilibiliList)();
    for (const item of bilibiliItems) {
      if (!item.start_time || !item.end_time || item.end_time < addDays(today, -7) || item.start_time > horizon) continue;
      mergeCandidate(events, conventionFromBilibiliListItem(item, observedAt), observedAt);
    }
    sourceHealth.push({
      sourceId: "bilibili-membership",
      status: "healthy",
      checkedAt: observedAt,
      itemCount: bilibiliItems.length,
      detailChecks: 0,
      detailFailures: 0,
      note: "公开列表接口正常；正在复核有嘉宾标记的详情页。",
    });
  } catch (error) {
    sourceHealth.push({
      sourceId: "bilibili-membership",
      status: "unavailable",
      checkedAt: observedAt,
      itemCount: 0,
      detailChecks: 0,
      detailFailures: 0,
      error: compactError(error),
      note: "本轮抓取失败，已保留上一版 B站数据。",
    });
  }

  const detailIds = bilibiliProjectIdsFromEvents(events);
  for (const item of bilibiliItems) {
    if (Array.isArray(item.guests) && item.guests.length) detailIds.add(String(item.project_id));
  }
  const detailHealth = sourceHealth.find((item) => item.sourceId === "bilibili-membership");
  const detailFetcher = fetchers.bilibiliDetail || fetchBilibiliDetail;
  for (const projectId of detailIds) {
    const event = events.find((item) => String(item.externalIds?.bilibili || "") === String(projectId)
      || item.ticketSources?.some((source) => source.url.includes(`id=${projectId}`)));
    if (!event) continue;
    detailHealth.detailChecks += 1;
    try {
      const detail = await detailFetcher(projectId);
      event.externalIds = { ...(event.externalIds || {}), bilibili: String(projectId) };
      event.sourceIds = [...new Set([...(event.sourceIds || []), "bilibili-membership"])];
      applyBilibiliDetail(event, detail, observedAt);
    } catch (error) {
      detailHealth.detailFailures += 1;
      detailHealth.status = detailHealth.status === "unavailable" ? "unavailable" : "partial";
      detailHealth.note = "列表正常，但部分详情页暂时不可用；相关活动保留上一版嘉宾。";
    }
  }

  try {
    const result = await (fetchers.yunmanzhan || (() => (
      discoveryMode === "quick"
        ? fetchYunmanzhanPages(yunmanzhanPages).then((items) => ({
          items,
          pagesChecked: yunmanzhanPages,
          complete: false,
          coverageMode: "quick",
        }))
        : fetchYunmanzhanHorizon(today, horizon)
    )))();
    const discovered = Array.isArray(result) ? result : result.items;
    yunmanzhanComplete = Array.isArray(result) ? discoveryMode === "full" : Boolean(result.complete);
    yunmanzhanPagesChecked = Array.isArray(result) ? yunmanzhanPages : Number(result.pagesChecked || 0);
    const eligible = discovered.filter((item) => item.endDate >= addDays(today, -7)
      && item.startDate <= horizon
      && isYunmanzhanConventionLike(item));
    for (const item of eligible) mergeCandidate(events, conventionFromYunmanzhan(item, observedAt), observedAt);
    yunmanzhanHealthy = true;
    yunmanzhanItemCount = eligible.length;
    sourceHealth.push({
      sourceId: "yunmanzhan",
      status: "healthy",
      checkedAt: observedAt,
      itemCount: eligible.length,
      pagesChecked: yunmanzhanPagesChecked,
      coverageMode: yunmanzhanComplete ? "full" : "quick",
      note: yunmanzhanComplete
        ? "已按月份完整扫描未来 120 天；用于广覆盖发现，不会单独确认嘉宾。"
        : "本轮为高频轻量扫描；完整覆盖由每日任务补齐，不会因未出现在本轮而删除活动。",
    });
  } catch (error) {
    sourceHealth.push({
      sourceId: "yunmanzhan",
      status: "unavailable",
      checkedAt: observedAt,
      itemCount: 0,
      pagesChecked: yunmanzhanPagesChecked,
      coverageMode: discoveryMode,
      error: compactError(error),
      note: "本轮发现源失败，已保留上一版活动。",
    });
  }

  sourceHealth.push({
    sourceId: "damai",
    status: "manual-review",
    checkedAt: observedAt,
    itemCount: events.filter((event) => event.sourceIds?.includes("damai")).length,
    note: "公开搜索页动态化且无稳定匿名接口；仅作为大型活动票务复核源，不自动推断嘉宾。",
  });
  sourceHealth.push({
    sourceId: "organizer",
    status: "manual-review",
    checkedAt: observedAt,
    itemCount: events.filter((event) => event.sourceIds?.includes("organizer")).length,
    note: "逐日出席、签售和临时变更仍以主办方官宣人工复核。",
  });

  if (yunmanzhanHealthy && yunmanzhanComplete) {
    events.forEach((event) => {
      const missingFromCompleteScan = event.verificationLevel === "discovery-only"
        && event.sourceIds?.length === 1
        && event.sourceIds[0] === "yunmanzhan"
        && event.lastSeenAt !== observedAt;
      if (!missingFromCompleteScan) return;
      event.missingSinceAt ||= observedAt;
      event.missingRuns = Number(event.missingRuns || 0) + 1;
    });
  }

  const nextEvents = events
    .filter((event) => event.endDate >= addDays(today, -7)
      && event.startDate <= horizon
      && !(yunmanzhanHealthy
        && yunmanzhanComplete
        && event.verificationLevel === "discovery-only"
        && event.sourceIds?.length === 1
        && event.sourceIds[0] === "yunmanzhan"
        && Number(event.missingRuns || 0) >= MISSING_RUN_LIMIT))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.city.localeCompare(b.city, "zh-CN") || a.name.localeCompare(b.name, "zh-CN"));
  const newChanges = diffEvents(previous.events, nextEvents, observedAt);
  const changes = [...newChanges, ...(previous.changes || [])]
    .filter((change, index, all) => all.findIndex((item) => item.id === change.id) === index)
    .slice(0, 120);

  return {
    ...previous,
    sources: [...new Map([...(previous.sources || []), DISCOVERY_SOURCE]
      .map((source) => [source.id, source])).values()],
    updatedAt: observedAt,
    checkedAt: observedAt,
    coverage: `中国大陆未来 120 天 ACGN 漫展；B站会员购官方列表 + 次元黄页${yunmanzhanComplete ? "完整月份扫描" : "高频轻量扫描"}（本轮 ${yunmanzhanPagesChecked} 页、${yunmanzhanItemCount} 条），嘉宾仅展示平台结构化名单或主办方官宣`,
    policy: "广覆盖发现不等于嘉宾确认；票务事实优先 B站会员购和大麦，嘉宾名单仅采用 B站结构化详情或主办方官宣，抓取失败保留上一版并公开来源健康度。",
    sourceHealth,
    changes,
    stats: {
      eventCount: nextEvents.length,
      guestVerifiedEvents: nextEvents.filter((event) => (event.guests || []).length).length,
      guestCount: new Set(nextEvents.flatMap((event) => (event.guests || []).map((guest) => guest.name))).size,
      discoveryOnlyEvents: nextEvents.filter((event) => event.verificationLevel === "discovery-only").length,
      generatedAt: observedAt,
    },
    events: nextEvents,
  };
};

const main = async () => {
  const previous = JSON.parse(await readFile(DATA_URL, "utf8"));
  const next = await updateConventionDataset({ previous });
  await writeFile(DATA_URL, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  const health = Object.fromEntries(next.sourceHealth.map((source) => [source.sourceId, source.status]));
  console.log(JSON.stringify({
    updatedAt: next.updatedAt,
    events: next.events.length,
    guestVerifiedEvents: next.stats.guestVerifiedEvents,
    guests: next.stats.guestCount,
    newChanges: next.changes.filter((change) => change.at === next.updatedAt).length,
    health,
  }, null, 2));
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
