import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const outputPath = fileURLToPath(new URL("../data/exhibitions.json", import.meta.url));
const curatedPath = fileURLToPath(new URL("../data/exhibitions-curated.json", import.meta.url));
const shanghaiFilingBaseUrl = "https://expo.sww.sh.gov.cn/browser/";
const shanghaiFilingListUrl = `${shanghaiFilingBaseUrl}search-entp-index.jspx?code=SEARCH`;
const neccCalendarUrl = "https://www.neccsh.com/cecsh/exhibitioninfo/exhibitionlist.jspx?v=1";
const sniecCalendarUrl = "https://www.sniec.net/";
const shanghaiSearchTerms = [
  "上海",
  "上海新国际博览中心",
  "上海世博展览馆",
  "国家会展中心（上海）",
  "ChinaJoy",
  "中国国际数码互动娱乐展览会",
  "上海展会 2026",
];
const anchoredDetailPaths = ["/detail/q2TfK24G", "/detail/yaYnmW6k", "/detail/1EwTjMpx", "/detail/uzkWVcq6"];
const listUrlFor = (keyword) => `https://www.expofinder.com/list?keyword=${encodeURIComponent(keyword)}`;
const shanghaiListUrl = listUrlFor(shanghaiSearchTerms[0]);
const maxDetails = 80;
const shanghaiCalendarUrl = "https://english.shanghai.gov.cn/en-InvestmentCalendar/20260115/5c0e7fa323474298b5a24f7ea81f7972.html";
const chinajoyOfficialUrl = "https://btb.chinajoy.net/news/63876";
const waicOfficialUrl = "https://www.shanghai.gov.cn/nw4411/20260708/ba4c8e75f2744b43a6080ebb82a3aab2.html";

const sourceDefinitions = [
  { name: "上海市会展业公共信息服务平台", scope: "上海已备案会展主库：状态、文号、主办方、面积、内容与同期展会", url: shanghaiFilingListUrl, probe: shanghaiFilingListUrl, automated: true, authority: "official" },
  { name: "上海市商务委员会", scope: "2026 年上海重点展会官方基线（90 场，收录当前日期之后的排期）", url: shanghaiCalendarUrl, probe: shanghaiCalendarUrl },
  { name: "上海市人民政府", scope: "WAIC、ChinaJoy 与月度重点展会官方核验", url: "https://www.shanghai.gov.cn/", probe: waicOfficialUrl },
  { name: "国家会展中心（上海）", scope: "场馆排期、展厅号与展会官网交叉核验", url: neccCalendarUrl, probe: neccCalendarUrl, authority: "venue" },
  { name: "上海新国际博览中心", scope: "场馆排期与日期交叉核验", url: sniecCalendarUrl, probe: sniecCalendarUrl, authority: "venue" },
  { name: "上海世博展览馆", scope: "世博展览馆项目与活动交叉核验", url: "https://sweecc.dlg-expo.com/", probe: "https://sweecc.dlg-expo.com/", authority: "venue" },
  { name: "上海世贸商城", scope: "时尚、珠宝、茶业与消费类中小型展会排期", url: "https://www.shanghaimart.com/activity/activ_list.aspx", probe: "https://www.shanghaimart.com/activity/activ_list.aspx", authority: "venue" },
  { name: "上海跨国采购会展中心", scope: "跨采中心展览预告与会议活动", url: "https://www.shcec.com.cn/", probe: "https://www.shcec.com.cn/", authority: "venue" },
  { name: "ChinaJoy", scope: "ChinaJoy 日期、场馆与主题官方核验", url: "https://chinajoy.net/", probe: chinajoyOfficialUrl },
  { name: "展查查", scope: "上海长尾排期自动发现与结构化详情", url: "https://www.expofinder.com/", probe: shanghaiListUrl, automated: true },
  { name: "去展网", scope: "上海近期排期发现与交叉核验", url: "https://www.qufair.com/", probe: "https://www.qufair.com/fl/0-274-0/" },
  { name: "第一展会网", scope: "上海展馆、行业与排期交叉核验", url: "https://www.onezh.com/", probe: "https://www.onezh.com/zhanhui/1_21_0_0_20260101/20261231/" },
  { name: "展外展", scope: "参展商数据与参展轨迹参考", url: "https://www.expoagain.com/", probe: "https://www.expoagain.com/" },
  { name: "中国会展门户", scope: "会展供应链与排期参考", url: "https://www.cnena.com/", probe: "https://www.cnena.com/" },
];

