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

const hero = document.querySelector(".hero");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
if (hero && !reduceMotion.matches) {
  let pointerX = 0;
  let pointerY = 0;
  let currentX = 0;
  let currentY = 0;
  let scrollOffset = 0;
  let heroVisible = true;
  let frame = 0;

  const updateScrollOffset = () => {
    const rect = hero.getBoundingClientRect();
    scrollOffset = Math.max(-18, Math.min(18, -rect.top * 0.055));
  };

  hero.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const rect = hero.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    pointerX = (0.5 - x) * 18;
    pointerY = (0.5 - y) * 12;
    hero.style.setProperty("--hero-light-x", `${Math.round(x * 100)}%`);
    hero.style.setProperty("--hero-light-y", `${Math.round(y * 100)}%`);
  });

  hero.addEventListener("pointerleave", () => {
    pointerX = 0;
    pointerY = 0;
    hero.style.setProperty("--hero-light-x", "68%");
    hero.style.setProperty("--hero-light-y", "38%");
  });

  const observer = new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
  });
  observer.observe(hero);

  const renderHeroMotion = (time) => {
    if (heroVisible) {
      const ambientX = Math.sin(time / 6200) * 2.4;
      const ambientY = Math.cos(time / 7600) * 1.8;
      currentX += (pointerX + ambientX - currentX) * 0.045;
      currentY += (pointerY + scrollOffset + ambientY - currentY) * 0.045;
      hero.style.setProperty("--hero-pan-x", `${currentX.toFixed(2)}px`);
      hero.style.setProperty("--hero-pan-y", `${currentY.toFixed(2)}px`);
    }
    frame = requestAnimationFrame(renderHeroMotion);
  };

  window.addEventListener("scroll", updateScrollOffset, { passive: true });
  updateScrollOffset();
  frame = requestAnimationFrame(renderHeroMotion);

  reduceMotion.addEventListener("change", (event) => {
    if (!event.matches) return;
    cancelAnimationFrame(frame);
    observer.disconnect();
    hero.style.removeProperty("--hero-pan-x");
    hero.style.removeProperty("--hero-pan-y");
  }, { once: true });
}

