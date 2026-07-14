import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const newsPath = fileURLToPath(new URL("../data/news.json", import.meta.url));
const data = JSON.parse(await readFile(newsPath, "utf8"));
const checkedAt = new Date(data.checkedAt || data.generatedAt);
const ai = data.topics?.find((topic) => topic.id === "ai");
const problems = [];

if (Number.isNaN(checkedAt.getTime()) || Date.now() - checkedAt.getTime() > 30 * 60 * 1000) {
  problems.push("news.json was not checked during this workflow run");
}
if (!ai?.items?.length) problems.push("AI topic has no articles");
if (ai?.stale) problems.push(`AI topic is stale: ${ai.error || "no fresh article"}`);
if (!Number.isFinite(ai?.liveItemCount) || ai.liveItemCount < 1) problems.push("AI topic has no article selected from this run");

if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`AI news is fresh; ${ai.liveItemCount} selected articles came from this run.`);
}
