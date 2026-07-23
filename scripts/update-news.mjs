import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const outputPath = fileURLToPath(new URL("../data/news.json", import.meta.url));
const rssEndpoint = "https://www.bing.com/news/search";
const googleNewsEndpoint = "https://news.google.com/rss/search";
const githubModelsEndpoint = "https://models.github.ai/inference/chat/completions";
const maxArticleAgeMs = 4 * 24 * 60 * 60 * 1000;
const freshArticleAgeMs = 36 * 60 * 60 * 1000;
const newsHistoryDays = 7;
const newsTimeZone = "Asia/Shanghai";

const topics = [
  {
    id: "ai",
    label: "AI",
    description: "模型、产品、监管与资本动向",
    queries: [
      "人工智能 大模型 OpenAI",
      "OpenAI Anthropic Gemini 英伟达 AI",
      "生成式AI 智能体 机器人",
    ],
    directFeeds: [
      { provider: "wired-ai", url: "https://www.wired.com/feed/tag/ai/latest/rss" },
      { provider: "lemonde-ai", url: "https://www.lemonde.fr/en/artificial-intelligence/rss_full.xml" },
    ],
    requiredKeywords: ["AI", "人工智能", "大模型", "OpenAI", "Anthropic", "Claude", "Gemini", "ChatGPT", "英伟达", "Nvidia", "智能体", "机器人"],
    locale: { mkt: "zh-CN", cc: "CN", setlang: "zh-Hans" },
    keywords: ["OpenAI", "Anthropic", "Nvidia", "人工智能", "大模型", "生成式AI", "AI", "model"],
  },
  {
    id: "us-stocks",
    label: "美股",
    description: "美股指数、科技股、财报与宏观信号",
    queries: ["美股 纳斯达克 标普500 科技股", "美股 美联储 英伟达 特斯拉"],
    requiredKeywords: ["美股", "纳斯达克", "标普", "道指", "华尔街", "美联储", "Fed", "Nasdaq", "S&P"],
    locale: { mkt: "zh-CN", cc: "CN", setlang: "zh-Hans" },
    keywords: ["Nasdaq", "S&P", "Wall Street", "Nvidia", "Tesla", "Apple", "Fed", "美股", "纳斯达克"],
  },
  {
    id: "a-shares",
    label: "A股",
    description: "A股市场、政策、行业板块与资金面",
    queries: ["A股 沪深 上证", "A股 创业板 科创板 今日"],
    requiredKeywords: ["A股", "上证", "沪深", "深证", "创业板", "科创板"],
    locale: { mkt: "zh-CN", cc: "CN", setlang: "zh-Hans" },
    keywords: ["A股", "沪深", "上证", "创业板", "北向资金", "China", "Chinese stocks"],
  },
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const newsDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: newsTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const buildNewsHistory = (previous, current, now = current.checkedAt) => {
  const currentDate = new Date(now);
  const cutoffDate = new Date(currentDate.getTime() - (newsHistoryDays - 1) * 24 * 60 * 60 * 1000);
  const cutoffKey = newsDateKey(cutoffDate);
  const snapshots = new Map();
  const addSnapshot = (snapshot) => {
    const checkedAt = snapshot?.checkedAt || snapshot?.generatedAt;
    const date = snapshot?.date || newsDateKey(checkedAt);
    if (!date || !Array.isArray(snapshot?.topics) || date < cutoffKey) return;
    snapshots.set(date, {
      date,
      checkedAt,
      contentUpdatedAt: snapshot.contentUpdatedAt || checkedAt,
      topics: snapshot.topics,
    });
  };

  (Array.isArray(previous.history) ? previous.history : []).forEach(addSnapshot);
  if (Array.isArray(previous.topics) && previous.topics.length) {
    addSnapshot({
      date: newsDateKey(previous.checkedAt || previous.generatedAt),
      checkedAt: previous.checkedAt || previous.generatedAt,
      contentUpdatedAt: previous.contentUpdatedAt,
      topics: previous.topics,
    });
  }
  addSnapshot({
    date: newsDateKey(current.checkedAt),
    checkedAt: current.checkedAt,
    contentUpdatedAt: current.contentUpdatedAt,
    topics: current.topics,
  });

  return [...snapshots.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, newsHistoryDays);
};

const decodeEntities = (value = "") =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

const normalizeText = (value = "") =>
  decodeEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const textOf = (block, tag) => {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`, "i"));
  return normalizeText(match?.[1] || "");
};

const attrOf = (block, tag, attr) => {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escapedTag}[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, "i"));
  return decodeEntities(match?.[1] || "");
};

const originalUrlFromBing = (value = "") => {
  try {
    const url = new URL(value);
    const target = url.searchParams.get("url");
    return target ? decodeEntities(target) : value;
  } catch {
    return value;
  }
};

const stripSourceFromTitle = (title, source) => {
  if (!source) return title;
  const suffix = ` - ${source}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
};

const tagArticle = (title, topic) => {
  const lower = title.toLowerCase();
  const tags = topic.keywords
    .filter((keyword) => lower.includes(keyword.toLowerCase()))
    .slice(0, 3);
  return tags.length ? tags : [topic.label];
};
const truncateChineseSummary = (value, maxLength = 96) => {
  const text = normalizeText(value).replace(/^[,，。；;：:\s]+/, "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/[，,；;：:\s]+$/, "")}...`;
};

const hasReadableChinese = (value = "") => {
  const chineseChars = value.match(/[\u4e00-\u9fff]/g)?.length || 0;
  return chineseChars >= 12;
};

const summarizeArticle = ({ description }) => {
  const cleanDescription = normalizeText(description);
  if (hasReadableChinese(cleanDescription)) {
    return truncateChineseSummary(cleanDescription);
  }

  return "";
};

const providerLabel = (provider) => ({
  google: "Google News",
  bing: "Bing News",
  "wired-ai": "WIRED",
  "lemonde-ai": "Le Monde",
  fixture: "Fixture",
})[provider] || provider;

const isoDate = (value) => {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const parseRssItems = (xml, topic, provider = "bing") => {
  let blocks = Array.from(xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi), (match) => ({ body: match[1], atom: false }));
  if (!blocks.length) {
    blocks = Array.from(xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi), (match) => ({ body: match[1], atom: true }));
  }

  return blocks.map(({ body: block, atom }) => {
    const source = textOf(block, "News:Source") || textOf(block, "source") || attrOf(block, "source", "url") || providerLabel(provider);
    const rawTitle = textOf(block, "title");
    const title = stripSourceFromTitle(rawTitle, source);
    const description = textOf(block, "description") || textOf(block, "summary") || textOf(block, "content");
    const publishedAt = isoDate(textOf(block, "pubDate") || textOf(block, "published") || textOf(block, "updated"));
    const rawUrl = atom ? attrOf(block, "link", "href") : textOf(block, "link");
    const url = provider === "bing" ? originalUrlFromBing(rawUrl) : rawUrl;
    const tags = tagArticle(`${title} ${description}`, topic);
    const candidateSummary = summarizeArticle({ description });
    // Google News descriptions repeat the linked headline; do not present them as article summaries.
    const summary = provider === "google" ? "" : candidateSummary;

    return {
      title,
      url,
      source,
      domain: source,
      publishedAt,
      summary,
      reason: summary,
      tags,
    };
  });
};

const buildBingUrl = (topic, query) => {
  const url = new URL(rssEndpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "rss");
  url.searchParams.set("mkt", topic.locale.mkt);
  url.searchParams.set("cc", topic.locale.cc);
  url.searchParams.set("setlang", topic.locale.setlang);
  return url;
};

const buildGoogleUrl = (topic, query) => {
  const url = new URL(googleNewsEndpoint);
  url.searchParams.set("q", `${query} when:2d`);
  url.searchParams.set("hl", "zh-CN");
  url.searchParams.set("gl", "CN");
  url.searchParams.set("ceid", "CN:zh-Hans");
  return url;
};

const fetchWithCurl = async (url) => {
  const binary = process.platform === "win32" ? "curl.exe" : "curl";
  const args = ["-L", "--fail", "--silent", "--show-error", "--max-time", "25"];
  if (process.platform === "win32") args.push("--ssl-no-revoke");
  args.push(url.toString());
  const { stdout } = await execFileAsync(
    binary,
    args,
    { maxBuffer: 1024 * 1024 * 8 },
  );
  return stdout;
};

const fetchWithNativeFetch = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "user-agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/126 Safari/537.36",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
};