const venueCoordinates = [
  [/国家会展中心/, [31.1889, 121.299]],
  [/新国际博览中心|New International Expo/, [31.2117, 121.5635]],
  [/世博展览馆|World Expo Exhibition/, [31.185, 121.489]],
  [/世贸商城|Shanghai Mart/, [31.2019, 121.407]],
  [/上海展览中心/, [31.2291, 121.4545]],
  [/跨国采购/, [31.236, 121.392]],
  [/汽车会展中心/, [31.2853, 121.1768]],
  [/汽车博物馆/, [31.2788, 121.1809]],
  [/艺仓美术馆/, [31.2035, 121.5072]],
];

const decodeEntities = (value = "") => value
  .replace(/&nbsp;|&#160;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'");

const cleanText = (value = "") => decodeEntities(value)
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const cleanMultilineText = (value = "") => decodeEntities(value)
  .replace(/<br\s*\/?\s*>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/[ \t]+/g, " ")
  .replace(/ *\n */g, "\n")
  .replace(/\n+/g, "\n")
  .trim();

const normalizeIsoDate = (value = "") => {
  const match = String(value).trim().match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const english = String(value).trim().match(/^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/);
  if (english) {
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(english[1].toLowerCase()) + 1;
    if (month) return `${english[3]}-${String(month).padStart(2, "0")}-${english[2].padStart(2, "0")}`;
  }
  const parsed = new Date(String(value).trim());
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};

const canonicalVenue = (value = "") => {
  const venue = cleanText(value).replace(/\s+/g, "");
  if (/国家会展中心.*上海/.test(venue)) return "国家会展中心（上海）";
  if (/新国际博览中心|新国际展览中心|新国际会展中心/.test(venue)) return "上海新国际博览中心";
  if (/世博展览馆/.test(venue)) return "上海世博展览馆";
  if (/世贸商城展览馆/.test(venue)) return "上海世贸商城展览馆";
  if (/跨国采购会展中心/.test(venue)) return "上海跨国采购会展中心";
  return cleanText(value).replace(/\([^)]*区\)|（[^）]*区）/g, "").trim();
};

const filingDetailUrl = (code) => new URL(`search-entp-expo.jspx?code=${encodeURIComponent(code)}`, shanghaiFilingBaseUrl).toString();

const parseFilingList = (html) => Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi), ([, row]) => {
  const link = row.match(/search-entp-expo\.jspx\?code=([a-f0-9-]+)[^>]*class=["']ggxx["'][^>]*>([\s\S]*?)<\/a>/i);
  if (!link) return null;
  const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi), (match) => match[1]);
  if (cells.length < 5) return null;
  const dates = cleanText(cells[4]).match(/(\d{4}-\d{1,2}-\d{1,2})\s*至\s*(\d{4}-\d{1,2}-\d{1,2})/);
  const name = cleanText(link[2]);
  const filingStatus = cleanText(cells[0]).replace(name, "").trim() || "已备案";
  const organizers = cleanMultilineText(cells[1]).split("\n").map(cleanText).filter(Boolean);
  const venue = canonicalVenue(cells[2]);
  if (!name || !dates || !venue) return null;
  const [lat, lng] = coordinatesFor(venue);
  return {
    id: `sh-filing-${link[1]}`,
    filingCode: link[1],
    name,
    nameZh: name,
    category: categoryOf(name, ""),
    eventType: "展览",
    exhibitionType: cleanText(cells[3]),
    region: "亚洲",
    city: "上海",
    country: "中国",
    venue,
    startDate: normalizeIsoDate(dates[1]),
    endDate: normalizeIsoDate(dates[2]),
    lat,
    lng,
    organizers,
    filingStatus,
    summary: `${name}已在上海市会展业公共信息服务平台备案。`,
    visitorType: "开放安排以主办方规则为准",
    source: "上海市会展业公共信息服务平台",
    sourceUrl: filingDetailUrl(link[1]),
    url: filingDetailUrl(link[1]),
    verification: "上海市会展业公共信息服务平台备案信息",
    confidence: "official",
    collectedAt: new Date().toISOString(),
    featured: false,
  };
}).filter(Boolean);

