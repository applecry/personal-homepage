import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../page-agent-knowledge.js", import.meta.url), "utf8");
const sandbox = {};
vm.runInNewContext(source, sandbox, { filename: "page-agent-knowledge.js" });
const knowledge = sandbox.ApplecryPageAgentKnowledge;

test("exports stable system instructions", () => {
  assert.ok(knowledge);
  assert.match(knowledge.version, /^\d{4}\.\d{2}\.\d{2}-\d+$/);
  assert.match(knowledge.system, /不需要重新猜测这个系统的用途/);
  assert.match(knowledge.system, /小红书/);
});

test("covers every PageAgent product page", () => {
  for (const pageId of ["home", "exhibitions", "conventions", "projects", "notes"]) {
    const page = knowledge.pages[pageId];
    assert.ok(page, `missing ${pageId}`);
    assert.ok(page.name);
    assert.ok(page.purpose);
    assert.ok(page.capabilities.length > 0);
    assert.ok(page.rules.length > 0);
    assert.ok(page.diagnostics.length > 0);
  }
});

test("defines URL routing for fixed and article pages", () => {
  assert.ok(knowledge.pages.home.paths.includes("index.html"));
  assert.ok(knowledge.pages.exhibitions.paths.includes("exhibitions.html"));
  assert.ok(knowledge.pages.conventions.paths.includes("conventions.html"));
  assert.ok(knowledge.pages.notes.prefixes.includes("/notes/"));
});