const fetchText = async (url) => {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchWithCurl(url);
    } catch (error) {
      lastError = error;
    }

    try {
      return await fetchWithNativeFetch(url);
    } catch (error) {
      lastError = error;
      await delay(2500 * (attempt + 1));
    }
  }

  throw lastError || new Error("fetch failed");
};

const validateFeedXml = (xml, label = "feed") => {
  const text = String(xml || "").trim();
  const isFeed = /<(?:rss|feed)\b/i.test(text);
  const itemCount = (text.match(/<(?:item|entry)\b/gi) || []).length;
  if (!isFeed || itemCount === 0) {
    const looksLikeHtml = /<!doctype html|<html\b/i.test(text);
    throw new Error(`${label} returned ${looksLikeHtml ? "HTML" : "invalid XML"} with ${itemCount} items`);
  }
  return itemCount;
};

const readTopicFeeds = async (topic) => {
  if (process.env.NEWS_RSS_DIR) {
    const xml = await readFile(join(process.env.NEWS_RSS_DIR, `${topic.id}.xml`), "utf8");
    const itemCount = validateFeedXml(xml, `${topic.id}/fixture`);
    return {
      feeds: [{ provider: "fixture", xml }],
      providerStats: [{ provider: "fixture", ok: true, itemCount }],
    };
  }

  const searchSources = (topic.queries || []).flatMap((query, queryIndex) => [
    { provider: "google", label: `google-${queryIndex + 1}`, query, url: buildGoogleUrl(topic, query) },
    { provider: "bing", label: `bing-${queryIndex + 1}`, query, url: buildBingUrl(topic, query) },
  ]);
  const directSources = (topic.directFeeds || []).map((source) => ({
    ...source,
    label: source.provider,
    url: new URL(source.url),
  }));
  const sources = [...searchSources, ...directSources];
  const results = await Promise.allSettled(sources.map(async (source) => {
    const xml = await fetchText(source.url);
    const itemCount = validateFeedXml(xml, `${topic.label}/${source.label}`);
    return { provider: source.provider, label: source.label, query: source.query, xml, itemCount };
  }));

  const feeds = [];
  const providerStats = results.map((result, index) => {
    const source = sources[index];
    if (result.status === "fulfilled") {
      feeds.push(result.value);
      return { provider: source.label, ok: true, itemCount: result.value.itemCount };
    }
    const error = result.reason?.message || String(result.reason);
    console.warn(`${topic.label}/${source.label}: ${error}`);
    return { provider: source.label, ok: false, itemCount: 0, error };
  });

  if (!feeds.length) {
    const error = new Error("all RSS providers failed");
    error.providerStats = providerStats;
    throw error;
  }
  return { feeds, providerStats };
};
const scoreArticle = (article, topic) => {
  const haystack = `${article.title} ${article.source}`.toLowerCase();
  const keywordHits = topic.keywords.filter((keyword) => includesKeyword(haystack, keyword)).length;
  const ageHours = Math.max(0, (Date.now() - new Date(article.publishedAt).getTime()) / 36e5);
  return keywordHits * 4 + Math.max(0, 48 - ageHours) / 8;
};