const parseFilingDetail = (html, fallback = {}) => {
  const mainBlock = html.match(/<li[^>]+class=["'][^"']*table01[^"']*["'][^>]*>([\s\S]*?)<\/li>/i)?.[1] || "";
  const text = cleanMultilineText(mainBlock);
  const title = cleanText(html.match(/tableheadleft[^>]*>[\s\S]*?<b>([\s\S]*?)<\/b>/i)?.[1] || fallback.nameZh || "");
  const dateMatch = text.match(/日期：\s*(\d{4}-\d{1,2}-\d{1,2})\s*至\s*(\d{4}-\d{1,2}-\d{1,2})/);
  const organizersText = text.match(/主办：([\s\S]*?)\n日期：/)?.[1] || "";
  const venue = canonicalVenue(text.match(/地址：([^\n]*?)(?:面积：|\n)/)?.[1] || fallback.venue || "");
  const content = cleanText(text.match(/内容：([\s\S]*?)(?:\*本平台|$)/)?.[1] || "");
  const filingStatus = cleanText(text.match(/展会状态:\s*([^\n]+)/)?.[1] || fallback.filingStatus || "已备案");
  const concurrentEvents = Array.from(html.matchAll(/search-entp-expo\.jspx\?code=([a-f0-9-]+)[^>]*class=["']ggxx["'][^>]*>([\s\S]*?)<\/a>\s*\(([^)]+)\)/gi), (match) => {
    const [startDate, endDate] = match[3].split(/至/).map((date) => normalizeIsoDate(date));
    return {
      filingCode: match[1],
      nameZh: cleanText(match[2]),
      startDate,
      endDate,
      url: filingDetailUrl(match[1]),
    };
  });
  const [lat, lng] = coordinatesFor(venue || fallback.venue || "");
  return {
    ...fallback,
    name: title || fallback.name,
    nameZh: title || fallback.nameZh,
    category: categoryOf(title || fallback.nameZh, content),
    venue: venue || fallback.venue,
    startDate: dateMatch ? normalizeIsoDate(dateMatch[1]) : fallback.startDate,
    endDate: dateMatch ? normalizeIsoDate(dateMatch[2]) : fallback.endDate,
    lat,
    lng,
    organizers: organizersText.split(/[、,，;；]|\n/).map(cleanText).filter(Boolean).length
      ? organizersText.split(/[、,，;；]|\n/).map(cleanText).filter(Boolean)
      : (fallback.organizers || []),
    filingStatus,
    filingNumber: cleanText(text.match(/展会文号：([^\n]+)/)?.[1] || ""),
    exhibitionArea: Number(text.match(/面积：\s*([\d,.]+)\s*平方米/)?.[1]?.replace(/,/g, "")) || null,
    summary: content || fallback.summary,
    concurrentEvents,
    status: /取消/.test(filingStatus) ? "取消" : /延期|变更/.test(filingStatus) ? "变更" : fallback.status,
  };
};

const fetchWithCurl = async (url) => {
  const binary = process.platform === "win32" ? "curl.exe" : "curl";
  const args = ["-L", "--fail", "--silent", "--show-error", "--max-time", "30"];
  if (process.platform === "win32") args.push("--ssl-no-revoke");
  args.push(url);
  const { stdout } = await execFileAsync(binary, args, { maxBuffer: 1024 * 1024 * 12 });
  return stdout;
};

const fetchText = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/126 Safari/537.36", accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (url.includes("expofinder.com/detail/") && !text.includes("@context")) throw new Error("incomplete detail page");
    if (url.includes("expofinder.com/list") && !text.includes("/detail/")) throw new Error("incomplete list page");
    return text;
  } catch (error) {
    try {
      return await fetchWithCurl(url);
    } catch {
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeCountry = (country = "", city = "") => {
  const value = `${country} ${city}`.toLowerCase();
  if (/台湾|taiwan|taipei|台北/.test(value)) return "中国台湾";
  if (/香港|hong kong/.test(value)) return "中国香港";
  if (/中国|china/.test(value)) return "中国";
  return cleanText(country);
};

const normalizeCity = (city = "", country = "") => {
  const value = `${city} ${country}`.toLowerCase();
  if (/台北|taipei/.test(value)) return "台北";
  if (/香港|hong kong/.test(value)) return "香港";
  return cleanText(city);
};

const shanghaiDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
};

const categoryOf = (name, description) => {
  const text = `${name} ${description}`.toLowerCase();
  if (/chinajoy|数码互动娱乐|游戏|电玩|动漫|电竞|game|gaming|comic|esport/.test(text)) return "游戏";
  if (/艺术|设计|珠宝|摄影|画廊|art|design|jewel/.test(text)) return "艺术";
  if (/人工智能|机器人|电子|半导体|数据中心|储能|新能源|工业|机械|科技|智能|ai(?:\s|$)|robot|electronic|technology|industrial/.test(text)) return "科技";
  return "商贸";
};

const coordinatesFor = (venue) => venueCoordinates.find(([pattern]) => pattern.test(venue))?.[1] || [31.2304, 121.4737];

const eventFromJsonLdValue = (value) => {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.map(eventFromJsonLdValue).find(Boolean) || null;
  }
  if (value["@type"] === "Event" || (Array.isArray(value["@type"]) && value["@type"].includes("Event"))) {
    return value;
  }
  return eventFromJsonLdValue(value["@graph"]);
};

const parseEventJsonLd = (html) => {
  const standardScripts = Array.from(
    html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
    (match) => match[1],
  );
  for (const script of standardScripts) {
    try {
      const event = eventFromJsonLdValue(JSON.parse(decodeEntities(script).trim()));
      if (event) return event;
    } catch {
      // Continue with other JSON-LD blocks and the Next.js flight fallback.
    }
  }

  const contextIndex = html.indexOf("@context");
  if (contextIndex < 0) return null;
  const pushToken = "self.__next_f.push([1,";
  const pushStart = html.lastIndexOf(pushToken, contextIndex);
  const encodedEnd = html.indexOf("])</script>", contextIndex);
  if (pushStart < 0 || encodedEnd < 0) return null;
  try {
    const decoded = JSON.parse(html.slice(pushStart + pushToken.length, encodedEnd));
    const payload = JSON.parse(decoded);
    return payload?.["@type"] === "Event" ? payload : null;
  } catch {
    return null;
  }
};

const detailPathsFromList = (html) => {
  const paths = Array.from(html.matchAll(/\/detail\/[A-Za-z0-9]+/g), (match) => match[0]);
  return [...new Set(paths)];
};

const loadCuratedEvents = async () => {
  const catalog = JSON.parse(await readFile(curatedPath, "utf8"));
  const defaults = catalog.defaults || {};
  const collectedAt = new Date().toISOString();
  return (catalog.events || []).map((entry) => {
    const event = { ...defaults, ...entry };
    const [lat, lng] = coordinatesFor(event.venue || "");
    return {
      ...event,
      lat: Number.isFinite(event.lat) ? event.lat : lat,
      lng: Number.isFinite(event.lng) ? event.lng : lng,
      sourceUrl: event.sourceUrl || event.url || defaults.sourceUrl,
      url: event.url || event.sourceUrl || defaults.sourceUrl,
      collectedAt,
      featured: Boolean(event.featured),
    };
  });
};

const locationParts = (location = "") => cleanText(location)
  .split(/[·•]/)
  .map((part) => part.trim())
  .filter(Boolean);

const eventFromSchema = (schema, sourceUrl, detailId) => {
  if (!schema) return null;
  const locationName = schema.location?.name || schema.location?.address || "";
  const parts = locationParts(locationName);
  const rawCountry = parts[0] || "中国";
  const rawCity = parts[1] || "上海";
  const venue = parts.slice(2).join(" · ") || "上海（具体场馆见来源页）";
  const country = normalizeCountry(rawCountry, rawCity);
  const city = normalizeCity(rawCity, country);
  const startDate = shanghaiDate(schema.startDate);
  const endDate = shanghaiDate(schema.endDate);
  const summary = cleanText(schema.description)
    .replace(/展查查提供官网、主办方、展商和相关展会信息。?/g, "")
    .slice(0, 150);
  const [lat, lng] = coordinatesFor(venue);

  if (!schema.name || city !== "上海" || !startDate || !endDate) return null;
  return {
    id: `expofinder-${detailId}`,
    name: cleanText(schema.name),
    nameZh: cleanText(schema.name),
    category: categoryOf(schema.name, summary),
    region: "亚洲",
    city,
    country,
    venue,
    startDate,
    endDate,
    lat,
    lng,
    summary: summary || `${schema.name}将于${startDate}至${endDate}在上海举行。`,
    visitorType: "开放安排以主办方规则为准",
    source: "展查查（公开结构化数据）",
    sourceUrl,
    url: sourceUrl,
    verification: "聚合平台待官网复核",
    collectedAt: new Date().toISOString(),
    featured: false,
  };
};

const probeSource = async (source) => {
  try {
    const html = await fetchText(source.probe);
    const blocked = /验证不是机器人|WebShieldSessionVerify|访问过于频繁|captcha/i.test(html);
    return { ...source, status: blocked ? "受访问验证限制" : "可访问" };
  } catch (error) {
    return { ...source, status: `暂不可访问：${error.message}` };
  }
};

const roundRobinPaths = (pathGroups, limit = maxDetails) => {
  const result = [...anchoredDetailPaths];
  const seen = new Set(result);
  const longestGroup = Math.max(0, ...pathGroups.map((paths) => paths.length));
  for (let index = 0; index < longestGroup && result.length < limit; index += 1) {
    for (const paths of pathGroups) {
      const path = paths[index];
      if (path && !seen.has(path)) {
        seen.add(path);
        result.push(path);
        if (result.length >= limit) break;
      }
    }
  }
  return result.slice(0, limit);
};

const collectFilingEvents = async () => {
  const listHtml = await fetchText(shanghaiFilingListUrl);
  const listEvents = parseFilingList(listHtml);
  if (!listEvents.length) throw new Error("Shanghai filing platform returned no exhibition records");
  const events = [];
  for (let offset = 0; offset < listEvents.length; offset += 8) {
    const batch = listEvents.slice(offset, offset + 8);
    const results = await Promise.allSettled(batch.map(async (event) => {
      const detailHtml = await fetchText(event.sourceUrl);
      return parseFilingDetail(detailHtml, event);
    }));
    results.forEach((result, index) => events.push(result.status === "fulfilled" ? result.value : batch[index]));
  }
  return events;
};

const normalizedEventName = (value = "") => cleanText(value)
  .toLowerCase()
  .replace(/[\s·•・—–\-（）()《》“”"'，,。.、:：]/g, "");

const filingMatchesEvent = (filing, event) => {
  if (!filing || !event) return false;
  if (filing.filingCode && filing.filingCode === event.filingCode) return true;
  if (filing.startDate !== event.startDate) return false;
  const filingName = normalizedEventName(filing.nameZh || filing.name);
  const names = [event.nameZh, event.name, ...(event.aliases || [])].map(normalizedEventName).filter(Boolean);
  return names.some((name) => name === filingName
    || (name.length >= 8 && (filingName.includes(name) || name.includes(filingName))));
};

const enrichWithFiling = (event, filing) => {
  const officialUrl = event.url && !String(event.url).includes("english.shanghai.gov.cn/en-InvestmentCalendar")
    ? event.url
    : filing.url;
  return {
    ...event,
    venue: filing.venue || event.venue,
    startDate: filing.startDate || event.startDate,
    endDate: filing.endDate || event.endDate,
    lat: filing.lat,
    lng: filing.lng,
    organizers: filing.organizers,
    eventType: filing.eventType,
    exhibitionType: filing.exhibitionType,
    filingCode: filing.filingCode,
    filingNumber: filing.filingNumber,
    filingStatus: filing.filingStatus,
    exhibitionArea: filing.exhibitionArea,
    concurrentEvents: filing.concurrentEvents,
    source: filing.source,
    sourceUrl: filing.sourceUrl,
    url: officialUrl,
    verification: "上海市会展业公共信息服务平台备案信息已核验",
    verificationSources: [...new Set([filing.sourceUrl, event.sourceUrl, event.url].filter(Boolean))],
    confidence: "official",
    status: filing.status || event.status,
    collectedAt: filing.collectedAt,
  };
};

const mergeFilingEvents = (events, filings) => {
  const remaining = [...events];
  const merged = filings.map((filing) => {
    const matches = remaining.filter((event) => filingMatchesEvent(filing, event));
    if (!matches.length) return filing;
    const event = matches.find((item) => !String(item.id || "").startsWith("sh-filing-")) || matches[0];
    matches.forEach((match) => remaining.splice(remaining.indexOf(match), 1));
    return enrichWithFiling(event, filing);
  });
  return [...merged, ...remaining];
};

const collectShanghai = async (verifiedOfficialEvents) => {
  const listResults = await Promise.allSettled(
    shanghaiSearchTerms.map((keyword) => fetchText(listUrlFor(keyword))),
  );
  const listPages = listResults.flatMap((result, index) => {
    if (result.status === "fulfilled") return [result.value];
    console.warn(`List query failed (${shanghaiSearchTerms[index]}): ${result.reason?.message || result.reason}`);
    return [];
  });
  const detailPaths = roundRobinPaths(listPages.map(detailPathsFromList));

  const events = [];
  let missingSchema = 0;
  let rejectedEvents = 0;
  let failedDetails = 0;
  for (let offset = 0; offset < detailPaths.length; offset += 6) {
    const batch = detailPaths.slice(offset, offset + 6);
    const results = await Promise.allSettled(batch.map(async (path) => {
      const sourceUrl = new URL(path, "https://www.expofinder.com").toString();
      const html = await fetchText(sourceUrl);
      const schema = parseEventJsonLd(html);
      if (!schema) missingSchema += 1;
      const event = eventFromSchema(schema, sourceUrl, path.split("/").pop());
      if (schema && !event) rejectedEvents += 1;
      return event;
    }));
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) events.push(result.value);
      if (result.status === "rejected") failedDetails += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (missingSchema || rejectedEvents || failedDetails) {
    console.warn(`Skipped details: ${missingSchema} without Event schema, ${rejectedEvents} outside Shanghai or invalid, ${failedDetails} fetch failures`);
  }
  return mergeVerifiedEvents(events, verifiedOfficialEvents);
};

const officialEventMatches = (event, official) => {
  if (event.startDate !== official.startDate) return false;
  const name = `${event.name || ""} ${event.nameZh || ""}`.toLowerCase();
  return (official.aliases || []).some((alias) => name.includes(alias.toLowerCase()));
};

const mergeVerifiedEvents = (events, officialEvents) => [
  ...events.filter((event) => !officialEvents.some((official) => officialEventMatches(event, official))),
  ...officialEvents,
];

const eventKey = (event) => `${normalizedEventName(event.nameZh || event.name)}|${event.startDate}`;
const contentSignature = (events) => JSON.stringify(events.map(({ collectedAt, ...event }) => event));

const mergeExhibitionHistory = ({
  previousEvents = [],
  collectedEvents = [],
  verifiedOfficialEvents = [],
  filingEvents = [],
} = {}) => {
  const preserved = previousEvents
    .map((event) => ({ ...event, country: normalizeCountry(event.country, event.city), city: normalizeCity(event.city, event.country) }));
  const combined = mergeFilingEvents(
    mergeVerifiedEvents([...preserved, ...collectedEvents], verifiedOfficialEvents),
    filingEvents,
  );
  const mergedById = new Map(combined.map((event) => [event.id, event]));
  const mergedByKey = new Map();
  for (const event of mergedById.values()) {
    mergedByKey.set(eventKey(event), event);
  }
  return [...mergedByKey.values()]
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.nameZh.localeCompare(b.nameZh, "zh-CN"));
};

const main = async () => {
  const previous = JSON.parse(await readFile(outputPath, "utf8"));
  const verifiedOfficialEvents = await loadCuratedEvents();
  const filingPromise = collectFilingEvents().catch((error) => {
    console.warn(`Shanghai filing collection failed; continuing with curated and discovered records: ${error.message}`);
    return [];
  });
  const [discoveredEvents, filingEvents, sourceResults] = await Promise.all([
    collectShanghai(verifiedOfficialEvents),
    filingPromise,
    Promise.all(sourceDefinitions.map(probeSource)),
  ]);
  const collected = mergeFilingEvents(discoveredEvents, filingEvents);

  if (!collected.length) {
    console.warn("No usable Shanghai Event data; keeping the previous file unchanged");
    return;
  }

  const merged = mergeExhibitionHistory({
    previousEvents: previous.events,
    collectedEvents: collected,
    verifiedOfficialEvents,
    filingEvents,
  });

  const now = new Date().toISOString();
  const contentChanged = contentSignature(merged) !== contentSignature(previous.events || []);

  const payload = {
    updatedAt: contentChanged ? now : (previous.updatedAt || now),
    checkedAt: now,
    focusCity: "上海",
    geographyPolicy: { Taiwan: "中国台湾", HongKong: "中国香港" },
    collection: {
      mode: "daily",
      checkedAt: now,
      source: "上海会展业备案平台主库 + 场馆排期核验 + 商务委重点展会 + 展查查长尾发现",
      collected: collected.length,
      curated: verifiedOfficialEvents.length,
      officialFiled: filingEvents.length,
      total: merged.length,
    },
    events: merged,
    sources: sourceResults.map(({ probe, ...source }) => source),
  };
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${merged.length} exhibitions (${filingEvents.length} official Shanghai filings; ${verifiedOfficialEvents.length} curated; content ${contentChanged ? "changed" : "unchanged"})`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  categoryOf,
  canonicalVenue,
  collectFilingEvents,
  detailPathsFromList,
  filingMatchesEvent,
  loadCuratedEvents,
  mergeExhibitionHistory,
  mergeFilingEvents,
  mergeVerifiedEvents,
  normalizeCountry,
  officialEventMatches,
  parseEventJsonLd,
  parseFilingDetail,
  parseFilingList,
  roundRobinPaths,
};
