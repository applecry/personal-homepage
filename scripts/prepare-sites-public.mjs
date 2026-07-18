import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publicDirectory = resolve(root, "public");
const files = [
  "_headers",
  "index.html",
  "projects.html",
  "styles.css",
  "script.js",
  "page-agent.css",
  "page-agent-knowledge.js",
  "conventions.html",
  "conventions.css",
  "conventions.js",
  "conventions-core.js",
  "exhibitions.html",
  "exhibitions.css",
  "exhibitions.js",
  "exhibitions-core.js",
];
const directories = [
  "assets",
  "data",
  "notes",
  "after-market-closes",
  "understand-everything",
];

await rm(publicDirectory, { recursive: true, force: true });
await mkdir(publicDirectory, { recursive: true });
for (const file of files) {
  await cp(resolve(root, file), resolve(publicDirectory, file));
}
for (const directory of directories) {
  await cp(resolve(root, directory), resolve(publicDirectory, directory), { recursive: true });
}