const includesKeyword = (value, keyword) => {
  const haystack = String(value || "").toLowerCase();
  const needle = String(keyword || "").toLowerCase();
  if (!needle) return false;
  if (/^[a-z]{1,3}$/.test(needle)) {
    return new RegExp(`(^|[^a-z])${needle}([^a-z]|$)`, "i").test(haystack);
  }
  return haystack.includes(needle);
};

const canonicalUrl = (value = "") => {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
};

const selectArticles = (articles, topic) => {
  const seenUrls = new Set();
  const seenTitles = new Set();
  const seenSources = new Map();
  const seenSummaries = new Set();

  return articles
    .filter((article) => article.title && article.url)
    .filter((article) => topic.requiredKeywords.some((keyword) => includesKeyword(article.title, keyword)))
    .filter((article) => Date.now() - new Date(article.publishedAt).getTime() <= maxArticleAgeMs)
    .filter((article) => {
      const urlKey = canonicalUrl(article.url);
      const titleKey = article.title.toLowerCase();
      if (seenUrls.has(urlKey) || seenTitles.has(titleKey)) return false;
      seenUrls.add(urlKey);
      seenTitles.add(titleKey);
      return true;
    })
    .filter((article) => {
      if (!article.summary) return true;
      const summaryKey = article.summary.replace(/\s+/g, "").toLowerCase();
      if (seenSummaries.has(summaryKey)) return false;
      seenSummaries.add(summaryKey);
      return true;
    })
    .sort((a, b) => {
      const recencyDelta = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      if (Math.abs(recencyDelta) > 36e5) return recencyDelta;
      return scoreArticle(b, topic) - scoreArticle(a, topic);
    })
    .filter((article) => {
      const count = seenSources.get(article.source) || 0;
      if (count >= 2) return false;
      seenSources.set(article.source, count + 1);
      return true;
    })
    .slice(0, 6);
};

