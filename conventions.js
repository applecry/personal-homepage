(() => {
  const app = document.querySelector("[data-con-app]");
  if (!app || !window.ConventionRadarCore || !window.ExhibitionAtlasCore) return;

  const {
    addDays,
    conventionMatches,
    dateWindow,
    findNewGuests,
    guestCount,
    guestsForWindow,
    hasPublishedGuests,
    isSaved,
    sortConventions,
  } = window.ConventionRadarCore;
  const { buildIcs, deriveEventStatus, todayInTimeZone } = window.ExhibitionAtlasCore;
  const SAVED_KEY = "exhibit-atlas-convention-follows-v1";
  const SNAPSHOT_KEY = "exhibit-atlas-convention-guests-v1";
  const state = {
    events: [],
    sources: [],
    query: "",
    scope: "all",
    city: "all",
    dateMode: "all",
    sort: "date",
    savedIds: new Set(),
    newGuests: new Map(),
  };

  const list = app.querySelector("[data-convention-list]");
  const search = app.querySelector("[data-search]");
  const sort = app.querySelector("[data-sort]");
  const city = app.querySelector("[data-city]");
  const dateMode = app.querySelector("[data-date-mode]");
  const guestBoard = app.querySelector("[data-guest-board]");
  const sourcePanel = app.querySelector("[data-source-panel]");
  const sourceList = app.querySelector("[data-source-list]");
  const scrim = app.querySelector("[data-scrim]");
  const dialog = app.querySelector("[data-convention-dialog]");
  const dialogContent = app.querySelector("[data-dialog-content]");

  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);

  const safeHttpUrl = (value = "") => {
    try {
      const url = new URL(value, window.location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  };

  const readJsonStorage = (key, fallback) => {
    try {
      const value = JSON.parse(window.localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };

  const writeJsonStorage = (key, value) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The page remains fully usable when storage is blocked.
    }
  };

  const today = () => todayInTimeZone(new Date(), "Asia/Shanghai");
  const shortDate = (value) => {
    const [, month, day] = String(value).split("-");
    return month && day ? `${month}.${day}` : value;
  };
  const dateRange = (event) => event.startDate === event.endDate
    ? shortDate(event.startDate)
    : `${shortDate(event.startDate)}—${shortDate(event.endDate)}`;
  const weekday = (value) => new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(`${value}T12:00:00+08:00`));

  const platformClass = (platform = "") => {
    if (platform.includes("B站")) return "con-badge--bili";
    if (platform.includes("大麦")) return "con-badge--damai";
    return "";
  };

  const lineupLabel = (event) => {
    if (event.guestStatus === "rolling") return "阵容持续公布";
    if (hasPublishedGuests(event)) return "阵容已核验";
    return "嘉宾待官宣";
  };

  const updateLabel = (event) => {
    if (!event.guestUpdatedAt) return lineupLabel(event);
    return `${lineupLabel(event)} · ${shortDate(event.guestUpdatedAt)}`;
  };

  const statusFor = (event) => deriveEventStatus(event, today());
  const visibleEvents = () => sortConventions(
    state.events.filter((event) => conventionMatches(event, state, today())),
    state.sort,
  );

  const updateScopeButtons = () => app.querySelectorAll("[data-scope]").forEach((button) => {
    const active = button.dataset.scope === state.scope;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const updateSavedCount = () => {
    app.querySelector("[data-saved-count]").textContent = String(state.savedIds.size);
  };

  const renderCard = (event) => {
    const status = statusFor(event);
    const platforms = [...new Set((event.ticketSources || []).map((source) => source.platform))];
    const guests = event.guests || [];
    const newGuests = state.newGuests.get(event.id) || [];
    const saved = isSaved(event.id, state.savedIds);
    const guestMarkup = hasPublishedGuests(event)
      ? `<div class="con-guest-line" aria-label="已公布嘉宾">
          ${guests.slice(0, 5).map((guest) => {
            const isNew = newGuests.some((item) => item.name === guest.name);
            return `<button class="con-guest-chip${isNew ? " is-new" : ""}" type="button" data-guest-query="${escapeHtml(guest.name)}">${escapeHtml(guest.name)}${isNew ? "<span>NEW</span>" : ""}</button>`;
          }).join("")}
          ${guests.length > 5 ? `<span class="con-guest-more">+${guests.length - 5} 位</span>` : ""}
        </div>`
      : `<span class="con-guests-pending">嘉宾待官宣 · 已保留来源入口</span>`;

    return `<article class="con-card${saved ? " is-saved" : ""}" data-event-id="${escapeHtml(event.id)}">
      <div class="con-card-date">
        <span>${escapeHtml(event.startDate.slice(0, 4))}</span>
        <strong>${escapeHtml(shortDate(event.startDate))}</strong>
        <small>${escapeHtml(weekday(event.startDate))}${event.startDate === event.endDate ? "" : `—${escapeHtml(weekday(event.endDate))}`}</small>
      </div>
      <div class="con-card-main">
        <div class="con-card-top">
          <span class="con-badge">${escapeHtml(event.type)}</span>
          ${platforms.map((platform) => `<span class="con-badge ${platformClass(platform)}">${escapeHtml(platform)}</span>`).join("")}
          <span class="con-badge con-badge--trust">${escapeHtml(updateLabel(event))}</span>
          ${newGuests.length ? `<span class="con-badge con-badge--new">新增 ${newGuests.length} 位</span>` : ""}
        </div>
        <h3>${escapeHtml(event.name)}</h3>
        <p class="con-card-meta">${escapeHtml(event.city)} · ${escapeHtml(event.venue)} · ${escapeHtml(event.price)}</p>
        ${guestMarkup}
      </div>
      <div class="con-card-side">
        <button class="con-save-button" type="button" data-save-event="${escapeHtml(event.id)}" aria-pressed="${saved}" aria-label="${saved ? "取消关注" : "关注"}${escapeHtml(event.name)}">${saved ? "★ 已关注" : "☆ 关注"}</button>
        <div><strong>${hasPublishedGuests(event) ? `${guests.length} 位嘉宾` : "阵容未公布"}</strong><small>${escapeHtml(status.label)} · ${escapeHtml(event.ticketStatus)}</small></div>
        <button class="con-detail-button" type="button" data-open-event="${escapeHtml(event.id)}">${hasPublishedGuests(event) ? "看嘉宾日程" : "查看活动"}</button>
      </div>
    </article>`;
  };

  const renderResultsNote = (events) => {
    const parts = [`${events.length} 场活动`];
    if (state.city !== "all") parts.push(state.city);
    if (state.dateMode === "today") parts.push("今天");
    if (state.dateMode === "weekend") parts.push("本周末");
    if (state.dateMode === "month") parts.push("未来 30 天");
    if (state.scope === "guests") parts.push("嘉宾已公布");
    if (state.scope === "pending") parts.push("嘉宾待官宣");
    if (state.scope === "saved") parts.push("我的关注");
    if (state.query.trim()) parts.push(`搜索“${state.query.trim()}”`);
    app.querySelector("[data-results-note]").textContent = parts.join(" · ");
  };

  const renderList = () => {
    const events = visibleEvents();
    list.innerHTML = events.length
      ? events.map(renderCard).join("")
      : `<div class="con-empty"><strong>没有匹配的近期漫展</strong><span>${state.scope === "saved" ? "还没有关注活动，先在全部近期里点一下“关注”。" : "试试清除搜索或筛选条件。"}</span></div>`;
    updateScopeButtons();
    updateSavedCount();
    renderResultsNote(events);
  };

  const boardWindow = () => dateWindow(today(), state.dateMode) || {
    start: today(),
    end: addDays(today(), 29),
  };

  const renderGuestBoard = () => {
    const window = boardWindow();
    const events = state.events.filter((event) => {
      if (event.endDate < today()) return false;
      if (state.city !== "all" && event.city !== state.city) return false;
      if (state.scope === "saved" && !isSaved(event.id, state.savedIds)) return false;
      return event.startDate <= window.end && event.endDate >= window.start;
    });
    const guests = guestsForWindow(events, window.start, window.end)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.name.localeCompare(b.name, "zh-CN"));
    const title = state.city === "all" ? "近期嘉宾" : `${state.city}嘉宾`;
    app.querySelector("[data-guest-board-title]").textContent = title;
    app.querySelector("[data-guest-board-copy]").textContent = `按 ${shortDate(window.start)}—${shortDate(window.end)} 出席日期整理，点名字可筛出对应漫展。`;
    app.querySelector("[data-week-guest-count]").textContent = String(guests.length);
    guestBoard.innerHTML = guests.length
      ? guests.map((guest) => `<button class="guest-board-item" type="button" data-guest-query="${escapeHtml(guest.name)}">
          <time datetime="${escapeHtml(guest.date)}">${escapeHtml(shortDate(guest.date))}</time>
          <span><strong>${escapeHtml(guest.name)}</strong><small>${escapeHtml(guest.city)} · ${escapeHtml(guest.eventName)}</small></span>
        </button>`).join("")
      : `<div class="guest-board-empty">当前城市与日期范围内暂无已核验嘉宾。</div>`;
  };

  const renderSources = (payload = {}) => {
    const healthById = new Map((payload.sourceHealth || []).map((health) => [health.sourceId, health]));
    const healthLabel = {
      healthy: "正常",
      partial: "部分失败",
      unavailable: "暂时不可用",
      "manual-review": "人工复核",
    };
    sourceList.innerHTML = state.sources.map((source) => {
      const url = safeHttpUrl(source.url);
      const health = healthById.get(source.id);
      const note = health?.note ? `${source.role}；${health.note}` : source.role;
      const status = health ? `${healthLabel[health.status] || health.status} · ${health.itemCount || 0} 条` : source.status;
      return `<a class="con-source-row" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">
        <span>${escapeHtml(source.short)}</span>
        <div><strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(note)}</small></div>
        <i data-health="${escapeHtml(health?.status || "unknown")}">${escapeHtml(status)} ↗</i>
      </a>`;
    }).join("");
    const checked = new Date(payload.checkedAt);
    const checkedText = Number.isNaN(checked.getTime())
      ? "最近核对时间未记录"
      : `数据集最近核对：${new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(checked)}`;
    const stats = payload.stats || {};
    const statsText = Number.isFinite(stats.eventCount)
      ? `当前 ${stats.eventCount} 场，${stats.guestVerifiedEvents || 0} 场已有结构化嘉宾，共 ${stats.guestCount || 0} 位。`
      : "";
    sourceList.insertAdjacentHTML("beforeend", `<p class="con-source-checked">${escapeHtml(checkedText)}。${escapeHtml(statsText)}每场活动的嘉宾状态与核验日期会单独显示。</p>`);
    const changes = Array.isArray(payload.changes) ? payload.changes.slice(0, 6) : [];
    if (changes.length) {
      sourceList.insertAdjacentHTML("beforeend", `<section class="con-change-feed" aria-label="最近数据变更">
        <h3>最近变更</h3>
        ${changes.map((change) => `<p><time datetime="${escapeHtml(change.at)}">${escapeHtml(shortDate(String(change.at).slice(0, 10)))}</time><span>${escapeHtml(change.eventName)}</span><small>${escapeHtml(change.summary)}</small></p>`).join("")}
      </section>`);
    }
  };

  const updateOverview = (payload) => {
    const upcoming = state.events.filter((event) => event.endDate >= today());
    app.querySelector("[data-event-total]").textContent = String(upcoming.length);
    app.querySelector("[data-guest-total]").textContent = String(guestCount(upcoming));
    app.querySelector("[data-city-total]").textContent = String(new Set(upcoming.map((event) => event.city)).size);
    const checked = new Date(payload.checkedAt);
    const text = Number.isNaN(checked.getTime())
      ? "已读取双平台数据"
      : `${new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(checked)} 核对`;
    app.querySelector("[data-sync-note]").textContent = `${text} · 嘉宾变动以来源页为准`;
  };

  const populateCities = () => {
    const cities = [...new Set(state.events.filter((event) => event.endDate >= today()).map((event) => event.city))]
      .sort((a, b) => a.localeCompare(b, "zh-CN"));
    city.innerHTML = `<option value="all">全部城市</option>${cities.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
    city.value = state.city;
  };

  const persistGuestSnapshot = () => {
    const snapshot = Object.fromEntries(state.events.map((event) => [
      event.id,
      (event.guests || []).map((guest) => guest.name),
    ]));
    writeJsonStorage(SNAPSHOT_KEY, snapshot);
  };

  const downloadCalendar = (event) => {
    const sourceUrl = safeHttpUrl(event.ticketSources?.find((source) => source.primary)?.url || event.ticketSources?.[0]?.url);
    const calendarEvent = { ...event, nameZh: event.name, url: sourceUrl, sourceUrl };
    const blob = new Blob([buildIcs(calendarEvent)], { type: "text/calendar;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${event.name.replace(/[\\/:*?"<>|]/g, "-")}.ics`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  };

  const detailUrlFor = (eventId = "") => {
    const url = new URL(window.location.href);
    if (eventId) url.searchParams.set("convention", eventId);
    else url.searchParams.delete("convention");
    return url;
  };

  const openEvent = (eventId, options = {}) => {
    const event = state.events.find((item) => item.id === eventId);
    if (!event) return;
    const guests = event.guests || [];
    const saved = isSaved(event.id, state.savedIds);
    const newGuests = state.newGuests.get(event.id) || [];
    const sourceActions = (event.ticketSources || []).map((source, index) => {
      const url = safeHttpUrl(source.url);
      if (!url) return "";
      return `<a class="dialog-action${source.primary || index === 0 ? " dialog-action--primary" : ""}" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(source.platform)} · ${escapeHtml(source.label)} ↗</a>`;
    }).join("");
    const guestMarkup = guests.length
      ? `<div class="dialog-guest-list">${guests.map((guest) => {
          const isNew = newGuests.some((item) => item.name === guest.name);
          return `<div class="dialog-guest${isNew ? " is-new" : ""}">
            <strong>${escapeHtml(guest.name)}${isNew ? "<em>NEW</em>" : ""}</strong><span>${escapeHtml(guest.role || "参展嘉宾")}</span><time datetime="${escapeHtml(guest.date || event.startDate)}">${escapeHtml(shortDate(guest.date || event.startDate))} · ${escapeHtml(guest.time || "以现场为准")}</time>
          </div>`;
        }).join("")}</div>`
      : `<div class="dialog-pending"><strong>嘉宾阵容待公布</strong><br />当前票务来源没有可核验的结构化嘉宾名单。我们保留活动，但不会把海报角色、票根图案或展商名单当成真人嘉宾。</div>`;

    dialogContent.innerHTML = `<div class="dialog-hero">
        <p class="con-eyebrow">${escapeHtml(event.city)} / ${escapeHtml(event.type)} / ${escapeHtml(updateLabel(event))}</p>
        <h2>${escapeHtml(event.name)}</h2>
        <p>${escapeHtml(event.summary)}</p>
      </div>
      <div class="dialog-body">
        <div class="dialog-facts">
          <div><span>日期</span><strong>${escapeHtml(dateRange(event))}</strong></div>
          <div><span>场馆</span><strong>${escapeHtml(event.venue)}</strong></div>
          <div><span>票务</span><strong>${escapeHtml(event.price)} · ${escapeHtml(event.ticketStatus)}</strong></div>
        </div>
        <div class="dialog-section-title"><h3>嘉宾与出席日</h3><span>${guests.length ? `${guests.length} 位已公布` : "WAITING FOR LINEUP"}</span></div>
        ${guestMarkup}
        <div class="dialog-actions">
          ${sourceActions}
          <button class="dialog-action" type="button" data-calendar-event="${escapeHtml(event.id)}">加入日历</button>
          <button class="dialog-action dialog-save-action" type="button" data-save-event="${escapeHtml(event.id)}" aria-pressed="${saved}">${saved ? "★ 已关注" : "☆ 关注活动"}</button>
        </div>
        <p class="dialog-note">核验说明：${escapeHtml(event.verification)} 出席与签售安排可能临时调整，出发前请回到来源页确认。</p>
      </div>`;
    if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
    else dialog.setAttribute("open", "");
    if (!options.fromUrl) window.history.replaceState(null, "", detailUrlFor(event.id));
  };

  const closeDialog = () => {
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
    window.history.replaceState(null, "", detailUrlFor());
  };

  const openSources = () => {
    sourcePanel.classList.add("is-open");
    sourcePanel.setAttribute("aria-hidden", "false");
    scrim.hidden = false;
    document.body.classList.add("has-con-panel");
  };

  const closeSources = () => {
    sourcePanel.classList.remove("is-open");
    sourcePanel.setAttribute("aria-hidden", "true");
    scrim.hidden = true;
    document.body.classList.remove("has-con-panel");
  };

  const toggleSaved = (eventId) => {
    if (state.savedIds.has(eventId)) state.savedIds.delete(eventId);
    else state.savedIds.add(eventId);
    writeJsonStorage(SAVED_KEY, [...state.savedIds]);
    renderList();
    renderGuestBoard();
    if (dialog.open || dialog.hasAttribute("open")) openEvent(eventId, { fromUrl: true });
  };

  const resetFilters = () => {
    state.query = "";
    state.scope = "all";
    state.city = "all";
    state.dateMode = "all";
    search.value = "";
    city.value = "all";
    dateMode.value = "all";
    renderList();
    renderGuestBoard();
  };

  app.addEventListener("click", (event) => {
    const scopeButton = event.target.closest("[data-scope]");
    if (scopeButton) {
      state.scope = scopeButton.dataset.scope;
      renderList();
      renderGuestBoard();
      return;
    }
    const saveButton = event.target.closest("[data-save-event]");
    if (saveButton) {
      toggleSaved(saveButton.dataset.saveEvent);
      return;
    }
    const guestButton = event.target.closest("[data-guest-query]");
    if (guestButton) {
      state.query = guestButton.dataset.guestQuery;
      state.scope = "all";
      state.city = "all";
      state.dateMode = "all";
      search.value = state.query;
      city.value = "all";
      dateMode.value = "all";
      renderList();
      renderGuestBoard();
      document.querySelector(".con-explorer")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const eventButton = event.target.closest("[data-open-event]");
    if (eventButton) openEvent(eventButton.dataset.openEvent);
    const calendarButton = event.target.closest("[data-calendar-event]");
    if (calendarButton) {
      const calendarEvent = state.events.find((item) => item.id === calendarButton.dataset.calendarEvent);
      if (calendarEvent) downloadCalendar(calendarEvent);
    }
  });

  search.addEventListener("input", () => {
    state.query = search.value;
    renderList();
  });
  sort.addEventListener("change", () => {
    state.sort = sort.value;
    renderList();
  });
  city.addEventListener("change", () => {
    state.city = city.value;
    renderList();
    renderGuestBoard();
  });
  dateMode.addEventListener("change", () => {
    state.dateMode = dateMode.value;
    renderList();
    renderGuestBoard();
  });
  app.querySelector("[data-reset-filters]").addEventListener("click", resetFilters);
  app.querySelector("[data-source-open]").addEventListener("click", openSources);
  app.querySelector("[data-source-close]").addEventListener("click", closeSources);
  scrim.addEventListener("click", closeSources);
  app.querySelector("[data-dialog-close]").addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sourcePanel.classList.contains("is-open")) closeSources();
  });

  fetch("./data/conventions.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      state.events = Array.isArray(payload.events) ? payload.events : [];
      state.sources = Array.isArray(payload.sources) ? payload.sources : [];
      state.savedIds = new Set(readJsonStorage(SAVED_KEY, []).filter((id) => state.events.some((event) => event.id === id)));
      const previousSnapshot = readJsonStorage(SNAPSHOT_KEY, {});
      state.events.forEach((event) => {
        const additions = findNewGuests(event, previousSnapshot[event.id]);
        if (additions.length) state.newGuests.set(event.id, additions);
      });
      populateCities();
      updateOverview(payload);
      renderList();
      renderGuestBoard();
      renderSources(payload);
      persistGuestSnapshot();
      const eventId = new URL(window.location.href).searchParams.get("convention");
      if (eventId) openEvent(eventId, { fromUrl: true });
    })
    .catch(() => {
      list.innerHTML = `<div class="con-empty"><strong>漫展数据暂时没有加载成功</strong><span>请稍后刷新；票务与嘉宾信息仍可从 B站会员购或大麦查看。</span></div>`;
      app.querySelector("[data-sync-note]").textContent = "数据加载失败 · 请稍后重试";
    });
})();
