(function exposeConventionRadarCore(root) {
  const hasPublishedGuests = (event) => Array.isArray(event.guests) && event.guests.length > 0;

  const guestCount = (events = []) => new Set(events.flatMap((event) => (event.guests || []).map((guest) => guest.name))).size;

  const addDays = (value, days) => {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const endOfWeekend = (today) => {
    const date = new Date(`${today}T00:00:00Z`);
    const weekday = date.getUTCDay();
    const daysToSaturday = weekday === 0 ? -1 : 6 - weekday;
    date.setUTCDate(date.getUTCDate() + daysToSaturday + 1);
    return date.toISOString().slice(0, 10);
  };

  const startOfWeekend = (today) => {
    const end = new Date(`${endOfWeekend(today)}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() - 1);
    return end.toISOString().slice(0, 10);
  };

  const dateWindow = (today, mode = "all") => {
    if (mode === "today") return { start: today, end: today };
    if (mode === "weekend") return { start: startOfWeekend(today), end: endOfWeekend(today) };
    if (mode === "month") return { start: today, end: addDays(today, 29) };
    return null;
  };

  const overlapsWindow = (event, window) => !window
    || (event.startDate <= window.end && event.endDate >= window.start);

  const isSaved = (eventId, savedIds = []) => {
    if (savedIds instanceof Set) return savedIds.has(eventId);
    return Array.isArray(savedIds) && savedIds.includes(eventId);
  };

  const normalizeLocationTerm = (value = "") => String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/gu, "")
    .replace(/特别行政区$|自治县$|地区$|市$|县$|区$|省$/u, "");

  const locationMatches = (event, state = {}) => {
    if (state.province && state.province !== "all" && event.province !== state.province) return false;
    const cityQuery = normalizeLocationTerm(state.cityQuery || "");
    if (cityQuery && !normalizeLocationTerm(event.city).includes(cityQuery)) return false;
    if (state.city && state.city !== "all" && event.city !== state.city) return false;
    return true;
  };

  const uniqueTicketSources = (sources = []) => {
    const unique = new Map();
    for (const source of sources) {
      const key = `${String(source.platform || "").trim().toLowerCase()}|${String(source.label || "").trim().toLowerCase()}`;
      const current = unique.get(key);
      if (!current || (!current.primary && source.primary)) unique.set(key, source);
    }
    return [...unique.values()];
  };

  const conventionMatches = (event, state, today) => {
    if (event.endDate < today) return false;
    const query = String(state.query || "").trim().toLowerCase();
    const guests = (event.guests || []).map((guest) => `${guest.name} ${guest.role || ""}`).join(" ");
    const haystack = `${event.name} ${event.province || ""} ${event.city} ${event.venue} ${event.type || ""} ${guests}`.toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (!locationMatches(event, state)) return false;
    if (state.scope === "guests" && !hasPublishedGuests(event)) return false;
    if (state.scope === "pending" && hasPublishedGuests(event)) return false;
    if (state.scope === "saved" && !isSaved(event.id, state.savedIds)) return false;
    if (!overlapsWindow(event, dateWindow(today, state.dateMode))) return false;
    return true;
  };

  const sortConventions = (events, mode = "date") => [...events].sort((a, b) => {
    if (mode === "guests") {
      const difference = (b.guests?.length || 0) - (a.guests?.length || 0);
      if (difference) return difference;
    }
    if (mode === "updated") {
      const difference = String(b.guestUpdatedAt || "").localeCompare(String(a.guestUpdatedAt || ""));
      if (difference) return difference;
    }
    return String(a.startDate).localeCompare(String(b.startDate)) || String(a.name).localeCompare(String(b.name), "zh-CN");
  });

  const progressiveSlice = (events = [], visibleCount = 24) => {
    const count = Math.max(1, Number(visibleCount) || 24);
    const items = events.slice(0, count);
    return {
      items,
      shown: items.length,
      remaining: Math.max(0, events.length - items.length),
      total: events.length,
    };
  };

  const guestsForWindow = (events, start, end) => {
    return events.flatMap((event) => (event.guests || [])
      .filter((guest) => {
        const date = guest.date || event.startDate;
        return date >= start && date <= end;
      })
      .map((guest) => ({ ...guest, eventId: event.id, eventName: event.name, city: event.city })));
  };

  const guestsForWeekend = (events, today) => {
    return guestsForWindow(events, startOfWeekend(today), endOfWeekend(today));
  };

  const findNewGuests = (event, previousNames) => {
    if (!Array.isArray(previousNames)) return [];
    const previous = new Set(previousNames);
    return (event.guests || []).filter((guest) => !previous.has(guest.name));
  };

  const core = {
    addDays,
    conventionMatches,
    dateWindow,
    endOfWeekend,
    findNewGuests,
    guestCount,
    guestsForWindow,
    guestsForWeekend,
    hasPublishedGuests,
    isSaved,
    locationMatches,
    normalizeLocationTerm,
    overlapsWindow,
    progressiveSlice,
    sortConventions,
    startOfWeekend,
    uniqueTicketSources,
  };

  root.ConventionRadarCore = core;
  if (typeof module !== "undefined" && module.exports) module.exports = core;
}(typeof globalThis !== "undefined" ? globalThis : this));