const parseJsonResponse = (value = "") => {
  const clean = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(clean);
};

const addChineseSummaries = async (items, topic) => {
  const token = process.env.GITHUB_TOKEN;
  const missing = items.map((item, index) => ({ item, index })).filter(({ item }) => !item.summary);
  if (!token || !missing.length) return items;

  const headlines = missing.map(({ item, index }) => ({ index, title: item.title, source: item.source }));
  try {
    const response = await fetch(githubModelsEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.NEWS_SUMMARY_MODEL || "openai/gpt-4o",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "你是中文新闻编辑。只根据标题中明确出现的信息写摘要，不猜测正文、不补充标题之外的事实。每条40到80个汉字，直接说明事件主体、动作和影响线索，避免套话。返回严格JSON数组，元素格式为{index,summary}。",
          },
          {
            role: "user",
            content: `主题：${topic.label}\n新闻：${JSON.stringify(headlines)}`,
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`GitHub Models HTTP ${response.status}`);
    const result = await response.json();
    const summaries = parseJsonResponse(result.choices?.[0]?.message?.content || "[]");
    for (const entry of summaries) {
      const item = items[Number(entry.index)];
      if (item && hasReadableChinese(entry.summary)) {
        item.summary = truncateChineseSummary(entry.summary);
        item.reason = item.summary;
      }
    }
  } catch (error) {
    console.warn(`${topic.label}/summary: ${error.message}`);
  }

  return items;
};

const readPrevious = async () => {
  try {
    return JSON.parse(await readFile(outputPath, "utf8"));
  } catch {
    return { topics: [] };
  }
};

const previousTopic = (previous, id) => previous.topics?.find((topic) => topic.id === id);