const newsSection = document.querySelector("[data-news-section]");
if (newsSection) {
  const grid = newsSection.querySelector("[data-news-grid]");
  const updated = newsSection.querySelector("[data-news-updated]");
  const tabs = Array.from(newsSection.querySelectorAll("[data-news-topic]"));
  const history = newsSection.querySelector("[data-news-history]");
  const historyList = newsSection.querySelector("[data-news-history-list]");
  let activeTopic = tabs.find((tab) => tab.classList.contains("is-active"))?.dataset.newsTopic || "ai";
  let newsTopics = [];
  let newsSnapshots = [];
  let activeNewsDate = "";
  let newsPayload = null;
  let newsRequestId = 0;

  const formatNewsTime = (value) => {
    if (!value) return "等待首次自动更新";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "等待首次自动更新";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Shanghai",
    }).format(date);
  };

  const newsDateKey = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const part = (type) => parts.find((entry) => entry.type === type)?.value || "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  };

  const formatNewsDate = (value) => {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return value || "今日";
    return value === newsDateKey(new Date()) ? "今天" : `${match[2]}.${match[3]}`;
  };

  const normalizeTopics = (topics) => (Array.isArray(topics) ? topics : [])
    .filter((topic) => topic && typeof topic === "object")
    .map((topic) => ({ ...topic, items: Array.isArray(topic.items) ? topic.items : [] }));

  const renderNewsEmpty = (message = "今天还没有抓到足够清晰的信号。") => {
    grid.textContent = "";
    const empty = document.createElement("div");
    empty.className = "news-empty";
    const title = document.createElement("strong");
    title.textContent = "新闻数据准备中";
    const copy = document.createElement("span");
    copy.textContent = message;
    empty.append(title, copy);
    grid.append(empty);
  };

  const createNewsCard = (item, index) => {
    const card = document.createElement("article");
    card.className = "news-card";

    const header = document.createElement("header");
    const number = document.createElement("span");
    number.className = "news-card-index";
    number.textContent = String(index + 1).padStart(2, "0");
    const time = document.createElement("time");
    time.dateTime = item.publishedAt || "";
    time.textContent = formatNewsTime(item.publishedAt);
    header.append(number, time);

    const title = document.createElement("h3");
    const link = document.createElement("a");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = item.title || "Untitled";
    title.append(link);

    const reason = document.createElement("p");
    reason.textContent = item.summary || item.reason || "暂无摘要，打开原文查看详情。";

    const footer = document.createElement("footer");
    const source = document.createElement("span");
    source.className = "news-source";
    source.textContent = item.source || item.domain || "source";
    const tags = document.createElement("div");
    tags.className = "news-tags";
    (Array.isArray(item.tags) ? item.tags : []).slice(0, 3).forEach((tag) => {
      const pill = document.createElement("span");
      pill.textContent = tag;
      tags.append(pill);
    });
    footer.append(source, tags);

    card.append(header, title, reason, footer);
    return card;
  };

  const renderNewsHistory = () => {
    if (!history || !historyList) return;
    history.hidden = !newsSnapshots.length;
    historyList.textContent = "";
    newsSnapshots.forEach((snapshot) => {
      const button = document.createElement("button");
      const isActive = snapshot.date === activeNewsDate;
      button.className = `news-history-button${isActive ? " is-active" : ""}`;
      button.type = "button";
      button.textContent = formatNewsDate(snapshot.date);
      button.title = snapshot.date;
      button.setAttribute("aria-pressed", String(isActive));
      button.addEventListener("click", () => {
        activeNewsDate = snapshot.date;
        newsTopics = snapshot.topics;
        renderNewsTopic();
      });
      historyList.append(button);
    });
  };

  const renderNewsStatus = (topic, snapshot) => {
    if (!newsPayload) return;
    const checkedAt = snapshot?.checkedAt || newsPayload.checkedAt || newsPayload.generatedAt;
    const latestAt = topic?.latestPublishedAt || topic?.items?.[0]?.publishedAt;
    const isLatest = snapshot?.date === newsSnapshots[0]?.date;
    const prefix = isLatest ? `检查 ${formatNewsTime(checkedAt)}` : `历史 ${snapshot?.date || ""}`;
    if (topic?.stale) {
      updated.textContent = `${prefix} · ${topic.label} 暂无新结果，沿用 ${formatNewsTime(latestAt)}`;
      updated.dataset.state = "stale";
      return;
    }
    updated.textContent = `${prefix} · ${topic?.label || "新闻"} 最新 ${formatNewsTime(latestAt)} · ${newsPayload.source || "Daily news"}`;
    updated.dataset.state = "fresh";
  };

  const renderNewsTopic = () => {
    const snapshot = newsSnapshots.find((item) => item.date === activeNewsDate) || newsSnapshots[0];
    if (snapshot) {
      activeNewsDate = snapshot.date;
      newsTopics = snapshot.topics;
    }
    const requestedTopic = newsTopics.find((item) => item.id === activeTopic);
    const topic = requestedTopic || newsTopics[0];
    if (!requestedTopic && topic) activeTopic = topic.id;
    tabs.forEach((tab) => {
      const isActive = tab.dataset.newsTopic === activeTopic;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-pressed", String(isActive));
    });

    if (!topic?.items?.length) {
      renderNewsStatus(topic, snapshot);
      renderNewsEmpty("GitHub Actions 首次运行后，这里会显示这个主题的每日推荐。");
      renderNewsHistory();
      return;
    }

    grid.textContent = "";
    topic.items
      .filter((item) => item && typeof item === "object" && item.title && item.url)
      .forEach((item, index) => grid.append(createNewsCard(item, index)));
    renderNewsStatus(topic, snapshot);
    renderNewsHistory();
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activeTopic = tab.dataset.newsTopic || activeTopic;
      renderNewsTopic();
    });
  });

  const loadNews = () => {
    const requestId = ++newsRequestId;
    return fetch(`./data/news.json?checked=${Date.now()}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (requestId !== newsRequestId) return;
        newsPayload = data;
        const currentDate = newsDateKey(data.checkedAt || data.generatedAt || Date.now());
        const rawSnapshots = Array.isArray(data.history) && data.history.length
          ? data.history
          : [{ date: currentDate, checkedAt: data.checkedAt || data.generatedAt, topics: data.topics }];
        const snapshotsByDate = new Map();
        rawSnapshots.forEach((snapshot) => {
          if (!snapshot?.date) return;
          snapshotsByDate.set(snapshot.date, {
            ...snapshot,
            topics: normalizeTopics(snapshot.topics),
          });
        });
        newsSnapshots = [...snapshotsByDate.values()]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 7);
        if (!newsSnapshots.some((snapshot) => snapshot.date === activeNewsDate)) {
          activeNewsDate = newsSnapshots[0]?.date || "";
        }
        newsTopics = newsSnapshots.find((snapshot) => snapshot.date === activeNewsDate)?.topics || [];
        renderNewsTopic();
      })
      .catch(() => {
        if (requestId !== newsRequestId) return;
        updated.textContent = newsTopics.length ? "新闻刷新失败 · 继续显示上一次结果" : "新闻数据暂时不可用";
        updated.dataset.state = "stale";
        if (!newsTopics.length) {
          renderNewsEmpty("本地直接打开文件时可能无法读取 JSON；部署后会正常加载。自动更新失败时会保留上一次数据。");
        }
      });
  };

  loadNews();
  window.setInterval(() => {
    if (!document.hidden) loadNews();
  }, 15 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadNews();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) loadNews();
  });
}
const musicPlayer = document.querySelector("[data-music-player]");
if (musicPlayer) {
  const deck = musicPlayer.querySelector("[data-music-deck]");
  const trackButtons = Array.from(musicPlayer.querySelectorAll(".track-item"));
  const title = musicPlayer.querySelector("[data-music-title]");
  const meta = musicPlayer.querySelector("[data-music-meta]");
  const mood = musicPlayer.querySelector("[data-music-mood]");
  const initial = musicPlayer.querySelector("[data-music-initial]");
  const progress = musicPlayer.querySelector("[data-music-progress]");
  const time = musicPlayer.querySelector("[data-music-time]");
  const toggle = musicPlayer.querySelector("[data-music-toggle]");
  const toggleIcon = musicPlayer.querySelector("[data-music-toggle-icon]");
  const link = musicPlayer.querySelector("[data-music-link]");
  const audio = new Audio();
  let activeTrack = trackButtons[0] || null;
  let isPlaying = false;
  let progressValue = 12;
  let progressTimer = null;

  audio.preload = "metadata";

  const formatSeconds = (seconds) => {
    const totalSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
  };

  const formatPreviewTime = (value) => formatSeconds((value / 100) * 238);

  const hasPlayableAudio = () => Boolean(activeTrack?.dataset.trackSrc);

  const setProgress = (value) => {
    progressValue = Math.max(0, Math.min(100, value));
    progress.style.width = `${progressValue}%`;
  };

  const syncAudioProgress = () => {
    if (!hasPlayableAudio()) return;

    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    if (!duration) {
      setProgress(0);
      time.textContent = formatSeconds(audio.currentTime || 0);
      return;
    }

    setProgress((audio.currentTime / duration) * 100);
    time.textContent = formatSeconds(audio.currentTime);
  };

  const stopProgress = () => {
    if (progressTimer) {
      window.clearInterval(progressTimer);
      progressTimer = null;
    }
  };

  const startPreviewProgress = () => {
    stopProgress();
    progressTimer = window.setInterval(() => {
      setProgress(progressValue >= 100 ? 0 : progressValue + 1.6);
      time.textContent = formatPreviewTime(progressValue);
    }, 900);
  };

  const setPlayingVisual = () => {
    musicPlayer.classList.toggle("is-playing", isPlaying);
    toggleIcon.textContent = isPlaying ? "\u23f8" : "\u25b6";
  };

  const resetAudioSource = () => {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  };

  const setPlaying = (nextPlaying) => {
    isPlaying = nextPlaying;
    setPlayingVisual();

    if (!isPlaying) {
      stopProgress();
      audio.pause();
      return;
    }

    if (!hasPlayableAudio()) {
      audio.pause();
      startPreviewProgress();
      return;
    }

    stopProgress();
    audio.play().then(syncAudioProgress).catch((error) => {
      isPlaying = false;
      setPlayingVisual();
      console.warn("Music playback failed", error);
    });
  };

  const applyTrack = (button) => {
    if (!button) return;

    const shouldContinue = isPlaying;
    stopProgress();
    audio.pause();
    activeTrack = button;
    progressValue = button.dataset.trackSrc ? 0 : 12;

    trackButtons.forEach((track) => track.classList.toggle("is-active", track === button));
    title.textContent = button.dataset.trackTitle || "Untitled";
    meta.textContent = button.dataset.trackMeta || "";
    mood.textContent = button.dataset.trackMood || "";
    initial.textContent = button.dataset.trackInitial || "--";
    link.href = button.dataset.trackLink || "#";
    deck?.style.setProperty("--music-color", button.dataset.trackColor || "#2f6f8f");

    if (button.dataset.trackSrc) {
      audio.src = button.dataset.trackSrc;
      audio.currentTime = 0;
      setProgress(0);
      time.textContent = "0:00";
    } else {
      resetAudioSource();
      setProgress(progressValue);
      time.textContent = formatPreviewTime(progressValue);
    }

    setPlaying(shouldContinue);
  };

  trackButtons.forEach((button) => {
    button.addEventListener("click", () => applyTrack(button));
  });

  toggle?.addEventListener("click", () => setPlaying(!isPlaying));

  audio.addEventListener("timeupdate", syncAudioProgress);
  audio.addEventListener("loadedmetadata", syncAudioProgress);
  audio.addEventListener("ended", () => {
    isPlaying = false;
    stopProgress();
    syncAudioProgress();
    setPlayingVisual();
  });
  audio.addEventListener("error", () => {
    if (!hasPlayableAudio()) return;
    isPlaying = false;
    stopProgress();
    setPlayingVisual();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopProgress();
      return;
    }

    if (isPlaying && hasPlayableAudio()) syncAudioProgress();
    else if (isPlaying) startPreviewProgress();
  });

  applyTrack(activeTrack);
}

const agentWake = document.querySelector("[data-agent-wake]");
const agentStatus = document.querySelector("[data-agent-status]");
const agentDock = document.querySelector(".agent-dock");
const pageAgentScriptSources = [
  "./assets/vendor/page-agent.demo.js?autoInit=false",
  "https://cdn.jsdelivr.net/npm/page-agent@1.11.0/dist/iife/page-agent.demo.js?autoInit=false",
  "https://registry.npmmirror.com/page-agent/1.11.0/files/dist/iife/page-agent.demo.js?autoInit=false",
];
let pageAgentScriptPromise = null;
let agentStatusTimer = null;
let agentDockPositionFrame = null;
let agentDockReturnTimer = null;
const pageAgentSessionKey = "applecry-page-agent-session-v1";
const pageAgentWindowNamePrefix = `${pageAgentSessionKey}:`;
const pageAgentSessionMaxAge = 12 * 60 * 60 * 1000;
const pageAgentSessionAgents = new WeakSet();
const pageAgentResumedAgents = new WeakSet();
let activePageAgentForSession = null;
let pageAgentLeavingOrigin = false;

const pageAgentKnowledge = window.ApplecryPageAgentKnowledge || {
  version: "fallback",
  system: "你是 applecry 公开工作台的站内助手。先观察当前页面，再执行用户任务；不要虚构页面能力或数据事实。",
  pages: {},
};

const resolvePageAgentKnowledge = (url) => {
  let pathname = "";
  try {
    pathname = new URL(url, window.location.href).pathname;
  } catch (error) {
    pathname = window.location.pathname;
  }

  return Object.values(pageAgentKnowledge.pages || {}).find((page) => {
    const pathMatch = (page.paths || []).some((path) => {
      if (path === "/") return pathname === "/" || pathname === "";
      return pathname.endsWith(path);
    });
    const prefixMatch = (page.prefixes || []).some((prefix) => pathname.includes(prefix));
    return pathMatch || prefixMatch;
  });
};

const formatPageAgentKnowledgeList = (label, items = []) => (
  items.length ? `${label}：\n${items.map((item) => `- ${item}`).join("\n")}` : ""
);

const getPageAgentInstructions = (url) => {
  const page = resolvePageAgentKnowledge(url);
  if (!page) {
    return "当前 URL 没有专属页面条目。使用系统总览和当前页面观察完成任务，不要猜测未显示的能力。";
  }

  return [
    `知识库版本：${pageAgentKnowledge.version}`,
    `当前页面：${page.name}`,
    `页面目标：${page.purpose}`,
    formatPageAgentKnowledgeList("可执行能力", page.capabilities),
    formatPageAgentKnowledgeList("业务规则", page.rules),
    formatPageAgentKnowledgeList("遇到问题时的排查顺序", page.diagnostics),
  ].filter(Boolean).join("\n\n");
};

const pageAgentConfig = {
  model: "qwen3.5-plus",
  baseURL: "https://page-ag-testing-ohftxirgbn.cn-shanghai.fcapp.run",
  apiKey: "NA",
  language: "zh-CN",
  promptForNextTask: true,
  instructions: {
    system: pageAgentKnowledge.system,
    getPageInstructions: getPageAgentInstructions,
  },
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

const clampAgentPosition = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

const positionAgentDockByPanel = (agent) => {
  if (!agentDock) return;
  const isWorking = agent?.status === "running";

  window.cancelAnimationFrame(agentDockPositionFrame);

  if (!isWorking) {
    if (agentDock.classList.contains("is-agent-working")) {
      window.clearTimeout(agentDockReturnTimer);
      agentDock.classList.add("is-agent-returning");
      agentDockReturnTimer = window.setTimeout(() => agentDock.classList.remove("is-agent-returning"), 740);
    }
    agentDock.classList.remove("is-agent-working");
    agentDock.style.removeProperty("--agent-fly-x");
    agentDock.style.removeProperty("--agent-fly-y");
    return;
  }

  window.clearTimeout(agentDockReturnTimer);
  agentDockPositionFrame = window.requestAnimationFrame(() => {
    const panel = getPanelWrapper(agent);
    if (!panel || panel.style.display === "none") return;

    const panelRect = panel.getBoundingClientRect();
    const dockStyle = window.getComputedStyle(agentDock);
    const dockWidth = agentDock.offsetWidth;
    const dockHeight = agentDock.offsetHeight;
    const baseLeft = window.innerWidth - Number.parseFloat(dockStyle.right || "0") - dockWidth;
    const baseTop = window.innerHeight - Number.parseFloat(dockStyle.bottom || "0") - dockHeight;
    const compact = window.innerWidth <= 620 || panelRect.left < dockWidth + 24;
    const targetLeft = compact
      ? clampAgentPosition(panelRect.left + 6, 8, window.innerWidth - dockWidth - 8)
      : clampAgentPosition(panelRect.left - dockWidth - 12, 8, window.innerWidth - dockWidth - 8);
    const targetTop = compact
      ? clampAgentPosition(panelRect.top - dockHeight + 14, 8, window.innerHeight - dockHeight - 8)
      : clampAgentPosition(panelRect.top + (panelRect.height - dockHeight) / 2, 8, window.innerHeight - dockHeight - 8);

    agentDock.style.setProperty("--agent-fly-x", `${Math.round(targetLeft - baseLeft)}px`);
    agentDock.style.setProperty("--agent-fly-y", `${Math.round(targetTop - baseTop)}px`);
    agentDock.classList.remove("is-agent-returning");
    agentDock.classList.add("is-agent-working");
  });
};

const syncAgentExecutionState = (agent) => {
  if (!agentWake) return;
  const isThinking = agent?.status === "running";
  agentWake.classList.toggle("is-thinking", isThinking);
  agentWake.setAttribute("aria-busy", isThinking ? "true" : "false");
  agentWake.setAttribute("aria-label", isThinking ? "PageAgent 正在思考" : "唤醒 PageAgent");
  positionAgentDockByPanel(agent);
};

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const absoluteSrc = new URL(src, location.href).href;
    const existing = Array.from(document.scripts).find((script) => script.src === absoluteSrc);
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

const cloneAgentSessionValue = (value) => {
  if (value === undefined) return undefined;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return String(value ?? "");
  }
};

const compactAgentHistory = (history) => {
  if (!Array.isArray(history)) return [];

  return history.slice(-60).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];

    if (entry.type === "step") {
      return [
        {
          type: "step",
          stepIndex: entry.stepIndex,
          reflection: cloneAgentSessionValue(entry.reflection),
          action: entry.action
            ? {
                name: entry.action.name,
                input: cloneAgentSessionValue(entry.action.input),
                output: cloneAgentSessionValue(entry.action.output),
              }
            : undefined,
        },
      ];
    }

    if (["error", "retry", "observation", "user_takeover"].includes(entry.type)) {
      return [
        {
          type: entry.type,
          message: entry.message,
          content: entry.content,
          attempt: entry.attempt,
          maxAttempts: entry.maxAttempts,
        },
      ];
    }

    return [];
  });
};

const isAgentPanelOpen = (agent) => {
  const wrapper = getPanelWrapper(agent);
  return Boolean(wrapper && !agent?.disposed && wrapper.style.display !== "none");
};

const getPageAgentStorage = (storageName) => {
  try {
    return window[storageName] || null;
  } catch (error) {
    return null;
  }
};

const readPageAgentSession = () => {
  const storages = [getPageAgentStorage("sessionStorage"), getPageAgentStorage("localStorage")].filter(Boolean);

  for (const storage of storages) {
    try {
      const session = JSON.parse(storage.getItem(pageAgentSessionKey) || "null");
      if (session && Date.now() - Number(session.updatedAt || 0) <= pageAgentSessionMaxAge) {
        return session;
      }
      storage.removeItem(pageAgentSessionKey);
    } catch (error) {
      // Try the next browser storage implementation.
    }
  }

  try {
    if (window.name.startsWith(pageAgentWindowNamePrefix)) {
      const session = JSON.parse(window.name.slice(pageAgentWindowNamePrefix.length));
      if (session && Date.now() - Number(session.updatedAt || 0) <= pageAgentSessionMaxAge) {
        return session;
      }
      window.name = "";
    }
  } catch (error) {
    // Window name is only a last-resort fallback for restricted browsers.
  }

  return null;
};

const persistPageAgentSession = (agent = activePageAgentForSession) => {
  if (!agent) return;

  const serializedSession = JSON.stringify({
    task: String(agent.task || ""),
    history: compactAgentHistory(agent.history),
    status: String(agent.status || "idle"),
    panelOpen: isAgentPanelOpen(agent),
    pageUrl: location.href,
    updatedAt: Date.now(),
  });
  let persisted = false;

  for (const storageName of ["sessionStorage", "localStorage"]) {
    try {
      const storage = getPageAgentStorage(storageName);
      storage?.setItem(pageAgentSessionKey, serializedSession);
      persisted = persisted || storage?.getItem(pageAgentSessionKey) === serializedSession;
    } catch (error) {
      // A storage implementation can be unavailable in strict privacy modes.
    }
  }

  if (!persisted) {
    try {
      window.name = `${pageAgentWindowNamePrefix}${serializedSession}`;
    } catch (error) {
      // The conversation still works on the current page when every store is blocked.
    }
  }
};

const resumePageAgentTask = (agent, session) => {
  if (
    !agent
    || pageAgentResumedAgents.has(agent)
    || session?.status !== "running"
    || !String(session?.task || "").trim()
    || agent.status !== "idle"
  ) {
    return;
  }

  pageAgentResumedAgents.add(agent);
  const task = String(session.task);
  const history = Array.isArray(session.history) ? session.history.map(cloneAgentSessionValue) : [];
  const previousUrl = String(session.pageUrl || "");

  // PageAgent.execute() creates a fresh private execution loop and clears public
  // history synchronously. Start that loop first, then immediately restore the
  // saved context before its first asynchronous browser observation begins.
  const execution = agent.execute(task);
  agent.task = task;
  agent.history = history;
  agent.pushObservation?.(
    `The task continued after a same-site page navigation${previousUrl ? ` from ${previousUrl}` : ""}. `
      + "Keep working toward the original user request using the restored history and the current page. Do not stop merely because navigation completed.",
  );
  agent.dispatchEvent(new Event("historychange"));
  agent.panel?.show?.();
  setAgentStatus("页面已切换，PageAgent 继续执行中");

  Promise.resolve(execution).catch((error) => {
    console.warn("PageAgent task resume failed", error);
    setAgentStatus("PageAgent 续跑失败，可重新提交任务", "error");
  });
};

const installPageAgentSession = (agent) => {
  if (!agent) return null;
  activePageAgentForSession = agent;

  const session = readPageAgentSession();
  if (session && !agent.task && agent.history.length === 0) {
    agent.task = String(session.task || "");
    agent.history = Array.isArray(session.history) ? session.history : [];
    agent.dispatchEvent(new Event("historychange"));

    if (session.panelOpen) {
      agent.panel.show();
    }
  }

  if (!pageAgentSessionAgents.has(agent)) {
    pageAgentSessionAgents.add(agent);
    agent.addEventListener("historychange", () => persistPageAgentSession(agent));
    agent.addEventListener("statuschange", () => {
      persistPageAgentSession(agent);
      syncAgentExecutionState(agent);
    });
  }

  syncAgentExecutionState(agent);

  if (session?.status === "running") {
    queueMicrotask(() => resumePageAgentTask(agent, session));
  }

  return agent;
};

window.addEventListener("pagehide", () => {
  if (!pageAgentLeavingOrigin) persistPageAgentSession();
});
window.addEventListener("resize", () => positionAgentDockByPanel(activePageAgentForSession));
document.addEventListener("click", (event) => {
  const link = event.target.closest?.("a[href]");
  if (!link || (link.target && link.target !== "_self")) return;

  try {
    if (new URL(link.href, location.href).origin !== location.origin && window.name.startsWith(pageAgentWindowNamePrefix)) {
      pageAgentLeavingOrigin = true;
      window.name = "";
    }
  } catch (error) {
    // Ignore malformed links; the browser will handle them normally.
  }
});

const getSpeechRecognition = () => window.SpeechRecognition || window.webkitSpeechRecognition;

const formatVoiceTime = (elapsedMs) => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const setNativeInputValue = (input, value) => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.setSelectionRange?.(input.value.length, input.value.length);
};

const submitAgentInput = (input) => {
  if (!input.value.trim()) return;
  input.focus();
  input.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    }),
  );
};

const microphonePermissionHelp = "麦克风权限被拒绝。请点地址栏左侧锁图标，把麦克风改为允许，然后刷新页面。";

const getSpeechErrorMessage = (errorName) => {
  const messages = {
    "not-allowed": microphonePermissionHelp,
    "service-not-allowed": "语音识别服务不可用，请确认浏览器允许麦克风并稍后重试。",
    "policy-blocked": "麦克风被站点响应头 Permissions-Policy 禁用了。部署后需要允许 microphone=(self)。",
    "audio-capture": "没有检测到麦克风，请检查系统麦克风权限和输入设备。",
    network: "语音识别网络异常，请稍后重试。",
    "no-speech": "没有识别到语音，可以靠近麦克风再试一次。",
    aborted: "录音已停止",
  };

  return messages[errorName] || "语音输入暂时不可用";
};

const getMediaErrorName = (error) => {
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") return "not-allowed";
  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") return "audio-capture";
  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") return "audio-capture";
  return "unknown";
};

const isMicrophoneBlockedByPolicy = () => {
  try {
    if (document.permissionsPolicy?.allowsFeature) {
      return !document.permissionsPolicy.allowsFeature("microphone");
    }

    if (document.featurePolicy?.allowsFeature) {
      return !document.featurePolicy.allowsFeature("microphone");
    }
  } catch (error) {
    return false;
  }

  return false;
};

const diagnoseMicrophoneAccess = async () => {
  if (isMicrophoneBlockedByPolicy()) {
    return { ok: false, errorName: "policy-blocked" };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, errorName: "audio-capture" };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { ok: true, errorName: "" };
  } catch (error) {
    return { ok: false, errorName: getMediaErrorName(error) };
  }
};

const getRecognitionErrorMessage = async (errorName) => {
  if (errorName !== "not-allowed" && errorName !== "service-not-allowed") {
    return getSpeechErrorMessage(errorName);
  }

  const diagnosis = await diagnoseMicrophoneAccess();
  if (!diagnosis.ok) {
    return getSpeechErrorMessage(diagnosis.errorName);
  }

  return "麦克风权限是开的，但浏览器语音识别服务拒绝启动。请刷新后直接点麦克风；如果仍不行，换 Chrome 或在 Windows 设置里开启在线语音识别。";
};

const createVoiceButtonIcon = () => `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"></path>
    <path d="M19 10v1a7 7 0 0 1-14 0v-1"></path>
    <path d="M12 18v3"></path>
    <path d="M8 21h8"></path>
  </svg>
`;

const createSendButtonIcon = () => `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 19V5"></path>
    <path d="M5 12l7-7 7 7"></path>
  </svg>
`;

const installAgentVoiceInput = (agent) => {
  const wrapper = getPanelWrapper(agent);
  if (!wrapper || wrapper.dataset.voiceInputEnhanced === "true") return;

  const taskInput = wrapper.querySelector("input[type='text'], input:not([type])");
  const inputSection = taskInput?.parentElement;
  const inputWrapper = inputSection?.parentElement;
  if (!taskInput || !inputSection || !inputWrapper) return;

  wrapper.dataset.voiceInputEnhanced = "true";
  inputWrapper.classList.add("agent-voice-input-wrapper");
  inputSection.classList.add("agent-voice-enhanced-input");

  const SpeechRecognition = getSpeechRecognition();
  const supportsSpeech = Boolean(SpeechRecognition);
  const voiceButton = document.createElement("button");
  voiceButton.type = "button";
  voiceButton.className = "agent-voice-button";
  voiceButton.innerHTML = createVoiceButtonIcon();
  voiceButton.title = supportsSpeech ? "语音输入" : "当前浏览器不支持语音识别";
  voiceButton.setAttribute("aria-label", voiceButton.title);
  voiceButton.setAttribute("data-page-agent-ignore", "true");
  voiceButton.disabled = !supportsSpeech;

  const waveBars = Array.from({ length: 28 }, (_, index) => `<span style="--i:${index}"></span>`).join("");
  const overlay = document.createElement("div");
  overlay.className = "agent-voice-overlay";
  overlay.setAttribute("data-page-agent-ignore", "true");
  overlay.innerHTML = `
    <span class="agent-voice-plus" aria-hidden="true">+</span>
    <span class="agent-voice-transcript is-empty" data-agent-voice-transcript>正在听...</span>
    <span class="agent-voice-wave" aria-hidden="true">${waveBars}</span>
    <span class="agent-voice-timer" data-agent-voice-timer>0:00</span>
    <button class="agent-voice-stop-button" type="button" data-agent-voice-stop aria-label="停止录音" title="停止录音">
      <span></span>
    </button>
    <button class="agent-voice-send-button" type="button" data-agent-voice-send aria-label="发送语音文字" title="发送" disabled>
      ${createSendButtonIcon()}
    </button>
  `;

  inputSection.appendChild(voiceButton);
  inputWrapper.insertBefore(overlay, inputSection);

  const transcript = overlay.querySelector("[data-agent-voice-transcript]");
  const timer = overlay.querySelector("[data-agent-voice-timer]");
  const stopButton = overlay.querySelector("[data-agent-voice-stop]");
  const sendButton = overlay.querySelector("[data-agent-voice-send]");
  const state = {
    recognition: null,
    startedAt: 0,
    timerId: null,
    finalText: "",
    interimText: "",
    baseText: "",
    listening: false,
    cancelled: false,
    shouldSubmit: false,
    lastError: "",
    errorHideTimer: null,
  };

  const setOverlayMode = (mode, message = "") => {
    if (state.errorHideTimer) {
      window.clearTimeout(state.errorHideTimer);
      state.errorHideTimer = null;
    }

    overlay.classList.toggle("is-visible", mode !== "idle");
    overlay.classList.toggle("is-listening", mode === "listening");
    overlay.classList.toggle("is-confirming", mode === "confirming");
    overlay.classList.toggle("is-error", mode === "error");

    if (message) {
      transcript.textContent = message;
      transcript.classList.toggle("is-empty", false);
    }
  };

  const showVoiceError = (message, timeout = 6200) => {
    stopTimer();
    state.listening = false;
    state.shouldSubmit = false;
    state.cancelled = false;
    voiceButton.classList.remove("is-recording");
    setOverlayMode("error", message);
    setAgentStatus(message, "error");
    state.errorHideTimer = window.setTimeout(() => setOverlayMode("idle"), timeout);
  };

  const recognizedText = () => [state.finalText, state.interimText].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  const applyRecognizedText = () => {
    const voiceText = recognizedText();
    const nextValue = [state.baseText, voiceText].filter(Boolean).join(state.baseText && voiceText ? " " : "");
    setNativeInputValue(taskInput, nextValue);
    transcript.textContent = voiceText || "正在听...";
    transcript.classList.toggle("is-empty", !voiceText);
    sendButton.disabled = !taskInput.value.trim();
  };

  const stopTimer = () => {
    if (state.timerId) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    timer.textContent = "0:00";
    state.timerId = window.setInterval(() => {
      timer.textContent = formatVoiceTime(Date.now() - state.startedAt);
    }, 250);
  };

  const finishRecognition = () => {
    stopTimer();
    state.listening = false;
    voiceButton.classList.remove("is-recording");

    if (state.cancelled) {
      state.cancelled = false;
      state.shouldSubmit = false;
      state.lastError = "";
      setOverlayMode("idle");
      return;
    }

    if (state.shouldSubmit) {
      state.shouldSubmit = false;
      setOverlayMode("idle");
      submitAgentInput(taskInput);
      return;
    }

    if (state.lastError) {
      showVoiceError(getSpeechErrorMessage(state.lastError), state.lastError === "not-allowed" ? 8200 : 3600);
      return;
    }

    if (taskInput.value.trim()) {
      setOverlayMode("confirming", recognizedText() || taskInput.value.trim());
      sendButton.disabled = false;
      setAgentStatus("语音文字已填入，确认后发送");
      return;
    }

    setOverlayMode("idle");
  };

  const stopRecognition = (shouldSubmit = false) => {
    state.shouldSubmit = shouldSubmit;
    state.cancelled = !shouldSubmit;

    if (!state.recognition || !state.listening) {
      if (shouldSubmit) submitAgentInput(taskInput);
      else {
        state.cancelled = false;
        setOverlayMode("idle");
      }
      return;
    }

    try {
      if (shouldSubmit) {
        state.recognition.stop();
      } else {
        if (typeof state.recognition.abort === "function") {
          state.recognition.abort();
        } else {
          state.recognition.stop();
        }
        stopTimer();
        state.listening = false;
        voiceButton.classList.remove("is-recording");
        setOverlayMode("idle");
      }
    } catch (error) {
      finishRecognition();
    }
  };

  const startRecognition = () => {
    if (!supportsSpeech) {
      showVoiceError("当前浏览器不支持语音识别，请使用 Chrome 或 Edge。", 5200);
      return;
    }

    if (state.listening) {
      stopRecognition(false);
      return;
    }

    const recognition = new SpeechRecognition();
    state.recognition = recognition;
    state.startedAt = Date.now();
    state.finalText = "";
    state.interimText = "";
    state.baseText = taskInput.value.trim();
    state.shouldSubmit = false;
    state.cancelled = false;
    state.lastError = "";
    state.listening = true;

    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      voiceButton.classList.add("is-recording");
      setOverlayMode("listening", "正在听...");
      startTimer();
      setAgentStatus("正在听，文字会实时进入输入框");
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let index = 0; index < event.results.length; index += 1) {
        const text = event.results[index][0]?.transcript || "";
        if (event.results[index].isFinal) {
          finalText += text;
        } else {
          interimText += text;
        }
      }

      state.finalText = finalText.trim();
      state.interimText = interimText.trim();
      applyRecognizedText();
    };

    recognition.onerror = (event) => {
      const errorName = event.error || "unknown";
      if (state.cancelled || errorName === "aborted") {
        state.lastError = "";
        return;
      }

      state.lastError = "";
      state.shouldSubmit = false;
      sendButton.disabled = !taskInput.value.trim();
      getRecognitionErrorMessage(errorName).then((message) => {
        if (!state.cancelled) {
          showVoiceError(message, errorName === "not-allowed" || errorName === "service-not-allowed" ? 9000 : 4200);
        }
      });
    };

    recognition.onend = finishRecognition;

    try {
      recognition.start();
    } catch (error) {
      showVoiceError("语音识别没有启动，请刷新页面后再试一次。", 5200);
      console.error(error);
    }
  };

  voiceButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    startRecognition();
  });

  stopButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    stopRecognition(false);
  });

  sendButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    stopRecognition(true);
  });

  taskInput.addEventListener("input", () => {
    sendButton.disabled = !taskInput.value.trim();
  });
};

const createOrReusePageAgent = () => {
  if (!window.PageAgent) {
    return null;
  }

  const existingWrapper = getPanelWrapper(window.pageAgent);
  if (window.pageAgent && existingWrapper && document.body.contains(existingWrapper)) {
    installPageAgentSession(window.pageAgent);
    installAgentVoiceInput(window.pageAgent);
    return window.pageAgent;
  }

  try {
    window.pageAgent?.dispose?.();
  } catch (error) {
    // A disposed panel can be safely recreated below.
  }

  window.pageAgent = new window.PageAgent(pageAgentConfig);
  installPageAgentSession(window.pageAgent);
  installAgentVoiceInput(window.pageAgent);
  return window.pageAgent;
};

const preloadPageAgent = async () => {
  if (!agentWake) return;
  setAgentButtonState("loading");

  try {
    await loadPageAgentScript();
    const session = readPageAgentSession();
    if (session?.panelOpen) {
      createOrReusePageAgent();
    }
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
    installAgentVoiceInput(agent);
    setAgentButtonState("ready");
    setAgentStatus("PageAgent 已打开，可使用语音输入");
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
