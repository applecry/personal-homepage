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
  header.classList.toggle("is-scrolled", window.scrollY > 24);
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
const pageAgentScriptSrc = "./assets/vendor/page-agent.demo.js?autoInit=false";
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
  }, mode === "error" ? 5200 : 2600);
};

const setAgentButtonState = (state) => {
  if (!agentWake) return;
  agentWake.classList.remove("is-loading", "is-ready", "is-error");
  if (state) {
    agentWake.classList.add(`is-${state}`);
  }
};

const loadPageAgentScript = () => {
  if (window.PageAgent) {
    return Promise.resolve();
  }

  if (pageAgentScriptPromise) {
    return pageAgentScriptPromise;
  }

  pageAgentScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = pageAgentScriptSrc;
    script.async = true;
    script.onload = () => {
      setAgentButtonState("ready");
      setAgentStatus("PageAgent 已加载");
      resolve();
    };
    script.onerror = () => {
      pageAgentScriptPromise = null;
      reject(new Error("PageAgent script failed to load"));
    };
    document.head.appendChild(script);
  });

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

agentWake?.addEventListener("click", async () => {
  setAgentButtonState("loading");
  setAgentStatus("PageAgent 加载中");

  try {
    await loadPageAgentScript();
    const agent = createOrReusePageAgent();
    if (!agent) {
      throw new Error("PageAgent is unavailable");
    }

    agent.panel.show();
    setAgentButtonState("ready");
    setAgentStatus("PageAgent 已唤醒");
  } catch (error) {
    setAgentButtonState("error");
    setAgentStatus("PageAgent 暂时不可用", "error");
    console.error(error);
  }
});
