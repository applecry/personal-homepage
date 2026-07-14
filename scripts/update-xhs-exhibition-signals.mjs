import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const outputPath = fileURLToPath(new URL("../data/exhibition-signals.json", import.meta.url));
const query = process.env.XHS_EXHIBITION_QUERY || "上海展览";
const limit = Math.min(Math.max(Number(process.env.XHS_EXHIBITION_LIMIT) || 12, 1), 20);

const defaultOpenCliEntry = process.platform === "win32"
  ? path.join(process.env.APPDATA || "", "npm", "node_modules", "@jackwener", "opencli", "dist", "src", "main.js")
  : null;

const parseOpenCliJson = (value) => {
  const parsed = JSON.parse(value);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.data)) return parsed.data;
  if (Array.isArray(parsed?.items)) return parsed.items;
  throw new Error("OpenCLI did not return a result array");
};

const normalizeXhsUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.hostname === "www.xiaohongshu.com" ? url.toString() : "";
  } catch {
    return "";
  }
};

const normalizeSignal = (item, index) => ({
  rank: Number(item.rank) || index + 1,
  title: String(item.title || "").trim(),
  author: String(item.author || "").trim(),
  likes: Number(String(item.likes || "0").replace(/[^\d]/g, "")) || 0,
  publishedAt: String(item.published_at || item.publishedAt || "").trim(),
  url: normalizeXhsUrl(item.url),
});

const uniqueSignals = (items) => {
  const seen = new Set();
  return items
    .map(normalizeSignal)
    .filter((item) => item.title && item.url)
    .filter((item) => {
      const key = item.url.split("?")[0] || item.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const collect = async () => {
  const customBin = process.env.OPENCLI_BIN;
  if (defaultOpenCliEntry && !customBin) await access(defaultOpenCliEntry);

  const openCliArgs = [
    "xiaohongshu", "search", query,
    "--limit", String(limit),
    "--window", "foreground",
    "--site-session", "persistent",
    "-f", "json",
  ];
  const command = customBin || (defaultOpenCliEntry ? process.execPath : "opencli");
  const args = customBin || !defaultOpenCliEntry ? openCliArgs : [defaultOpenCliEntry, ...openCliArgs];
  const { stdout } = await execFileAsync(command, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 4,
    timeout: 60000,
  });
  return uniqueSignals(parseOpenCliJson(stdout)).slice(0, limit);
};

const main = async () => {
  const previous = await readFile(outputPath, "utf8").then(JSON.parse).catch(() => null);
  try {
    const items = await collect();
    if (!items.length) throw new Error("No Xiaohongshu exhibition signals returned");
    const payload = {
      updatedAt: new Date().toISOString(),
      platform: "小红书",
      query,
      role: "社交热度与展览发现线索，不作为日期、票价或场馆信息的事实来源",
      items,
    };
    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`Wrote ${items.length} Xiaohongshu exhibition signals`);
  } catch (error) {
    if (previous?.items?.length) {
      console.warn(`Xiaohongshu update failed; keeping ${previous.items.length} previous signals: ${error.message}`);
      return;
    }
    throw error;
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { normalizeSignal, normalizeXhsUrl, parseOpenCliJson, uniqueSignals };