const fetchTopic = async (topic, previous) => {
  const attemptedAt = new Date().toISOString();
  let providerStats = [];
  let lastError = "";
  try {
    const result = await readTopicFeeds(topic);
    const { feeds } = result;
    providerStats = result.providerStats;
    const articles = feeds.flatMap(({ provider, xml }) => parseRssItems(xml, topic, provider));
    const fallback = previousTopic(previous, topic.id);
    const items = selectArticles([...articles, ...(fallback?.items || [])], topic);
    const liveUrls = new Set(articles.map((article) => canonicalUrl(article.url)));
    const liveItemCount = items.filter((item) => liveUrls.has(canonicalUrl(item.url))).length;
    if (!liveItemCount) throw new Error("feeds contained no matching fresh articles");
    const previousSummaries = new Map(
      (fallback?.items || [])
        .filter((item) => item.summary)
        .map((item) => [canonicalUrl(item.url), item.summary]),
    );
    for (const item of items) {
      const savedSummary = previousSummaries.get(canonicalUrl(item.url));
      if (savedSummary) {
        item.summary = savedSummary;
        item.reason = savedSummary;
      }
    }
    await addChineseSummaries(items, topic);
    if (items.length) {
      const latestPublishedAt = items
        .map((item) => item.publishedAt)
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a))[0] || "";
      const stale = !latestPublishedAt || Date.now() - new Date(latestPublishedAt).getTime() > freshArticleAgeMs;
      console.log(`${topic.label}: ${items.length} articles (${liveItemCount} from this run)`);
      return {
        id: topic.id,
        label: topic.label,
        description: topic.description,
        items,
        stale,
        attemptedAt,
        lastSuccessfulAt: attemptedAt,
        latestPublishedAt,
        liveItemCount,
        providerStats,
      };
    }

    console.warn(`${topic.label}: no fresh articles, keeping previous data if available`);
  } catch (error) {
    if (Array.isArray(error.providerStats)) providerStats = error.providerStats;
    lastError = error.message;
    console.warn(`${topic.label}: ${lastError}`);
  }

  const fallback = previousTopic(previous, topic.id);
  return {
    id: topic.id,
    label: topic.label,
    description: topic.description,
    items: fallback?.items || [],
    stale: true,
    attemptedAt,
    lastSuccessfulAt: fallback?.lastSuccessfulAt || previous.generatedAt || "",
    latestPublishedAt: fallback?.latestPublishedAt || fallback?.items?.[0]?.publishedAt || "",
    liveItemCount: 0,
    providerStats,
    error: lastError || "no matching fresh articles",
  };
};

const main = async () => {
  const previous = await readPrevious();
  const nextTopics = [];

  for (const topic of topics) {
    nextTopics.push(await fetchTopic(topic, previous));
    await delay(1200);
  }

  const topicSignature = (value) => JSON.stringify(
    value.map((topic) => topic.items.map(({ title, url, publishedAt, summary }) => ({ title, url, publishedAt, summary }))),
  );
  const contentChanged = topicSignature(nextTopics) !== topicSignature(previous.topics || []);
  const generatedAt = new Date().toISOString();
  const staleTopics = nextTopics.filter((topic) => topic.stale).map((topic) => topic.id);
  const sourceErrors = nextTopics.reduce(
    (total, topic) => total + (topic.providerStats || []).filter((provider) => !provider.ok).length,
    0,
  );

  const contentUpdatedAt = contentChanged ? generatedAt : (previous.contentUpdatedAt || previous.generatedAt || generatedAt);
  const payload = {
    generatedAt,
    checkedAt: generatedAt,
    contentUpdatedAt,
    source: "Google News RSS + WIRED AI RSS + Le Monde AI RSS（Bing 仅作可用性探测）",
    status: {
      contentChanged,
      freshTopics: nextTopics.length - staleTopics.length,
      staleTopics,
      sourceErrors,
    },
    topics: nextTopics,
    history: buildNewsHistory(previous, {
      checkedAt: generatedAt,
      contentUpdatedAt,
      topics: nextTopics,
    }, generatedAt),
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath}; content ${contentChanged ? "changed" : "unchanged"}; ${staleTopics.length} stale topics`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  buildBingUrl,
  buildGoogleUrl,
  buildNewsHistory,
  fetchTopic,
  includesKeyword,
  newsDateKey,
  parseRssItems,
  selectArticles,
  validateFeedXml,
};
