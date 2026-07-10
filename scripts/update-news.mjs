import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const outputPath = fileURLToPath(new URL("../data/news.json", import.meta.url));
const rssEndpoint = "https://www.bing.com/news/search";

const topics = [
  {
    id: "ai",
    label: "AI",
    description: "模型、产品、监管与资本动向",
    query: 'OpenAI AI Nvidia',
    locale: { mkt: "zh-CN", cc: "CN", setlang: "zh-Hans" },
    keywords: ["OpenAI", "Anthropic", "Nvidia", "人工智能", "大模型", "生成式AI", "AI", "model"],
  },
  {
    id: "us-stocks",
    label: "美股",
    description: "美股指数、科技股、财报与宏观信号",
    query: 'US stocks Nasdaq S&P 500 Nvidia Tesla Fed',
    locale: { mkt: "en-US", cc: "US", setlang: "en-US" },
    keywords: ["Nasdaq", "S&P", "Wall Street", "Nvidia", "Tesla", "Apple", "Fed", "美股", "纳斯达克"],
  },
  {
    id: "a-shares",
    label: "A股",
    description: "A股市场、政策、行业板块与资金面",
    query: 'China stocks A shares Shanghai Composite CSI 300',
    locale: { mkt: "zh-CN", cc: "CN", setlang: "zh-Hans" },
    keywords: ["A股", "沪深", "上证", "创业板", "北向资金", "China", "Chinese stocks"],
  },
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  return chineseChars >= 16;
};

const summarizeAiArticle = (text) => {
  if (/browser|atlas|浏览器/i.test(text)) {
    return "报道关注 OpenAI 在 AI 浏览器和应用入口上的产品调整，反映大模型公司正在把竞争延伸到日常工作流。";
  }

  if (/agent|work|codex|workflow|自动化/i.test(text)) {
    return "报道围绕 AI Agent 和办公自动化工具展开，重点是模型如何进入文档、代码和业务流程等高频场景。";
  }

  if (/chip|cpu|gpu|nvidia|broadcom|cerebras|hardware|infrastructure|芯片|算力/i.test(text)) {
    return "报道讨论 AI 芯片和算力基础设施的竞争，关注 OpenAI、Nvidia 等公司在硬件供应链和成本效率上的布局。";
  }

  if (/gpt|model|claude|anthropic|benchmark|coding|模型|性能/i.test(text)) {
    return "报道介绍新一代 AI 模型进展，重点关注性能、成本、编码能力以及与竞品模型的对比。";
  }

  return "报道关注 AI 行业的新产品、公司动向或基础设施变化，大模型竞争正在从模型本身扩展到应用和算力层。";
};

const summarizeUsStocksArticle = (text) => {
  if (/jobs|payroll|fed|rate|yield|treasury|inflation|就业|美联储|利率/i.test(text)) {
    return "报道关注美国宏观数据、利率预期和美联储政策路径对美股风险偏好的影响，宏观数据仍是指数波动的重要变量。";
  }

  if (/chip|semiconductor|nvidia|micron|tech|ai|科技|芯片/i.test(text)) {
    return "报道聚焦科技股和芯片股表现，AI 相关交易继续影响纳指和标普等主要指数。";
  }

  if (/nasdaq|s&p|dow|futures|market|stocks|指数|期货/i.test(text)) {
    return "报道梳理纳指、标普和道指等主要美股指数走势，反映市场对风险资产和大型科技股的定价变化。";
  }

  return "报道反映美股市场的最新交易情绪，指数方向、科技权重股和宏观预期是主要变量。";
};

const summarizeASharesArticle = (text) => {
  if (/factory|manufacturing|pmi|exports|demand|经济|制造业|出口/i.test(text)) {
    return "报道关注中国制造业、出口需求和经济数据对股票市场的影响，基本面预期仍是市场走势的重要线索。";
  }

  if (/chip|tech|semiconductor|ai|科技|芯片|半导体/i.test(text)) {
    return "报道提到科技或芯片板块对中国股票的带动或拖累，结构性行情仍围绕高景气产业波动。";
  }

  if (/shanghai|composite|csi|a-shares|china stocks|hong kong|上证|沪深|创业板|港股/i.test(text)) {
    return "报道聚焦中国股票和主要指数表现，上证、沪深和相关市场情绪出现短期变化。";
  }

  return "报道反映中国股票市场的最新表现，资金面、政策预期和行业轮动是主要线索。";
};

