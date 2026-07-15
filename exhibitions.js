const app = document.querySelector("[data-atlas-app]");

if (app && window.L && window.ExhibitionAtlasCore) {
  const {
    buildIcs,
    dateRangeFor,
    deriveEventStatus,
    eventMatchesDate,
    sortEvents,
    todayInTimeZone,
  } = window.ExhibitionAtlasCore;
  const colors = { 艺术: "#d45745", 科技: "#167d84", 游戏: "#245de8", 商贸: "#9b6a22" };
  const dateLabels = { all: "全部日期", ongoing: "正在进行", weekend: "本周末", month: "未来 30 天", custom: "自定义日期" };
  const shanghaiVenues = [
    { id: "necc", match: "国家会展中心（上海）", name: "国家会展中心（上海）", short: "国展", district: "青浦区", address: "崧泽大道 333 号", transit: "地铁 2 / 17 号线 · 国家会展中心站", lat: 31.1889, lng: 121.2990 },
    { id: "sniec", match: "上海新国际博览中心", aliases: ["上海新国际展览中心", "上海新国际会展中心"], name: "上海新国际博览中心", short: "新博", district: "浦东新区", address: "龙阳路 2345 号", transit: "地铁 7 号线 · 花木路站", lat: 31.2117, lng: 121.5635 },
    { id: "sweecc", match: "上海世博展览馆", name: "上海世博展览馆", short: "世博", district: "浦东新区", address: "国展路 1099 号", transit: "地铁 8 号线 · 中华艺术宫站", lat: 31.1850, lng: 121.4890 },
    { id: "expo-center", match: "世博中心", name: "上海世博中心", short: "世中", district: "浦东新区", address: "世博大道 1500 号", transit: "地铁 8 号线 · 中华艺术宫站", lat: 31.1900, lng: 121.4898 },
    { id: "zhangjiang", match: "张江科学会堂", name: "张江科学会堂", short: "张江", district: "浦东新区", address: "海科路 1393 号", transit: "地铁 13 号线 · 学林路站", lat: 31.1765, lng: 121.6022 },
    { id: "west-bund", match: "徐汇西岸国际会展中心", name: "西岸国际会展中心", short: "西岸", district: "徐汇区", address: "龙腾大道 2555 号", transit: "地铁 11 号线 · 云锦路站", lat: 31.1734, lng: 121.4590 },
  ];
  const readSavedEvents = () => {
    try {
      const value = JSON.parse(localStorage.getItem("exhibit-atlas-saved") || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };
  const state = {
    events: [],
    sources: [],
    region: "上海",
    category: "全部",
    query: "",
    dateMode: "all",
    dateStart: "",
    dateEnd: "",
    sortMode: "date",
    savedOnly: false,
    saved: new Set(readSavedEvents()),
    markers: new Map(),
    eventRows: new Map(),
    activeVenueId: "",
    activeEventId: "",
  };

  const map = L.map("exhibition-map", { zoomControl: false, minZoom: 2, maxZoom: 14, worldCopyJump: true }).setView([31.2304, 121.4737], 10.4);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    subdomains: "abcd",
    maxZoom: 20,
  }).addTo(map);
  L.control.zoom({ position: "topright" }).addTo(map);

  const list = app.querySelector("[data-event-list]");
  const detailPanel = app.querySelector("[data-detail-panel]");
  const detailContent = app.querySelector("[data-detail-content]");
  const venuePanel = app.querySelector("[data-venue-panel]");
  const venueContent = app.querySelector("[data-venue-content]");
  const searchPanel = app.querySelector("[data-search-panel]");
  const searchInput = app.querySelector("[data-search-input]");
  const sourcesPanel = app.querySelector("[data-sources-panel]");
  const socialSignalList = app.querySelector("[data-social-signal-list]");
  const dateFilter = app.querySelector("[data-date-filter]");
  const sortFilter = app.querySelector("[data-sort-filter]");
  const customDates = app.querySelector("[data-custom-dates]");
  const dateStartInput = app.querySelector("[data-date-start]");
  const dateEndInput = app.querySelector("[data-date-end]");
  const dateError = app.querySelector("[data-date-error]");

  const escapeHtml = (value = "") => String(value).replace(/[&<>"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  })[character]);

  const safeHttpUrl = (value = "") => {
    if (!value || typeof value !== "string") return "";
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  };

  const currentDate = () => todayInTimeZone(new Date(), "Asia/Shanghai");
  const activeDateRange = () => dateRangeFor(state.dateMode, currentDate(), state.dateStart, state.dateEnd);

  const verificationState = (event) => {
    const verification = String(event.verification || "");
    if (/待.*复核|未核验|待确认/.test(verification)) return { key: "pending", label: "待官网复核" };
    if (verification) return { key: "verified", label: "来源已核验" };
    return { key: "unknown", label: "状态待确认" };
  };

  const formatCheckedDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  };

  const detailUrlFor = (eventId = "") => {
    const url = new URL(window.location.href);
    if (eventId) url.searchParams.set("event", eventId);
    else url.searchParams.delete("event");
    return url;
  };

  const updateDetailUrl = (eventId = "") => {
    window.history.replaceState(null, "", detailUrlFor(eventId));
  };

  const reportUrlFor = (event) => {
    const url = new URL("https://github.com/applecry/personal-homepage/issues/new");
    url.searchParams.set("title", `展会信息纠错：${event.nameZh}`);
    url.searchParams.set("body", [
      `展会：${event.nameZh}`,
      `展会 ID：${event.id}`,
      `当前页面：${detailUrlFor(event.id).href}`,
      "",
      "需要更正的信息：",
    ].join("\n"));
    return url.href;
  };

  const copyText = async (value) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  };

  const downloadCalendar = (event) => {
    const officialUrl = safeHttpUrl(event.url) || safeHttpUrl(event.sourceUrl);
    const blob = new Blob([buildIcs(event, { url: officialUrl })], { type: "text/calendar;charset=utf-8" });
    const anchor = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    anchor.href = objectUrl;
    anchor.download = `${String(event.nameZh || event.name).replace(/[\\/:*?"<>|]/g, "-")}.ics`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  };

  const normalizeCountry = (country = "", city = "") => {
    const value = `${country} ${city}`.toLowerCase();
    if (/台湾|taiwan|taipei|台北/.test(value)) return "中国台湾";
    if (/香港|hong kong/.test(value)) return "中国香港";
    return country;
  };

  const regionMatches = (event) => {
    if (state.region === "全部") return true;
    if (state.region === "上海") return event.city === "上海";
    if (state.region === "中国") return event.country === "中国" || event.country === "中国台湾" || event.country === "中国香港";
    return event.region === state.region;
  };

  const focusMap = (events = filteredEvents()) => {
    const views = {
      上海: [[31.2304, 121.4737], 10.4],
      中国: [[34.4, 104.2], 4],
      全部: [[28, 35], 2.35],
      亚洲: [[32, 100], 3.2],
      欧洲: [[51, 12], 4],
      美洲: [[24, -82], 3],
    };
    if (state.region === "上海") {
      const points = venueGroups(events).map((venue) => [venue.lat, venue.lng]);
      if (points.length > 1) {
        const compact = window.innerWidth <= 900;
        map.flyToBounds(points, {
          paddingTopLeft: compact ? [32, 320] : [190, 120],
          paddingBottomRight: compact ? [32, 220] : [190, 150],
          maxZoom: 11.2,
          duration: 0.65,
        });
        return;
      }
    }
    const [center, zoom] = views[state.region] || views.全部;
    map.flyTo(center, zoom, { duration: 0.65 });
  };

  const formatDate = (start, end) => {
    const a = new Date(`${start}T00:00:00`);
    const b = new Date(`${end}T00:00:00`);
    const month = String(a.getMonth() + 1).padStart(2, "0");
    const day = String(a.getDate()).padStart(2, "0");
    const endMonth = String(b.getMonth() + 1).padStart(2, "0");
    const endDay = String(b.getDate()).padStart(2, "0");
    return a.getMonth() === b.getMonth() ? `${month}.${day}—${endDay}` : `${month}.${day}—${endMonth}.${endDay}`;
  };

  const filteredEvents = () => {
    const dateRange = activeDateRange();
    const query = state.query.trim().toLowerCase();
    const matches = state.events.filter((event) => {
      const regionMatch = regionMatches(event);
      const categoryMatch = state.category === "全部" || event.category === state.category;
      const aliases = Array.isArray(event.aliases) ? event.aliases.join(" ") : "";
      const haystack = `${event.name} ${event.nameZh} ${aliases} ${event.city} ${event.country} ${event.venue} ${event.category} ${event.visitorType || ""}`.toLowerCase();
      const queryMatch = !query || haystack.includes(query);
      const savedMatch = !state.savedOnly || state.saved.has(event.id);
      return regionMatch && categoryMatch && queryMatch && savedMatch && eventMatchesDate(event, dateRange);
    });
    return sortEvents(matches, state.sortMode);
  };

  const venuePointsFor = (event) => {
    if (event.city === "上海") {
      const matches = shanghaiVenues.filter((venue) => [venue.match, ...(venue.aliases || [])].some((name) => event.venue.includes(name)));
      if (matches.length) return matches;
    }
    return [{
      id: `${event.city}-${event.venue}`,
      name: event.venue,
      short: event.venue.replace(/[（(].*?[）)]/g, "").slice(0, 2),
      district: event.city,
      address: "地址以主办方最新通知为准",
      transit: "请从展会来源页确认到场方式",
      lat: event.lat,
      lng: event.lng,
    }];
  };

  const venueGroups = (events) => {
    const groups = new Map();
    events.forEach((event) => venuePointsFor(event).forEach((point) => {
      const key = `${event.city}:${point.id}`;
      if (!groups.has(key)) groups.set(key, { ...point, key, city: event.city, events: [] });
      if (!groups.get(key).events.some((item) => item.id === event.id)) groups.get(key).events.push(event);
    }));
    return [...groups.values()].map((venue) => ({
      ...venue,
      events: venue.events.sort((a, b) => a.startDate.localeCompare(b.startDate)),
    }));
  };

  const venueColor = (venue) => colors[venue.events[0]?.category] || colors.商贸;
  const markerIcon = (venue, active = false) => L.divIcon({
    className: "atlas-marker-wrap",
    html: `<span class="atlas-marker${active ? " is-active" : ""}" style="--marker:${venueColor(venue)}" aria-hidden="true"><span>${escapeHtml(venue.short)}</span><b>${venue.events.length}</b></span>`,
    iconSize: active ? [70, 70] : [58, 58],
    iconAnchor: active ? [35, 35] : [29, 29],
  });

  const venueKeysForEvent = (event) => new Set(venuePointsFor(event).map((point) => `${event.city}:${point.id}`));

  const navigationUrlFor = (point, event) => {
    if (String(event.country || "").startsWith("中国")) {
      const url = new URL("https://uri.amap.com/search");
      url.searchParams.set("keyword", `${event.city} ${point.name}`);
      url.searchParams.set("city", event.city);
      url.searchParams.set("view", "map");
      url.searchParams.set("src", "ExhibitAtlas");
      url.searchParams.set("callnative", "0");
      return url.href;
    }
    const url = new URL("https://www.google.com/maps/search/");
    url.searchParams.set("api", "1");
    url.searchParams.set("query", `${point.lat},${point.lng}`);
    return url.href;
  };

  const clearRowHighlights = () => state.eventRows.forEach((row) => row.classList.remove("is-active", "is-venue-active"));

  const highlightMarkers = (venueKeys = new Set()) => {
    state.markers.forEach(({ marker, venue }) => marker.setIcon(markerIcon(venue, venueKeys.has(venue.key))));
  };

  const highlightEvent = (event, options = {}) => {
    clearRowHighlights();
    const row = state.eventRows.get(event.id);
    if (row) {
      row.classList.add("is-active");
      row.setAttribute("aria-current", "true");
      if (options.scroll) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    state.eventRows.forEach((item, id) => {
      if (id !== event.id) item.removeAttribute("aria-current");
    });
    highlightMarkers(venueKeysForEvent(event));
  };

  const highlightVenue = (venue, options = {}) => {
    clearRowHighlights();
    const eventIds = new Set(venue.events.map((event) => event.id));
    let firstRow = null;
    state.eventRows.forEach((row, id) => {
      row.removeAttribute("aria-current");
      if (!eventIds.has(id)) return;
      row.classList.add("is-venue-active");
      if (!firstRow) firstRow = row;
    });
    if (options.scroll && firstRow) firstRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (options.markers !== false) highlightMarkers(new Set([venue.key]));
  };

  const restoreHighlights = () => {
    const activeEvent = state.events.find((event) => event.id === state.activeEventId);
    if (activeEvent && state.eventRows.has(activeEvent.id)) {
      highlightEvent(activeEvent);
      return;
    }
    const activeVenue = state.markers.get(state.activeVenueId)?.venue;
    if (activeVenue) {
      highlightVenue(activeVenue);
      return;
    }
    clearRowHighlights();
    state.eventRows.forEach((row) => row.removeAttribute("aria-current"));
    highlightMarkers();
  };

  const focusEventOnMap = (event) => {
    const points = venuePointsFor(event);
    if (points.length > 1) {
      const compact = window.innerWidth <= 900;
      map.flyToBounds(points.map((point) => [point.lat, point.lng]), {
        paddingTopLeft: compact ? [32, 250] : [80, 80],
        paddingBottomRight: compact ? [32, 180] : [410, 100],
        maxZoom: 12,
        duration: 0.65,
      });
      return;
    }
    map.flyTo([points[0].lat, points[0].lng], Math.max(map.getZoom(), event.city === "上海" ? 12 : 4), { duration: 0.65 });
  };

  const saveState = () => {
    try {
      localStorage.setItem("exhibit-atlas-saved", JSON.stringify([...state.saved]));
    } catch {
      // The exhibition list remains usable when storage is blocked or full.
    }
    app.querySelector("[data-saved-count]").textContent = state.saved.size;
  };

  const syncAtlasPanelState = () => {
    const hasOpenPanel = [detailPanel, venuePanel, sourcesPanel]
      .some((panel) => panel.classList.contains("is-open"));
    document.body.classList.toggle("has-atlas-panel", hasOpenPanel);
  };

  const closeSources = () => {
    sourcesPanel.classList.remove("is-open");
    sourcesPanel.setAttribute("aria-hidden", "true");
    syncAtlasPanelState();
  };

  const openDetail = (event, options = {}) => {
    closeSources();
    venuePanel.classList.remove("is-open");
    venuePanel.setAttribute("aria-hidden", "true");
    state.activeVenueId = "";
    state.activeEventId = event.id;
    const saved = state.saved.has(event.id);
    const status = deriveEventStatus(event, currentDate());
    const trust = verificationState(event);
    const officialUrl = safeHttpUrl(event.url) || safeHttpUrl(event.sourceUrl);
    const sourceUrl = safeHttpUrl(event.sourceUrl);
    const checkedDate = formatCheckedDate(event.collectedAt);
    const venuePoints = venuePointsFor(event);
    const navigationLinks = venuePoints.map((point) => ({
      name: point.name,
      url: navigationUrlFor(point, event),
    }));
    const navigationAction = navigationLinks.length === 1
      ? `<a class="detail-action" href="${escapeHtml(navigationLinks[0].url)}" target="_blank" rel="noreferrer">地图导航 ↗</a>`
      : '<button class="detail-action" type="button" data-toggle-navigation>选择会场</button>';
    const officialAction = officialUrl
      ? `<a class="detail-action detail-action--primary" href="${escapeHtml(officialUrl)}" target="_blank" rel="noreferrer">官方信息 / 报名 ↗</a>`
      : '<span class="detail-action detail-action--primary is-disabled">官方页面待补充</span>';
    const organizers = Array.isArray(event.organizers) ? event.organizers.filter(Boolean) : [];
    const concurrentEvents = Array.isArray(event.concurrentEvents) ? event.concurrentEvents.filter((item) => item?.nameZh) : [];
    detailContent.innerHTML = `
      <div class="detail-topline">
        <p class="detail-category" style="--accent:${colors[event.category]}">${escapeHtml(event.category)} · ${escapeHtml(event.region)}</p>
        <div class="detail-badges"><span class="event-status status--${status.key}">${status.label}</span><span class="event-trust is-${trust.key}">${trust.label}</span></div>
      </div>
      <p class="detail-date">${formatDate(event.startDate, event.endDate)} / ${event.startDate.slice(0, 4)}</p>
      <h2>${escapeHtml(event.nameZh)}</h2>
      ${event.name ? `<p class="detail-name">${escapeHtml(event.name)}</p>` : ""}
      <p class="detail-summary">${escapeHtml(event.summary || "展会详情请以主办方最新公告为准。")}</p>
      <dl>
        <div><dt>城市</dt><dd>${escapeHtml(event.city)}，${escapeHtml(event.country)}</dd></div>
        <div><dt>场馆</dt><dd>${escapeHtml(event.venue)}</dd></div>
        ${event.filingStatus ? `<div><dt>备案</dt><dd>${escapeHtml(event.filingStatus)}${event.filingNumber ? ` · ${escapeHtml(event.filingNumber)}` : ""}</dd></div>` : ""}
        ${organizers.length ? `<div><dt>主办</dt><dd>${organizers.map(escapeHtml).join("<br>")}</dd></div>` : ""}
        ${event.exhibitionArea ? `<div><dt>面积</dt><dd>${Number(event.exhibitionArea).toLocaleString("zh-CN")} 平方米</dd></div>` : ""}
        ${event.exhibitionType ? `<div><dt>类型</dt><dd>${escapeHtml(event.exhibitionType)}</dd></div>` : ""}
        <div><dt>适合</dt><dd>${escapeHtml(event.visitorType || "以主办方说明为准")}</dd></div>
        <div><dt>来源</dt><dd>${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(event.source || "查看核验来源")} ↗</a>` : escapeHtml(event.source || "来源待补充")}</dd></div>
        <div><dt>核验</dt><dd>${escapeHtml(event.verification || "以主办方最新公告为准")}</dd></div>
      </dl>
      ${concurrentEvents.length ? `<section class="detail-concurrent"><span>同期展会</span>${concurrentEvents.slice(0, 6).map((item) => `<a href="${escapeHtml(safeHttpUrl(item.url) || "#")}" target="_blank" rel="noreferrer"><strong>${escapeHtml(item.nameZh)}</strong><small>${escapeHtml(item.startDate || "")}—${escapeHtml(item.endDate || "")}</small></a>`).join("")}</section>` : ""}
      <div class="detail-actions">
        ${officialAction}
        <button class="detail-action" type="button" data-add-calendar${status.key === "cancelled" ? " disabled" : ""}>${status.key === "cancelled" ? "展会已取消" : "加入日历"}</button>
        ${navigationAction}
        <button class="detail-action" type="button" data-share-event>分享展会</button>
        <button class="detail-action" type="button" data-save-event="${escapeHtml(event.id)}">${saved ? "♥ 已收藏" : "♡ 收藏"}</button>
      </div>
      <div class="detail-navigation-options" data-navigation-options hidden><span>请选择具体会场</span><div>${navigationLinks.map((item) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.name)} ↗</a>`).join("")}</div></div>
      <span class="detail-action-feedback" data-action-feedback aria-live="polite"></span>
      <p class="detail-feedback">${checkedDate ? `数据收录于 ${escapeHtml(checkedDate)} · ` : ""}<a href="${escapeHtml(reportUrlFor(event))}" target="_blank" rel="noreferrer">信息有误？反馈</a></p>`;
    detailPanel.classList.add("is-open");
    detailPanel.setAttribute("aria-hidden", "false");
    document.body.classList.add("has-atlas-panel");
    highlightEvent(event, { scroll: options.scrollRow });
    if (options.updateUrl !== false) updateDetailUrl(event.id);
    detailContent.querySelector("[data-save-event]").addEventListener("click", () => {
      if (state.saved.has(event.id)) state.saved.delete(event.id);
      else state.saved.add(event.id);
      saveState();
      if (state.savedOnly && !state.saved.has(event.id)) {
        render();
        focusMap();
      } else {
        openDetail(event, { updateUrl: false, focusMap: false });
      }
    });
    detailContent.querySelector("[data-add-calendar]")?.addEventListener("click", () => downloadCalendar(event));
    detailContent.querySelector("[data-toggle-navigation]")?.addEventListener("click", () => {
      const navigationOptions = detailContent.querySelector("[data-navigation-options]");
      navigationOptions.hidden = !navigationOptions.hidden;
    });
    detailContent.querySelector("[data-share-event]").addEventListener("click", async () => {
      const feedback = detailContent.querySelector("[data-action-feedback]");
      const url = detailUrlFor(event.id).href;
      try {
        if (navigator.share) {
          await navigator.share({ title: event.nameZh, text: `${event.nameZh} · ${formatDate(event.startDate, event.endDate)}`, url });
          feedback.textContent = "已打开系统分享";
        } else {
          await copyText(url);
          feedback.textContent = "展会链接已复制";
        }
      } catch (error) {
        if (error?.name !== "AbortError") {
          try {
            await copyText(url);
            feedback.textContent = "展会链接已复制";
          } catch {
            feedback.textContent = "暂时无法分享，请复制浏览器地址";
          }
        }
      }
    });
    if (options.focusMap !== false) focusEventOnMap(event);
  };

  const openVenue = (venue) => {
    closeSources();
    state.activeVenueId = venue.key;
    state.activeEventId = "";
    updateDetailUrl();
    detailPanel.classList.remove("is-open");
    detailPanel.setAttribute("aria-hidden", "true");
    const categorySummary = [...new Set(venue.events.map((event) => event.category))].join(" · ");
    const navigationUrl = navigationUrlFor(venue, venue.events[0]);
    const nearbyVenues = [...state.markers.values()]
      .map((item) => item.venue)
      .filter((item) => item.key !== venue.key && Math.hypot(item.lat - venue.lat, item.lng - venue.lng) < 0.012);
    venueContent.innerHTML = `
      <p class="venue-eyebrow">${venue.city === "上海" ? "SHANGHAI VENUE" : "EXHIBITION VENUE"} · ${escapeHtml(venue.district)}</p>
      <div class="venue-title-row"><span>${escapeHtml(venue.short)}</span><div><h2>${escapeHtml(venue.name)}</h2><p>${escapeHtml(venue.address)}</p></div></div>
      ${nearbyVenues.length ? `<div class="venue-nearby"><span>附近还有</span>${nearbyVenues.map((item) => `<button type="button" data-nearby-venue="${escapeHtml(item.key)}">${escapeHtml(item.name)} · ${item.events.length} 场</button>`).join("")}</div>` : ""}
      <a class="venue-transit" href="${escapeHtml(navigationUrl)}" target="_blank" rel="noreferrer"><span aria-hidden="true">↗</span><div><small>建议到场 · 点击导航</small><strong>${escapeHtml(venue.transit)}</strong></div></a>
      <div class="venue-stats"><div><strong>${venue.events.length}</strong><span>场展会</span></div><div><strong>${escapeHtml(categorySummary)}</strong><span>当前类型</span></div></div>
      <header class="venue-events-head"><span>近期排期</span><small>点击查看详情</small></header>
      <div class="venue-events">${venue.events.slice(0, 5).map((event) => `
        <button type="button" data-venue-event="${escapeHtml(event.id)}">
          <time>${formatDate(event.startDate, event.endDate)}</time>
          <span><strong>${escapeHtml(event.nameZh)}</strong><small>${escapeHtml(event.category)}</small></span><i>›</i>
        </button>`).join("")}</div>
      ${venue.events.length > 5 ? `<p class="venue-more">另有 ${venue.events.length - 5} 场，已在左下列表完整展示</p>` : ""}`;
    venueContent.querySelectorAll("[data-venue-event]").forEach((button) => button.addEventListener("click", () => {
      const event = venue.events.find((item) => item.id === button.dataset.venueEvent);
      if (event) openDetail(event);
    }));
    venueContent.querySelectorAll("[data-nearby-venue]").forEach((button) => button.addEventListener("click", () => {
      const nearbyVenue = state.markers.get(button.dataset.nearbyVenue)?.venue;
      if (nearbyVenue) openVenue(nearbyVenue);
    }));
    venuePanel.classList.add("is-open");
    venuePanel.setAttribute("aria-hidden", "false");
    document.body.classList.add("has-atlas-panel");
    highlightVenue(venue, { scroll: true });
    map.flyTo([venue.lat, venue.lng], Math.max(map.getZoom(), 12), { duration: 0.65 });
  };

  const closeDetail = (options = {}) => {
    detailPanel.classList.remove("is-open");
    detailPanel.setAttribute("aria-hidden", "true");
    state.activeEventId = "";
    if (options.updateUrl !== false) updateDetailUrl();
    syncAtlasPanelState();
    restoreHighlights();
  };

  const closeVenue = () => {
    venuePanel.classList.remove("is-open");
    venuePanel.setAttribute("aria-hidden", "true");
    state.activeVenueId = "";
    syncAtlasPanelState();
    restoreHighlights();
  };

  const syncFilterControls = () => {
    app.querySelectorAll("[data-region]").forEach((button) => button.classList.toggle("is-active", button.dataset.region === state.region));
    app.querySelectorAll("[data-category]").forEach((button) => button.classList.toggle("is-active", button.dataset.category === state.category));
    app.querySelector("[data-saved-toggle]").classList.toggle("is-active", state.savedOnly);
    dateFilter.value = state.dateMode;
    sortFilter.value = state.sortMode;
    dateStartInput.value = state.dateStart;
    dateEndInput.value = state.dateEnd;
    customDates.hidden = state.dateMode !== "custom";
    searchInput.value = state.query;
    const range = activeDateRange();
    dateError.textContent = range?.invalid ? "结束日期不能早于开始日期" : "";
  };

  const resetFilters = () => {
    state.category = "全部";
    state.query = "";
    state.dateMode = "all";
    state.dateStart = "";
    state.dateEnd = "";
    state.sortMode = "date";
    state.savedOnly = false;
    syncFilterControls();
    render();
    focusMap();
  };

  const render = () => {
    const events = filteredEvents();
    if (state.activeEventId && !events.some((event) => event.id === state.activeEventId)) closeDetail();
    venuePanel.classList.remove("is-open");
    venuePanel.setAttribute("aria-hidden", "true");
    state.activeVenueId = "";
    syncAtlasPanelState();
    state.markers.forEach(({ marker }) => marker.remove());
    state.markers.clear();
    state.eventRows.clear();
    list.textContent = "";

    const venues = venueGroups(events);
    venues.forEach((venue) => {
      const marker = L.marker([venue.lat, venue.lng], { icon: markerIcon(venue), title: `${venue.name} · ${venue.events.length} 场` }).addTo(map);
      marker.on("click", () => openVenue(venue));
      marker.on("mouseover", () => highlightVenue(venue, { markers: false }));
      marker.on("mouseout", restoreHighlights);
      state.markers.set(venue.key, { marker, venue });
    });

    events.forEach((event) => {
      const status = deriveEventStatus(event, currentDate());
      const button = document.createElement("button");
      button.className = "atlas-event-row";
      button.type = "button";
      button.dataset.eventId = event.id;
      button.dataset.venueKeys = [...venueKeysForEvent(event)].join("|");
      button.innerHTML = `<time>${formatDate(event.startDate, event.endDate)}</time><span><strong>${escapeHtml(event.nameZh)}</strong><small>${escapeHtml(event.city)} · ${escapeHtml(event.venue)} · <em class="row-status row-status--${status.key}">${status.label}</em></small></span><i aria-hidden="true">›</i>`;
      button.addEventListener("click", () => openDetail(event));
      button.addEventListener("mouseenter", () => highlightEvent(event));
      button.addEventListener("mouseleave", restoreHighlights);
      button.addEventListener("focus", () => highlightEvent(event));
      button.addEventListener("blur", restoreHighlights);
      state.eventRows.set(event.id, button);
      list.append(button);
    });

    if (!events.length) {
      const invalidRange = activeDateRange()?.invalid;
      const title = state.savedOnly ? "还没有收藏展会" : invalidRange ? "日期范围需要调整" : "没有匹配的展会";
      const message = state.savedOnly ? "收藏展会后，可以在这里集中查看。" : invalidRange ? "结束日期不能早于开始日期。" : "调整日期、地区、类别或搜索词后再试试。";
      list.innerHTML = `<div class="atlas-empty" role="status"><strong>${title}</strong><span>${message}</span><button type="button" data-reset-filters>${state.savedOnly ? "查看全部展会" : "清除筛选"}</button></div>`;
      list.querySelector("[data-reset-filters]").addEventListener("click", resetFilters);
    }
    app.querySelector("[data-visible-count]").textContent = events.length;
    app.querySelector("[data-city-count]").textContent = new Set(events.map((event) => event.city)).size;
    app.querySelector("[data-venue-count]").textContent = venues.length;
    app.querySelector("[data-list-label]").textContent = `${state.savedOnly ? "我的收藏" : state.region === "全部" ? "全球" : state.region} · ${state.category} · ${dateLabels[state.dateMode]}`;
    app.querySelector("[data-atlas-title]").textContent = `${state.region === "全部" ? "全球" : state.region}展览`;
    syncFilterControls();
    restoreHighlights();
  };

  app.querySelectorAll("[data-region]").forEach((button) => button.addEventListener("click", () => {
    state.region = button.dataset.region;
    state.savedOnly = false;
    render();
    focusMap();
  }));

  app.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
    state.category = button.dataset.category;
    render();
    focusMap();
  }));

  app.querySelector("[data-detail-close]").addEventListener("click", closeDetail);
  app.querySelector("[data-venue-close]").addEventListener("click", closeVenue);
  app.querySelector("[data-search-toggle]").addEventListener("click", () => {
    searchPanel.classList.add("is-open");
    searchPanel.setAttribute("aria-hidden", "false");
    searchInput.focus();
  });
  app.querySelector("[data-search-close]").addEventListener("click", () => {
    searchPanel.classList.remove("is-open");
    searchPanel.setAttribute("aria-hidden", "true");
  });
  searchInput.addEventListener("input", () => { state.query = searchInput.value; render(); });
  dateFilter.addEventListener("change", () => {
    state.dateMode = dateFilter.value;
    syncFilterControls();
    render();
    focusMap();
    if (state.dateMode === "custom") dateStartInput.focus();
  });
  sortFilter.addEventListener("change", () => {
    state.sortMode = sortFilter.value;
    render();
  });
  dateStartInput.addEventListener("change", () => {
    state.dateStart = dateStartInput.value;
    render();
    focusMap();
  });
  dateEndInput.addEventListener("change", () => {
    state.dateEnd = dateEndInput.value;
    render();
    focusMap();
  });
  app.querySelector("[data-date-reset]").addEventListener("click", () => {
    state.dateMode = "all";
    state.dateStart = "";
    state.dateEnd = "";
    syncFilterControls();
    render();
    focusMap();
  });
  app.querySelector("[data-saved-toggle]").addEventListener("click", (event) => {
    state.savedOnly = !state.savedOnly;
    render();
    focusMap();
  });
  app.querySelector("[data-sources-toggle]").addEventListener("click", () => {
    closeDetail();
    closeVenue();
    sourcesPanel.classList.add("is-open");
    sourcesPanel.setAttribute("aria-hidden", "false");
    syncAtlasPanelState();
  });
  app.querySelector("[data-sources-close]").addEventListener("click", closeSources);

  const renderSocialSignals = (signals) => {
    const items = signals?.items || [];
    const updatedAt = new Date(signals?.updatedAt);
    app.querySelector("[data-signal-updated]").textContent = Number.isNaN(updatedAt.getTime())
      ? "等待本地采集"
      : `${String(updatedAt.getMonth() + 1).padStart(2, "0")}/${String(updatedAt.getDate()).padStart(2, "0")} 更新`;
    socialSignalList.innerHTML = items.length
      ? items.slice(0, 8).map((item, index) => `
        <a class="atlas-signal" href="${escapeHtml(safeHttpUrl(item.url) || "#")}" target="_blank" rel="noreferrer">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.author)} · ${escapeHtml(item.publishedAt || "近期")}</small></div>
          <i>${Number(item.likes || 0).toLocaleString("zh-CN")} 赞</i>
        </a>`).join("")
      : '<div class="atlas-signal-empty">尚无社交热度线索</div>';
  };

  Promise.all([
    fetch("./data/exhibitions.json", { cache: "no-store" }).then((response) => response.json()),
    fetch("./data/exhibition-signals.json", { cache: "no-store" }).then((response) => response.json()).catch(() => null),
  ])
    .then(([data, signals]) => {
      state.events = (Array.isArray(data.events) ? data.events : [])
        .filter((event) => event && event.id && event.nameZh && event.startDate && event.endDate && Number.isFinite(event.lat) && Number.isFinite(event.lng))
        .map((event) => ({
          ...event,
          category: colors[event.category] ? event.category : "商贸",
          country: normalizeCountry(event.country, event.city),
        }));
      state.sources = data.sources || [];
      const checkedAt = new Date(data.checkedAt || data.collection?.checkedAt || data.updatedAt);
      const updateText = Number.isNaN(checkedAt.getTime())
        ? "更新时间待确认"
        : new Intl.DateTimeFormat("zh-CN", {
          timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
        }).format(checkedAt);
      const officialFiled = Number(data.collection?.officialFiled || 0);
      app.querySelector("[data-atlas-sync]").textContent = `上海备案主库 + 场馆核验 + 每日发现 · 检查 ${updateText} · 共 ${state.events.length} 场${officialFiled ? `（备案 ${officialFiled}）` : ""}`;
      app.querySelector("[data-source-list]").innerHTML = state.sources.map((source) => `<a href="${escapeHtml(safeHttpUrl(source.url) || "#")}" target="_blank" rel="noreferrer"><strong>${escapeHtml(source.name)}${source.automated ? " · 自动" : ""}</strong><span>${escapeHtml(source.scope)}${source.status ? ` · ${escapeHtml(source.status)}` : ""}</span><i>↗</i></a>`).join("");
      renderSocialSignals(signals);
      saveState();
      const requestedEventId = new URL(window.location.href).searchParams.get("event");
      const requestedEvent = state.events.find((event) => event.id === requestedEventId);
      if (requestedEvent) {
        state.region = requestedEvent.city === "上海"
          ? "上海"
          : String(requestedEvent.country).startsWith("中国")
            ? "中国"
            : ["亚洲", "欧洲", "美洲"].includes(requestedEvent.region) ? requestedEvent.region : "全部";
        state.category = "全部";
        state.dateMode = "all";
      } else if (requestedEventId) {
        updateDetailUrl();
      }
      render();
      if (requestedEvent) openDetail(requestedEvent, { updateUrl: false, scrollRow: true });
      else focusMap();
    })
    .catch(() => { list.innerHTML = `<div class="atlas-empty"><strong>展会数据加载失败</strong><span>请稍后刷新页面。</span></div>`; });
}
