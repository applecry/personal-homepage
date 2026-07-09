const root = document.documentElement;
const header = document.querySelector("[data-header]");
const toggle = document.querySelector("[data-theme-toggle]");
const navLinks = Array.from(document.querySelectorAll(".nav a"));
const sections = navLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

const savedTheme = localStorage.getItem("homepage-theme");
if (savedTheme) {
  root.dataset.theme = savedTheme;
}

const syncHeader = () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 24);
};

const syncActiveLink = () => {
  const current = sections
    .filter((section) => section.getBoundingClientRect().top < 180)
    .pop();

  navLinks.forEach((link) => {
    link.classList.toggle("is-active", current && link.getAttribute("href") === `#${current.id}`);
  });
};

toggle?.addEventListener("click", () => {
  const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = nextTheme;
  localStorage.setItem("homepage-theme", nextTheme);
});

window.addEventListener("scroll", () => {
  syncHeader();
  syncActiveLink();
});

syncHeader();
syncActiveLink();

const agentWake = document.querySelector("[data-agent-wake]");
const agentStatus = document.querySelector("[data-agent-status]");
const pageAgentScriptSources = [
  "./assets/vendor/page-agent.demo.js?autoInit=false",
  "https://cdn.jsdelivr.net/npm/page-agent@1.11.0/dist/iife/page-agent.demo.js?autoInit=false",
  "https://registry.npmmirror.com/page-agent/1.11.0/files/dist/iife/page-agent.demo.js?autoInit=false",
];
let pageAgentScriptPromise = null;
let agentStatusTimer = null;

const pageAgentConfig = {
  model: "qwen3.5-plus",
  baseURL: "https://page-ag-testing-ohftxirgbn.cn-shanghai.fcapp.run",
  apiKey: "NA",
  language: "zh-CN",
  promptForNextTask: true,
  transformPageContent: async (content) => {
    return content
      .replace(/\b(1[3-9]\d)(\d{4})(\d{4})\b/g, "$1****$3")
      .replace(/\b([a-zA-Z0-9._%+-])[^@\s]*(@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g, "$1***$2")
      .replace(/\b(\d{4})\d{8,11}(\d{4})\b/g, "$1********$2");
  },
};

const setAgentStatus = (message, mode = "") => {
  if (!agentStatus) return;
  agentStatus.textContent = message;
  agentStatus.classList.add("is-visible");

  window.clearTimeout(agentStatusTimer);
  agentStatusTimer = window.setTimeout(() => {
    agentStatus.classList.remove("is-visible");
  }, mode === "error" ? 5200 : 2200);
};

const setAgentButtonState = (state) => {
  if (!agentWake) return;
  agentWake.classList.remove("is-loading", "is-ready", "is-error");
  if (state) {
    agentWake.classList.add(`is-${state}`);
  }
};

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const existing = Array.from(document.scripts).find((script) => script.src === new URL(src, location.href).href);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      if (window.PageAgent) resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

const loadPageAgentScript = async () => {
  if (window.PageAgent) return;

  if (pageAgentScriptPromise) {
    return pageAgentScriptPromise;
  }

  pageAgentScriptPromise = (async () => {
    let lastError = null;

    for (const source of pageAgentScriptSources) {
      try {
        await loadScript(source);
        if (window.PageAgent) return;
      } catch (error) {
        lastError = error;
      }
    }

    pageAgentScriptPromise = null;
    throw lastError || new Error("PageAgent script failed to load");
  })();

  return pageAgentScriptPromise;
};

const getPanelWrapper = (agent) => {
  try {
    return agent?.panel?.wrapper || null;
  } catch (error) {
    return null;
  }
};

const createOrReusePageAgent = () => {
  if (!window.PageAgent) {
    return null;
  }

  const existingWrapper = getPanelWrapper(window.pageAgent);
  if (window.pageAgent && existingWrapper && document.body.contains(existingWrapper)) {
    return window.pageAgent;
  }

  try {
    window.pageAgent?.dispose?.();
  } catch (error) {
    // A disposed panel can be safely recreated below.
  }

  window.pageAgent = new window.PageAgent(pageAgentConfig);
  return window.pageAgent;
};

const preloadPageAgent = async () => {
  if (!agentWake) return;
  setAgentButtonState("loading");

  try {
    await loadPageAgentScript();
    setAgentButtonState("ready");
    setAgentStatus("PageAgent 已就绪");
  } catch (error) {
    setAgentButtonState("error");
    setAgentStatus("PageAgent 加载失败", "error");
    console.error(error);
  }
};

agentWake?.addEventListener("click", async () => {
  setAgentButtonState(window.PageAgent ? "ready" : "loading");
  setAgentStatus(window.PageAgent ? "正在打开 PageAgent" : "PageAgent 加载中");

  try {
    await loadPageAgentScript();
    const agent = createOrReusePageAgent();
    if (!agent) {
      throw new Error("PageAgent is unavailable");
    }

    agent.panel.show();
    setAgentButtonState("ready");
    setAgentStatus("PageAgent 已打开");
  } catch (error) {
    setAgentButtonState("error");
    setAgentStatus("PageAgent 暂时不可用", "error");
    console.error(error);
  }
});

window.addEventListener("load", () => {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(preloadPageAgent, { timeout: 1800 });
  } else {
    window.setTimeout(preloadPageAgent, 600);
  }
});