const summarizeArticle = ({ title, description, topic }) => {
  const cleanDescription = normalizeText(description);
  if (hasReadableChinese(cleanDescription)) {
    return truncateChineseSummary(cleanDescription);
  }

  const text = `${title} ${cleanDescription}`;
  if (topic.id === "ai") return summarizeAiArticle(text);
  if (topic.id === "us-stocks") return summarizeUsStocksArticle(text);
  if (topic.id === "a-shares") return summarizeASharesArticle(text);

  return "报道提供了该主题的最新动态，适合进一步打开原文了解细节。";
};

const parseRssItems = (xml, topic) => {
  const blocks = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi), (match) => match[1]);

  return blocks.map((block) => {
    const source = textOf(block, "News:Source") || textOf(block, "source") || attrOf(block, "source", "url") || "Bing News";
    const rawTitle = textOf(block, "title");
    const title = stripSourceFromTitle(rawTitle, source);
    const description = textOf(block, "description");
    const publishedAt = new Date(textOf(block, "pubDate") || Date.now()).toISOString();
    const url = originalUrlFromBing(textOf(block, "link"));
    const tags = tagArticle(`${title} ${description}`, topic);
    const summary = summarizeArticle({ title, description, topic });

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

const buildUrl = (topic) => {
  const url = new URL(rssEndpoint);
  url.searchParams.set("q", topic.query);
  url.searchParams.set("format", "rss");
  return url;
};

const fetchWithCurl = async (url) => {
  const binary = process.platform === "win32" ? "curl.exe" : "curl";
  const { stdout } = await execFileAsync(
    binary,
    ["-L", "--fail", "--silent", "--show-error", "--max-time", "25", url.toString()],
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

const readTopicText = async (topic) => {
  if (process.env.NEWS_RSS_DIR) {
    return readFile(join(process.env.NEWS_RSS_DIR, `${topic.id}.xml`), "utf8");
  }

  return fetchText(buildUrl(topic));
};
const scoreArticle = (article, topic) => {
  const haystack = `${article.title} ${article.source}`.toLowerCase();
  const keywordHits = topic.keywords.filter((keyword) => haystack.includes(keyword.toLowerCase())).length;
  const ageHours = Math.max(0, (Date.now() - new Date(article.publishedAt).getTime()) / 36e5);
  return keywordHits * 4 + Math.max(0, 48 - ageHours) / 8;
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

  return articles
    .filter((article) => article.title && article.url)
    .filter((article) => Date.now() - new Date(article.publishedAt).getTime() <= 45 * 24 * 60 * 60 * 1000)
    .filter((article) => {
      const urlKey = canonicalUrl(article.url);
      const titleKey = article.title.toLowerCase();
      if (seenUrls.has(urlKey) || seenTitles.has(titleKey)) return false;
      seenUrls.add(urlKey);
      seenTitles.add(titleKey);
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

const readPrevious = async () => {
  try {
    return JSON.parse(await readFile(outputPath, "utf8"));
  } catch {
    return { topics: [] };
  }
};

const previousTopic = (previous, id) => previous.topics?.find((topic) => topic.id === id);

const fetchTopic = async (topic, previous) => {
  try {
    const xml = await readTopicText(topic);
    const items = selectArticles(parseRssItems(xml, topic), topic);
    if (items.length) {
      console.log(`${topic.label}: ${items.length} articles`);
      return { id: topic.id, label: topic.label, description: topic.description, items };
    }

    console.warn(`${topic.label}: no fresh articles, keeping previous data if available`);
  } catch (error) {
    console.warn(`${topic.label}: ${error.message}`);
  }

  const fallback = previousTopic(previous, topic.id);
  return {
    id: topic.id,
    label: topic.label,
    description: topic.description,
    items: fallback?.items || [],
    stale: Boolean(fallback?.items?.length),
  };
};

const main = async () => {
  const previous = await readPrevious();
  const nextTopics = [];

  for (const topic of topics) {
    nextTopics.push(await fetchTopic(topic, previous));
    await delay(1200);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "Bing News RSS",
    topics: nextTopics,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});