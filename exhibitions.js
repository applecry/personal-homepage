const app = document.querySelector("[data-atlas-app]");

if (app && window.L) {
  const colors = { 艺术: "#d45745", 科技: "#167d84", 游戏: "#245de8", 商贸: "#9b6a22" };
  const state = {
    events: [],
    sources: [],
    region: "上海",
    category: "全部",
    query: "",
    savedOnly: false,
    saved: new Set(JSON.parse(localStorage.getItem("exhibit-atlas-saved") || "[]")),
    markers: new Map(),
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
  const searchPanel = app.querySelector("[data-search-panel]");
  const searchInput = app.querySelector("[data-search-input]");
  const sourcesPanel = app.querySelector("[data-sources-panel]");

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

  const focusMap = () => {
    const views = {
      上海: [[31.2304, 121.4737], 10.4],
      中国: [[34.4, 104.2], 4],
      全部: [[28, 35], 2.35],
      亚洲: [[32, 100], 3.2],
      欧洲: [[51, 12], 4],
      美洲: [[24, -82], 3],
    };
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
    const haystack = `${event.name} ${event.nameZh} ${event.city} ${event.country} ${event.venue} ${event.category}`.toLowerCase();
    const queryMatch = !query || haystack.includes(query);
    const savedMatch = !state.savedOnly || state.saved.has(event.id);
    return regionMatch && categoryMatch && queryMatch && savedMatch;
  });

  const markerIcon = (event, active = false) => L.divIcon({
    className: "atlas-marker-wrap",
    html: `<button class="atlas-marker${active ? " is-active" : ""}" style="--marker:${colors[event.category]}" aria-label="${event.nameZh}"><span>${event.category.slice(0, 1)}</span></button>`,
    iconSize: active ? [52, 52] : [38, 38],
    iconAnchor: active ? [26, 26] : [19, 19],
  });

  const saveState = () => {
    localStorage.setItem("exhibit-atlas-saved", JSON.stringify([...state.saved]));
    app.querySelector("[data-saved-count]").textContent = state.saved.size;
  };

  const openDetail = (event) => {
    state.markers.forEach(({ marker, event: markerEvent }) => marker.setIcon(markerIcon(markerEvent, markerEvent.id === event.id)));
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

  const render = () => {
    const events = filteredEvents();
    state.markers.forEach(({ marker }) => marker.remove());
    state.markers.clear();
    list.textContent = "";

    events.forEach((event) => {
      const marker = L.marker([event.lat, event.lng], { icon: markerIcon(event), title: event.nameZh }).addTo(map);
      marker.on("click", () => openDetail(event));
      state.markers.set(event.id, { marker, event });

      const button = document.createElement("button");
      button.className = "atlas-event-row";
      button.type = "button";
      button.innerHTML = `<time>${formatDate(event.startDate, event.endDate)}</time><span><strong>${event.nameZh}</strong><small>${event.city} · ${event.category}</small></span><i aria-hidden="true">›</i>`;
      button.addEventListener("click", () => openDetail(event));
      list.append(button);
    });

    if (!events.length) {
      list.innerHTML = `<div class="atlas-empty"><strong>没有匹配的展会</strong><span>换一个地区、类别或搜索词试试。</span></div>`;
    }
    app.querySelector("[data-visible-count]").textContent = events.length;
    app.querySelector("[data-city-count]").textContent = new Set(events.map((event) => event.city)).size;
    app.querySelector("[data-venue-count]").textContent = new Set(events.map((event) => event.venue)).size;
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
    state.markers.forEach(({ marker, event }) => marker.setIcon(markerIcon(event)));
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

  fetch("./data/exhibitions.json", { cache: "no-store" })
    .then((response) => response.json())
    .then((data) => {
      state.events = (data.events || []).map((event) => ({ ...event, country: normalizeCountry(event.country, event.city) }));
      state.sources = data.sources || [];
      const updatedAt = new Date(data.updatedAt);
      const updateText = Number.isNaN(updatedAt.getTime()) ? "更新时间待确认" : `${String(updatedAt.getMonth() + 1).padStart(2, "0")}/${String(updatedAt.getDate()).padStart(2, "0")} ${String(updatedAt.getHours()).padStart(2, "0")}:${String(updatedAt.getMinutes()).padStart(2, "0")}`;
      app.querySelector("[data-atlas-sync]").textContent = `上海自动采集 · 内容更新 ${updateText}`;
      app.querySelector("[data-source-list]").innerHTML = state.sources.map((source) => `<a href="${source.url}" target="_blank" rel="noreferrer"><strong>${source.name}${source.automated ? " · 自动" : ""}</strong><span>${source.scope}${source.status ? ` · ${source.status}` : ""}</span><i>↗</i></a>`).join("");
      saveState();
      render();
    })
    .catch(() => { list.innerHTML = `<div class="atlas-empty"><strong>展会数据加载失败</strong><span>请稍后刷新页面。</span></div>`; });
}
