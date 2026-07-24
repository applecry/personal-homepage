import { execFile } from "node:child_process";
import { access, readFile, rename, unlink, writeFile } from "node:fs/promises";
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

const writeJsonAtomically = async (targetPath, payload) => {
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
};

const updateSignals = async (options = {}) => {
  const targetPath = options.outputPath || outputPath;
  const collectSignals = options.collectSignals || collect;
  const now = options.now || (() => new Date());
  const previous = await readFile(targetPath, "utf8").then(JSON.parse).catch(() => null);
  try {
    const items = await collectSignals();
    if (!items.length) throw new Error("No Xiaohongshu exhibition signals returned");
    const payload = {
      updatedAt: now().toISOString(),
      platform: "小红书",
      query,
      role: "社交热度与展览发现线索，不作为日期、票价或场馆信息的事实来源",
      items,
    };
    await writeJsonAtomically(targetPath, payload);
    return { count: items.length, updatedAt: payload.updatedAt, outputPath: targetPath };
  } catch (error) {
    if (previous?.items?.length) {
      error.preserved = true;
      error.preservedCount = previous.items.length;
    }
    throw error;
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  updateSignals().then((result) => {
    console.log(`Wrote ${result.count} Xiaohongshu exhibition signals`);
  }).catch((error) => {
    console.error(error.preserved
      ? `Xiaohongshu update failed; kept ${error.preservedCount} previous signals: ${error.message}`
      : error);
    process.exitCode = 1;
  });
}

export { collect, normalizeSignal, normalizeXhsUrl, parseOpenCliJson, uniqueSignals, updateSignals, writeJsonAtomically };
