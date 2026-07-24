import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { updateSignals } from "./update-xhs-exhibition-signals.mjs";

const projectRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const port = Math.min(Math.max(Number(process.env.EXHIBIT_ATLAS_PORT) || 4173, 1024), 65535);
const localHeader = "x-exhibit-atlas-local";
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

const normalizedHostname = (value) => {
  try {
    return new URL(`http://${value}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return "";
  }
};

const isLoopbackHostname = (value) => ["localhost", "127.0.0.1", "::1"].includes(
  String(value || "").replace(/^\[|\]$/g, "").toLowerCase(),
);

const isAllowedRefreshRequest = (request, serverPort = port) => {
  if (request.method !== "POST" || request.headers[localHeader] !== "refresh") return false;
  if (!isLoopbackHostname(normalizedHostname(request.headers.host))) return false;
  try {
    const origin = new URL(String(request.headers.origin || ""));
    return isLoopbackHostname(origin.hostname) && origin.port === String(serverPort);
  } catch {
    return false;
  }
};

const jsonResponse = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(`${JSON.stringify(payload)}\n`);
};

const readSmallBody = (request) => new Promise((resolve, reject) => {
  let size = 0;
  request.on("data", (chunk) => {
    size += chunk.length;
    if (size > 1024) reject(new Error("Request body is too large"));
  });
  request.on("end", resolve);
  request.on("error", reject);
});

const publicRefreshError = (error) => {
  if (/AUTH_REQUIRED|login|登录/i.test(error?.message || "")) {
    return "未检测到可用的小红书登录态，请在 Chrome/Edge 登录后重试";
  }
  if (/ENOENT|opencli/i.test(error?.message || "")) {
    return "未检测到 OpenCLI，请先安装扩展并保持浏览器窗口开启";
  }
  if (/timed out|timeout/i.test(error?.message || "")) {
    return "小红书请求超时，旧线索已保留，请稍后重试";
  }
  return "刷新失败，旧线索已保留；请检查本机 OpenCLI 与小红书登录态";
};

let refreshInFlight = null;

const resolveStaticPath = (pathname, rootPath = projectRoot) => {
  const normalizedRoot = path.resolve(rootPath);
  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
  const targetPath = path.resolve(normalizedRoot, relativePath);
  return targetPath.startsWith(`${normalizedRoot}${path.sep}`) ? targetPath : "";
};

const serveStatic = async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
  const targetPath = resolveStaticPath(requestUrl.pathname);
  if (!targetPath) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  const fileStats = await stat(targetPath).catch(() => null);
  if (!fileStats?.isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }
  const content = await readFile(targetPath);
  response.writeHead(200, {
    "Cache-Control": path.extname(targetPath) === ".json" ? "no-store" : "no-cache",
    "Content-Type": contentTypes.get(path.extname(targetPath).toLowerCase()) || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(request.method === "HEAD" ? undefined : content);
};

const handleRequest = async (request, response) => {
  if (request.url === "/__local/xhs-refresh") {
    if (!isAllowedRefreshRequest(request)) {
      jsonResponse(response, 403, { error: "本地刷新请求校验失败" });
      return;
    }
    if (refreshInFlight) {
      jsonResponse(response, 409, { error: "刷新正在进行，请勿重复提交" });
      return;
    }
    try {
      await readSmallBody(request);
      refreshInFlight = updateSignals();
      const result = await refreshInFlight;
      jsonResponse(response, 200, { ok: true, count: result.count, updatedAt: result.updatedAt });
    } catch (error) {
      console.error(`[local refresh] ${error?.stack || error}`);
      jsonResponse(response, 503, { ok: false, preserved: Boolean(error?.preserved), error: publicRefreshError(error) });
    } finally {
      refreshInFlight = null;
    }
    return;
  }

  if (!["GET", "HEAD"].includes(request.method || "")) {
    response.writeHead(405, { Allow: "GET, HEAD, POST" }).end("Method not allowed");
    return;
  }
  try {
    await serveStatic(request, response);
  } catch (error) {
    console.error(`[local server] ${error?.stack || error}`);
    response.writeHead(500).end("Local preview error");
  }
};

const startLocalServer = () => {
  const server = createServer(handleRequest);
  server.listen(port, "127.0.0.1", () => {
    console.log(`Exhibit Atlas local preview: http://127.0.0.1:${port}/exhibitions.html`);
    console.log("The refresh endpoint is bound to this computer only.");
  });
  return server;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) startLocalServer();

export { isAllowedRefreshRequest, isLoopbackHostname, normalizedHostname, publicRefreshError, resolveStaticPath, startLocalServer };
