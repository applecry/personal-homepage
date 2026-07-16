(() => {
  const app = document.querySelector("[data-con-app]");
  if (!app || !window.ConventionRadarCore) return;

  const {
    conventionMatches,
    guestCount,
    guestsForWeekend,
    hasPublishedGuests,
    sortConventions,
  } = window.ConventionRadarCore;
  const { buildIcs, deriveEventStatus, todayInTimeZone } = window.ExhibitionAtlasCore;
  const state = { events: [], sources: [], query: "", scope: "all", sort: "date" };

  const list = app.querySelector("[data-convention-list]");
  const search = app.querySelector("[data-search]");
  const sort = app.querySelector("[data-sort]");
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

  const today = () => todayInTimeZone(new Date(), "Asia/Shanghai");
  const shortDate = (value) => {
    const [, month, day] = value.split("-");
    return `${month}.${day}`;
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

  const renderCard = (event) => {
    const status = statusFor(event);
    const platforms = [...new Set((event.ticketSources || []).map((source) => source.platform))];
    const guests = event.guests || [];
    const guestMarkup = hasPublishedGuests(event)
      ? `<div class="con-guest-line" aria-label="已公布嘉宾">
          ${guests.slice(0, 5).map((guest) => `<button class="con-guest-chip" type="button" data-guest-query="${escapeHtml(guest.name)}">${escapeHtml(guest.name)}</button>`).join("")}
          ${guests.length > 5 ? `<span class="con-guest-more">+${guests.length - 5} 位</span>` : ""}
        </div>`
      : `<span class="con-guests-pending">嘉宾待公布 · 已保留来源入口</span>`;

    return `<article class="con-card" data-event-id="${escapeHtml(event.id)}">
      <div class="con-card-date">
        <span>${escapeHtml(event.startDate.slice(0, 4))}</span>
        <strong>${escapeHtml(shortDate(event.startDate))}</strong>
        <small>${escapeHtml(weekday(event.startDate))}${event.startDate === event.endDate ? "" : `—${escapeHtml(weekday(event.endDate))}`}</small>
      </div>
      <div class="con-card-main">
        <div class="con-card-top">
          <span class="con-badge">${escapeHtml(event.type)}</span>
          ${platforms.map((platform) => `<span class="con-badge ${platformClass(platform)}">${escapeHtml(platform)}</span>`).join("")}
        </div>
        <h3>${escapeHtml(event.name)}</h3>
        <p class="con-card-meta">${escapeHtml(event.city)} · ${escapeHtml(event.venue)} · ${escapeHtml(event.price)}</p>
        ${guestMarkup}
      </div>
      <div class="con-card-side">
        <div><strong>${hasPublishedGuests(event) ? `${guests.length} 位嘉宾` : "阵容未公布"}</strong><small>${escapeHtml(status.label)} · ${escapeHtml(event.ticketStatus)}</small></div>
        <button class="con-detail-button" type="button" data-open-event="${escapeHtml(event.id)}">${hasPublishedGuests(event) ? "看嘉宾日程" : "查看活动"}</button>
      </div>
    </article>`;
  };

  const renderList = () => {
    const events = visibleEvents();
    list.innerHTML = events.length
      ? events.map(renderCard).join("")
      : `<div class="con-empty"><strong>没有匹配的近期漫展</strong><span>试试清除搜索，或切回“全部近期”。</span></div>`;
    updateScopeButtons();
  };

  const renderGuestBoard = () => {
    const guests = guestsForWeekend(state.events.filter((event) => event.endDate >= today()), today())
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.name.localeCompare(b.name, "zh-CN"));
    app.querySelector("[data-week-guest-count]").textContent = String(guests.length);
    guestBoard.innerHTML = guests.length
      ? guests.map((guest) => `<button class="guest-board-item" type="button" data-guest-query="${escapeHtml(guest.name)}">
          <time datetime="${escapeHtml(guest.date)}">${escapeHtml(shortDate(guest.date))}</time>
          <span><strong>${escapeHtml(guest.name)}</strong><small>${escapeHtml(guest.city)} · ${escapeHtml(guest.eventName)}</small></span>
        </button>`).join("")
      : `<div class="guest-board-empty">本周末暂时没有已核验的嘉宾安排。</div>`;
  };

  const renderSources = () => {
    sourceList.innerHTML = state.sources.map((source) => {
      const url = safeHttpUrl(source.url);
      return `<a class="con-source-row" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">
        <span>${escapeHtml(source.short)}</span>
        <div><strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(source.role)}</small></div>
        <i>${escapeHtml(source.status)} ↗</i>
      </a>`;
    }).join("");
  };

  const updateOverview = (payload) => {
    const upcoming = state.events.filter((event) => event.endDate >= today());
    app.querySelector("[data-event-total]").textContent = String(upcoming.length);
    app.querySelector("[data-guest-total]").textContent = String(guestCount(upcoming));
    app.querySelector("[data-city-total]").textContent = String(new Set(upcoming.map((event) => event.city)).size);
    const checked = new Date(payload.checkedAt);
    const text = Number.isNaN(checked.getTime()) ? "已读取双平台数据" : `${new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(checked)} 核对`;
    app.querySelector("[data-sync-note]").textContent = `${text} · 嘉宾变动以来源页为准`;
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
    const sourceActions = (event.ticketSources || []).map((source, index) => {
      const url = safeHttpUrl(source.url);
      if (!url) return "";
      return `<a class="dialog-action${source.primary || index === 0 ? " dialog-action--primary" : ""}" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(source.platform)} · ${escapeHtml(source.label)} ↗</a>`;
    }).join("");
    const guestMarkup = guests.length
      ? `<div class="dialog-guest-list">${guests.map((guest) => `<div class="dialog-guest">
          <strong>${escapeHtml(guest.name)}</strong><span>${escapeHtml(guest.role || "参展嘉宾")}</span><time datetime="${escapeHtml(guest.date || event.startDate)}">${escapeHtml(shortDate(guest.date || event.startDate))} · ${escapeHtml(guest.time || "以现场为准")}</time>
        </div>`).join("")}</div>`
      : `<div class="dialog-pending"><strong>嘉宾阵容待公布</strong><br />当前票务来源没有可核验的结构化嘉宾名单。我们保留活动，但不会把海报角色、票根图案或展商名单当成真人嘉宾。</div>`;

    dialogContent.innerHTML = `<div class="dialog-hero">
        <p class="con-eyebrow">${escapeHtml(event.city)} / ${escapeHtml(event.type)}</p>
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
        <div class="dialog-actions">${sourceActions}<button class="dialog-action" type="button" data-calendar-event="${escapeHtml(event.id)}">加入日历</button></div>
        <p class="dialog-note">核验说明：${escapeHtml(event.verification)} 出席与签售安排可能临时调整，出发前请回到来源页确认。</p>
      </div>`;
    if (typeof dialog.showModal === "function") dialog.showModal();
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

  app.addEventListener("click", (event) => {
    const scopeButton = event.target.closest("[data-scope]");
    if (scopeButton) {
      state.scope = scopeButton.dataset.scope;
      renderList();
      return;
    }
    const guestButton = event.target.closest("[data-guest-query]");
    if (guestButton) {
      state.query = guestButton.dataset.guestQuery;
      state.scope = "all";
      search.value = state.query;
      renderList();
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
      updateOverview(payload);
      renderList();
      renderGuestBoard();
      renderSources();
      const eventId = new URL(window.location.href).searchParams.get("convention");
      if (eventId) openEvent(eventId, { fromUrl: true });
    })
    .catch(() => {
      list.innerHTML = `<div class="con-empty"><strong>漫展数据暂时没有加载成功</strong><span>请稍后刷新；票务与嘉宾信息仍可从 B站会员购或大麦查看。</span></div>`;
      app.querySelector("[data-sync-note]").textContent = "数据加载失败 · 请稍后重试";
    });
})();
