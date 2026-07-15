const app = document.querySelector("[data-atlas-app]");

if (app && window.L) {
  const colors = { 艺术: "#d45745", 科技: "#167d84", 游戏: "#245de8", 商贸: "#9b6a22" };
  const shanghaiVenues = [
    { id: "necc", match: "国家会展中心（上海）", name: "国家会展中心（上海）", short: "国展", district: "青浦区", address: "崧泽大道 333 号", transit: "地铁 2 / 17 号线 · 国家会展中心站", lat: 31.1889, lng: 121.2990 },
    { id: "sniec", match: "上海新国际博览中心", name: "上海新国际博览中心", short: "新博", district: "浦东新区", address: "龙阳路 2345 号", transit: "地铁 7 号线 · 花木路站", lat: 31.2117, lng: 121.5635 },
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
    savedOnly: false,
    saved: new Set(readSavedEvents()),
    markers: new Map(),
    activeVenueId: "",
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

  const escapeHtml = (value = "") => String(value).replace(/[&<>"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  })[character]);

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

  const filteredEvents = () => state.events.filter((event) => {
    const regionMatch = regionMatches(event);
    const categoryMatch = state.category === "全部" || event.category === state.category;
    const query = state.query.trim().toLowerCase();
    const aliases = Array.isArray(event.aliases) ? event.aliases.join(" ") : "";
    const haystack = `${event.name} ${event.nameZh} ${aliases} ${event.city} ${event.country} ${event.venue} ${event.category}`.toLowerCase();
    const queryMatch = !query || haystack.includes(query);
    const savedMatch = !state.savedOnly || state.saved.has(event.id);
    return regionMatch && categoryMatch && queryMatch && savedMatch;
  });

  const venuePointsFor = (event) => {
    if (event.city === "上海") {
      const matches = shanghaiVenues.filter((venue) => event.venue.includes(venue.match));
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
    html: `<button class="atlas-marker${active ? " is-active" : ""}" style="--marker:${venueColor(venue)}" aria-label="${escapeHtml(venue.name)}，${venue.events.length} 场展会"><span>${escapeHtml(venue.short)}</span><b>${venue.events.length}</b></button>`,
    iconSize: active ? [70, 70] : [58, 58],
    iconAnchor: active ? [35, 35] : [29, 29],
  });

  const saveState = () => {
    try {
      localStorage.setItem("exhibit-atlas-saved", JSON.stringify([...state.saved]));
    } catch {
      // The exhibition list remains usable when storage is blocked or full.
    }
    app.querySelector("[data-saved-count]").textContent = state.saved.size;
  };

  const openDetail = (event) => {
    venuePanel.classList.remove("is-open");
    venuePanel.setAttribute("aria-hidden", "true");
    const eventVenueKeys = new Set(venuePointsFor(event).map((point) => `${event.city}:${point.id}`));
    state.markers.forEach(({ marker, venue }) => marker.setIcon(markerIcon(venue, eventVenueKeys.has(venue.key))));
    const saved = state.saved.has(event.id);
    detailContent.innerHTML = `
      <p class="detail-category" style="--accent:${colors[event.category]}">${event.category} · ${event.region}</p>
      <p class="detail-date">${formatDate(event.startDate, event.endDate)} / ${event.startDate.slice(0, 4)}</p>
      <h2>${event.nameZh}</h2>
      <p class="detail-name">${event.name}</p>
      <p class="detail-summary">${event.summary}</p>
      <dl>
        <div><dt>城市</dt><dd>${event.city}，${event.country}</dd></div>
        <div><dt>场馆</dt><dd>${event.venue}</dd></div>
        <div><dt>适合</dt><dd>${event.visitorType}</dd></div>
        <div><dt>来源</dt><dd>${event.source}</dd></div>
        ${event.verification ? `<div><dt>核验</dt><dd>${event.verification}</dd></div>` : ""}
      </dl>
      <div class="detail-actions">
        <a href="${event.url}" target="_blank" rel="noreferrer">打开来源页面 ↗</a>
        <button type="button" data-save-event="${event.id}">${saved ? "已收藏" : "♡ 收藏"}</button>
      </div>`;
    detailPanel.classList.add("is-open");
    detailPanel.setAttribute("aria-hidden", "false");
    detailContent.querySelector("[data-save-event]").addEventListener("click", () => {
      if (state.saved.has(event.id)) state.saved.delete(event.id);
      else state.saved.add(event.id);
      saveState();
      openDetail(event);
    });
    map.flyTo([event.lat, event.lng], Math.max(map.getZoom(), 4), { duration: 0.65 });
  };

  const openVenue = (venue) => {
    state.activeVenueId = venue.key;
    detailPanel.classList.remove("is-open");
    detailPanel.setAttribute("aria-hidden", "true");
    state.markers.forEach(({ marker, venue: markerVenue }) => marker.setIcon(markerIcon(markerVenue, markerVenue.key === venue.key)));
    const categorySummary = [...new Set(venue.events.map((event) => event.category))].join(" · ");
    venueContent.innerHTML = `
      <p class="venue-eyebrow">${venue.city === "上海" ? "SHANGHAI VENUE" : "EXHIBITION VENUE"} · ${escapeHtml(venue.district)}</p>
      <div class="venue-title-row"><span>${escapeHtml(venue.short)}</span><div><h2>${escapeHtml(venue.name)}</h2><p>${escapeHtml(venue.address)}</p></div></div>
      <div class="venue-transit"><span aria-hidden="true">↗</span><div><small>建议到场</small><strong>${escapeHtml(venue.transit)}</strong></div></div>
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
    venuePanel.classList.add("is-open");
    venuePanel.setAttribute("aria-hidden", "false");
    map.flyTo([venue.lat, venue.lng], Math.max(map.getZoom(), 12), { duration: 0.65 });
  };

  const render = () => {
    const events = filteredEvents();
    venuePanel.classList.remove("is-open");
    venuePanel.setAttribute("aria-hidden", "true");
    state.activeVenueId = "";
    state.markers.forEach(({ marker }) => marker.remove());
    state.markers.clear();
    list.textContent = "";

    const venues = venueGroups(events);
    venues.forEach((venue) => {
      const marker = L.marker([venue.lat, venue.lng], { icon: markerIcon(venue), title: `${venue.name} · ${venue.events.length} 场` }).addTo(map);
      marker.on("click", () => openVenue(venue));
      state.markers.set(venue.key, { marker, venue });
    });

    events.forEach((event) => {
      const button = document.createElement("button");
      button.className = "atlas-event-row";
      button.type = "button";
      button.innerHTML = `<time>${formatDate(event.startDate, event.endDate)}</time><span><strong>${event.nameZh}</strong><small>${event.city} · ${event.venue} · ${event.category}</small></span><i aria-hidden="true">›</i>`;
      button.addEventListener("click", () => openDetail(event));
      list.append(button);
    });

    if (!events.length) {
      list.innerHTML = `<div class="atlas-empty"><strong>没有匹配的展会</strong><span>换一个地区、类别或搜索词试试。</span></div>`;
    }
    app.querySelector("[data-visible-count]").textContent = events.length;
    app.querySelector("[data-city-count]").textContent = new Set(events.map((event) => event.city)).size;
    app.querySelector("[data-venue-count]").textContent = venues.length;
    app.querySelector("[data-list-label]").textContent = `${state.savedOnly ? "我的收藏" : state.region === "全部" ? "全球" : state.region} · ${state.category}`;
    app.querySelector("[data-atlas-title]").textContent = `${state.region === "全部" ? "全球" : state.region}展览`;
  };

  app.querySelectorAll("[data-region]").forEach((button) => button.addEventListener("click", () => {
    state.region = button.dataset.region;
    state.savedOnly = false;
    app.querySelectorAll("[data-region]").forEach((item) => item.classList.toggle("is-active", item === button));
    render();
    focusMap();
  }));

  app.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
    state.category = button.dataset.category;
    app.querySelectorAll("[data-category]").forEach((item) => item.classList.toggle("is-active", item === button));
    render();
  }));

  app.querySelector("[data-detail-close]").addEventListener("click", () => {
    detailPanel.classList.remove("is-open");
    detailPanel.setAttribute("aria-hidden", "true");
    state.markers.forEach(({ marker, venue }) => marker.setIcon(markerIcon(venue)));
  });
  app.querySelector("[data-venue-close]").addEventListener("click", () => {
    venuePanel.classList.remove("is-open");
    venuePanel.setAttribute("aria-hidden", "true");
    state.activeVenueId = "";
    state.markers.forEach(({ marker, venue }) => marker.setIcon(markerIcon(venue)));
  });
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
  app.querySelector("[data-saved-toggle]").addEventListener("click", (event) => {
    state.savedOnly = !state.savedOnly;
    event.currentTarget.classList.toggle("is-active", state.savedOnly);
    render();
  });
  app.querySelector("[data-sources-toggle]").addEventListener("click", () => {
    sourcesPanel.classList.add("is-open");
    sourcesPanel.setAttribute("aria-hidden", "false");
  });
  app.querySelector("[data-sources-close]").addEventListener("click", () => {
    sourcesPanel.classList.remove("is-open");
    sourcesPanel.setAttribute("aria-hidden", "true");
  });

  const renderSocialSignals = (signals) => {
    const items = signals?.items || [];
    const updatedAt = new Date(signals?.updatedAt);
    app.querySelector("[data-signal-updated]").textContent = Number.isNaN(updatedAt.getTime())
      ? "等待本地采集"
      : `${String(updatedAt.getMonth() + 1).padStart(2, "0")}/${String(updatedAt.getDate()).padStart(2, "0")} 更新`;
    socialSignalList.innerHTML = items.length
      ? items.slice(0, 8).map((item, index) => `
        <a class="atlas-signal" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
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
      app.querySelector("[data-atlas-sync]").textContent = `官方基线 + 每日自动发现 · 检查 ${updateText} · 共 ${state.events.length} 场`;
      app.querySelector("[data-source-list]").innerHTML = state.sources.map((source) => `<a href="${source.url}" target="_blank" rel="noreferrer"><strong>${source.name}${source.automated ? " · 自动" : ""}</strong><span>${source.scope}${source.status ? ` · ${source.status}` : ""}</span><i>↗</i></a>`).join("");
      renderSocialSignals(signals);
      saveState();
      render();
      focusMap();
    })
    .catch(() => { list.innerHTML = `<div class="atlas-empty"><strong>展会数据加载失败</strong><span>请稍后刷新页面。</span></div>`; });
}
