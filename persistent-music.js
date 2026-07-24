(() => {
  "use strict";

  if (window.top !== window) {
    try {
      const parentPlayer = window.top.QiaomuPersistentMusic;
      if (parentPlayer?.navigate) {
        window.QiaomuPersistentMusic = parentPlayer;
        document.addEventListener(
          "click",
          (event) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const link = event.target.closest?.("a[href]");
            if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
            const target = new URL(link.href, window.location.href);
            const sameDocument = target.pathname === window.location.pathname
              && target.search === window.location.search;
            if (target.origin !== window.location.origin || sameDocument) return;
            event.preventDefault();
            parentPlayer.navigate(target.href);
          },
          true,
        );
        return;
      }
    } catch {
      // A cross-origin parent cannot share the player.
    }
  }

  const scriptUrl = new URL(document.currentScript?.src || window.location.href);
  const siteRoot = new URL("./", scriptUrl);
  const storageKey = "qiaomu-music-state-v1";
  const tracks = [
    {
      id: "night-dancer",
      title: "NIGHT DANCER",
      meta: "imase · midnight city pop",
      mood: "适合边走边想，把杂乱任务切成一个个小节拍。",
      initial: "ND",
      src: new URL("assets/audio/night-dancer.mp3?v=20260709-11", siteRoot).href,
      link: "https://www.youtube.com/results?search_query=Night+Dancer+imase",
      color: "#2f6f8f",
    },
    {
      id: "judgement",
      title: "Judgement",
      meta: "DEVILMAN crybaby · dark pulse",
      mood: "适合处理难题、做决策，带一点压迫感和速度。",
      initial: "JD",
      src: new URL("assets/audio/judgement.mp3?v=20260709-11", siteRoot).href,
      link: "https://www.youtube.com/results?search_query=Judgement+Devilman+Crybaby",
      color: "#7f2f3f",
    },
    {
      id: "night-cruising",
      title: "Night Cruising",
      meta: "Fishmans · slow night drive",
      mood: "适合深夜整理思路，让页面和脑子一起慢下来。",
      initial: "NC",
      src: new URL("assets/audio/night-cruising.mp3?v=20260709-11", siteRoot).href,
      link: "https://www.youtube.com/results?search_query=Fishmans+Night+Cruising",
      color: "#4f6f58",
    },
    {
      id: "sunset-road",
      title: "日落大道",
      meta: "梁博 · sunset road",
      mood: "适合收尾、复盘和写下今天还没有说完的话。",
      initial: "日落",
      src: new URL("assets/audio/sunset-road.mp3?v=20260709-11", siteRoot).href,
      link: "https://www.youtube.com/results?search_query=%E6%97%A5%E8%90%BD%E5%A4%A7%E9%81%93+%E6%A2%81%E5%8D%9A",
      color: "#b8733d",
    },
  ];

  const defaultState = {
    trackId: tracks[0].id,
    currentTime: 0,
    playing: false,
    updatedAt: Date.now(),
  };

  const readState = () => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(storageKey) || "null");
      if (!saved || !tracks.some((track) => track.id === saved.trackId)) return { ...defaultState };
      return {
        trackId: saved.trackId,
        currentTime: Math.max(0, Number(saved.currentTime) || 0),
        playing: Boolean(saved.playing),
        updatedAt: Number(saved.updatedAt) || Date.now(),
      };
    } catch {
      return { ...defaultState };
    }
  };

  let state = readState();
  let activeTrack = tracks.find((track) => track.id === state.trackId) || tracks[0];
  let needsResume = false;
  let lastSavedSecond = -1;
  let pendingSeek = state.currentTime;
  const audio = new Audio();
  audio.preload = "metadata";

  const homepagePlayer = document.querySelector("[data-music-player]");
  let miniPlayer = null;

  const injectMiniPlayer = () => {
    const style = document.createElement("style");
    style.textContent = `
      .pm-player{--pm-accent:#2f6f8f;position:fixed;right:18px;bottom:18px;z-index:2147483000;box-sizing:border-box;width:min(330px,calc(100vw - 28px));padding:11px 12px 13px;display:grid;grid-template-columns:44px minmax(0,1fr) 38px 38px;align-items:center;gap:9px;border:1px solid rgba(255,255,255,.16);border-radius:15px;background:rgba(19,24,24,.94);box-shadow:0 14px 40px rgba(0,0,0,.28);color:#f7f3e8;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
      .pm-player,.pm-player *{box-sizing:border-box}
      .pm-player[hidden]{display:none}
      .pm-player__art{display:grid;place-items:center;width:44px;height:44px;border-radius:11px;background:linear-gradient(145deg,var(--pm-accent),#171b18 78%);color:#fff;font-size:12px;font-weight:800;letter-spacing:.06em}
      .pm-player__copy{min-width:0;color:inherit;text-decoration:none}
      .pm-player__eyebrow,.pm-player__status{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pm-player__eyebrow{margin-bottom:2px;color:#b8c1ba;font-size:9px;font-weight:800;letter-spacing:.14em}
      .pm-player__title{display:block;overflow:hidden;color:#fff;font-size:13px;font-weight:750;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
      .pm-player__status{margin-top:3px;color:#aeb8b1;font-size:10px}
      .pm-player__button{appearance:none;display:grid;place-items:center;width:38px;height:38px;margin:0;padding:0;border:1px solid rgba(255,255,255,.14);border-radius:50%;background:rgba(255,255,255,.07);color:#fff;font:700 14px/1 system-ui;cursor:pointer}
      .pm-player__button:hover{background:rgba(255,255,255,.14)}
      .pm-player__button:focus-visible,.pm-player__copy:focus-visible{outline:2px solid #fff;outline-offset:3px}
      .pm-player__progress{position:absolute;right:13px;bottom:5px;left:65px;height:2px;overflow:hidden;border-radius:99px;background:rgba(255,255,255,.12)}
      .pm-player__progress span{display:block;width:0;height:100%;border-radius:inherit;background:var(--pm-accent)}
      .pm-player.is-playing .pm-player__art{animation:pm-pulse 1.8s ease-in-out infinite}
      .pm-player.needs-resume .pm-player__status{color:#ffd18a}
      @keyframes pm-pulse{50%{filter:brightness(1.28);transform:translateY(-1px)}}
      @media(max-width:560px){.pm-player{right:14px;bottom:14px;left:14px;width:auto}}
      @media(prefers-reduced-motion:reduce){.pm-player.is-playing .pm-player__art{animation:none}}
    `;
    document.head.append(style);

    const player = document.createElement("aside");
    player.className = "pm-player";
    player.hidden = Boolean(homepagePlayer);
    player.setAttribute("aria-label", "全站音乐播放器");
    player.innerHTML = `
      <div class="pm-player__art" data-pm-art aria-hidden="true">ND</div>
      <a class="pm-player__copy" data-pm-home href="${new URL("index.html#music", siteRoot).href}">
        <span class="pm-player__eyebrow">NIGHT RADIO · 全站续播</span>
        <strong class="pm-player__title" data-pm-title>NIGHT DANCER</strong>
        <span class="pm-player__status" data-pm-status>已暂停</span>
      </a>
      <button class="pm-player__button" data-pm-toggle type="button" aria-label="播放音乐">▶</button>
      <button class="pm-player__button" data-pm-next type="button" aria-label="下一首">↠</button>
      <div class="pm-player__progress" aria-hidden="true"><span data-pm-progress></span></div>
    `;
    document.body.append(player);
    return player;
  };

  miniPlayer = injectMiniPlayer();

  const homeUi = homepagePlayer
    ? {
        deck: homepagePlayer.querySelector("[data-music-deck]"),
        buttons: Array.from(homepagePlayer.querySelectorAll(".track-item")),
        title: homepagePlayer.querySelector("[data-music-title]"),
        meta: homepagePlayer.querySelector("[data-music-meta]"),
        mood: homepagePlayer.querySelector("[data-music-mood]"),
        initial: homepagePlayer.querySelector("[data-music-initial]"),
        progress: homepagePlayer.querySelector("[data-music-progress]"),
        time: homepagePlayer.querySelector("[data-music-time]"),
        toggle: homepagePlayer.querySelector("[data-music-toggle]"),
        toggleIcon: homepagePlayer.querySelector("[data-music-toggle-icon]"),
        link: homepagePlayer.querySelector("[data-music-link]"),
      }
    : null;

  const miniUi = miniPlayer
    ? {
        art: miniPlayer.querySelector("[data-pm-art]"),
        title: miniPlayer.querySelector("[data-pm-title]"),
        status: miniPlayer.querySelector("[data-pm-status]"),
        progress: miniPlayer.querySelector("[data-pm-progress]"),
        toggle: miniPlayer.querySelector("[data-pm-toggle]"),
        next: miniPlayer.querySelector("[data-pm-next]"),
      }
    : null;

  const formatSeconds = (seconds) => {
    const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
  };

  const effectiveTime = () => {
    if (Number.isFinite(audio.currentTime) && audio.currentTime > 0) return audio.currentTime;
    return Math.max(0, pendingSeek || state.currentTime || 0);
  };

  const saveState = (force = false) => {
    const second = Math.floor(effectiveTime());
    if (!force && second === lastSavedSecond) return;
    lastSavedSecond = second;
    state = {
      trackId: activeTrack.id,
      currentTime: effectiveTime(),
      playing: state.playing,
      updatedAt: Date.now(),
    };
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Playback still works when storage is unavailable.
    }
  };

  const render = () => {
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    const currentTime = effectiveTime();
    const progressValue = duration ? Math.min(100, (currentTime / duration) * 100) : 0;
    const actuallyPlaying = !audio.paused && !audio.ended;

    if (homeUi) {
      homepagePlayer.classList.toggle("is-playing", actuallyPlaying);
      homeUi.title.textContent = activeTrack.title;
      homeUi.meta.textContent = activeTrack.meta;
      homeUi.mood.textContent = activeTrack.mood;
      homeUi.initial.textContent = activeTrack.initial;
      homeUi.progress.style.width = `${progressValue}%`;
      homeUi.time.textContent = formatSeconds(currentTime);
      homeUi.toggleIcon.textContent = actuallyPlaying ? "⏸" : "▶";
      homeUi.toggle.setAttribute("aria-label", actuallyPlaying ? "暂停音乐" : "播放音乐");
      homeUi.link.href = activeTrack.link;
      homeUi.deck?.style.setProperty("--music-color", activeTrack.color);
      homeUi.buttons.forEach((button, index) => {
        const buttonId = button.dataset.trackId || tracks[index]?.id;
        button.classList.toggle("is-active", buttonId === activeTrack.id);
      });
    }

    if (miniUi) {
      miniPlayer.classList.toggle("is-playing", actuallyPlaying);
      miniPlayer.classList.toggle("needs-resume", needsResume);
      miniPlayer.style.setProperty("--pm-accent", activeTrack.color);
      miniUi.art.textContent = activeTrack.initial;
      miniUi.title.textContent = activeTrack.title;
      miniUi.status.textContent = needsResume
        ? "点一下继续播放"
        : actuallyPlaying
          ? `${formatSeconds(currentTime)} · 正在播放`
          : `${formatSeconds(currentTime)} · 已暂停`;
      miniUi.progress.style.width = `${progressValue}%`;
      miniUi.toggle.textContent = actuallyPlaying ? "⏸" : "▶";
      miniUi.toggle.setAttribute("aria-label", actuallyPlaying ? "暂停音乐" : "播放音乐");
    }
  };

  const seekWhenReady = (time) => {
    pendingSeek = Math.max(0, Number(time) || 0);
    if (audio.readyState < 1) return;
    const maxTime = Number.isFinite(audio.duration) && audio.duration > 0
      ? Math.max(0, audio.duration - 0.25)
      : pendingSeek;
    try {
      audio.currentTime = Math.min(pendingSeek, maxTime);
      pendingSeek = audio.currentTime;
    } catch {
      // Some browsers only accept seeking after metadata is available.
    }
  };

  const setPlaying = async (shouldPlay) => {
    state.playing = shouldPlay;
    needsResume = false;

    if (!shouldPlay) {
      audio.pause();
      saveState(true);
      render();
      return;
    }

    saveState(true);
    try {
      await audio.play();
      needsResume = false;
    } catch {
      needsResume = true;
    }
    saveState(true);
    render();
  };

  const selectTrack = (trackId, options = {}) => {
    const nextTrack = tracks.find((track) => track.id === trackId);
    if (!nextTrack) return;

    const shouldPlay = options.play ?? state.playing;
    activeTrack = nextTrack;
    state.trackId = nextTrack.id;
    state.currentTime = Math.max(0, Number(options.currentTime) || 0);
    state.playing = shouldPlay;
    pendingSeek = state.currentTime;
    needsResume = false;
    audio.src = nextTrack.src;
    audio.load();
    seekWhenReady(pendingSeek);
    saveState(true);
    render();
    if (shouldPlay) setPlaying(true);
  };

  homeUi?.buttons.forEach((button, index) => {
    button.addEventListener("click", () => {
      const trackId = button.dataset.trackId || tracks[index]?.id;
      selectTrack(trackId, { currentTime: 0, play: state.playing });
    });
  });

  const togglePlayback = () => setPlaying(audio.paused || needsResume);
  homeUi?.toggle?.addEventListener("click", togglePlayback);
  miniUi?.toggle?.addEventListener("click", togglePlayback);
  miniUi?.next?.addEventListener("click", () => {
    const currentIndex = tracks.findIndex((track) => track.id === activeTrack.id);
    const nextTrack = tracks[(currentIndex + 1) % tracks.length];
    selectTrack(nextTrack.id, { currentTime: 0, play: state.playing });
  });

  audio.addEventListener("loadedmetadata", () => {
    seekWhenReady(pendingSeek);
    render();
  });
  audio.addEventListener("timeupdate", () => {
    pendingSeek = audio.currentTime;
    saveState();
    render();
  });
  audio.addEventListener("play", () => {
    state.playing = true;
    needsResume = false;
    saveState(true);
    render();
  });
  audio.addEventListener("pause", render);
  audio.addEventListener("ended", () => {
    state.playing = false;
    pendingSeek = 0;
    saveState(true);
    render();
  });
  audio.addEventListener("error", () => {
    state.playing = false;
    needsResume = false;
    saveState(true);
    render();
  });

  const shellUrl = window.location.href;
  const shellTitle = document.title;
  let pageFrame = null;

  const navigate = (href, options = {}) => {
    const target = new URL(href, window.location.href);
    if (target.origin !== window.location.origin) {
      window.location.href = target.href;
      return;
    }

    if (!pageFrame) {
      pageFrame = document.createElement("iframe");
      pageFrame.title = "站内页面";
      pageFrame.style.cssText = "position:fixed;inset:0;z-index:2147482000;width:100%;height:100%;border:0;background:#fff";
      pageFrame.addEventListener("load", () => {
        try {
          document.title = pageFrame.contentDocument?.title || shellTitle;
        } catch {
          document.title = shellTitle;
        }
      });
      document.body.append(pageFrame);
    }

    miniPlayer.hidden = false;
    pageFrame.src = target.href;
    if (!options.fromHistory) {
      window.history.pushState({ qiaomuMusicPage: target.href }, "", target.href);
    }
    saveState(true);
  };

  const closeSoftPage = () => {
    pageFrame?.remove();
    pageFrame = null;
    document.title = shellTitle;
    if (homepagePlayer) miniPlayer.hidden = true;
  };

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest?.("a[href]");
      if (!link || link.hasAttribute("download")) return;
      saveState(true);
      if (
        event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
        || link.target === "_blank"
        || audio.paused
        || audio.ended
      ) return;

      const target = new URL(link.href, window.location.href);
      const current = new URL(pageFrame?.src || shellUrl);
      const sameDocument = target.pathname === current.pathname && target.search === current.search;
      if (target.origin !== window.location.origin || sameDocument) return;
      event.preventDefault();
      navigate(target.href);
    },
    true,
  );
  window.addEventListener("popstate", (event) => {
    if (event.state?.qiaomuMusicPage) {
      navigate(event.state.qiaomuMusicPage, { fromHistory: true });
      return;
    }
    closeSoftPage();
  });
  window.addEventListener("pagehide", () => saveState(true));
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    const restored = readState();
    selectTrack(restored.trackId, {
      currentTime: restored.currentTime,
      play: restored.playing,
    });
  });

  const elapsedSincePageChange = state.playing
    ? Math.min(8, Math.max(0, (Date.now() - state.updatedAt) / 1000))
    : 0;
  selectTrack(state.trackId, {
    currentTime: state.currentTime + elapsedSincePageChange,
    play: state.playing,
  });

  window.QiaomuPersistentMusic = {
    pause: () => setPlaying(false),
    play: () => setPlaying(true),
    selectTrack,
    navigate,
  };
})();
