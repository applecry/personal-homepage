(function exposeConventionRadarCore(root) {
  const hasPublishedGuests = (event) => Array.isArray(event.guests) && event.guests.length > 0;

  const guestCount = (events = []) => new Set(events.flatMap((event) => (event.guests || []).map((guest) => guest.name))).size;

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

  const conventionMatches = (event, state, today) => {
    if (event.endDate < today) return false;
    const query = String(state.query || "").trim().toLowerCase();
    const guests = (event.guests || []).map((guest) => `${guest.name} ${guest.role || ""}`).join(" ");
    const haystack = `${event.name} ${event.city} ${event.venue} ${event.type || ""} ${guests}`.toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (state.scope === "shanghai" && event.city !== "上海") return false;
    if (state.scope === "guests" && !hasPublishedGuests(event)) return false;
    if (state.scope === "weekend") {
      const start = startOfWeekend(today);
      const end = endOfWeekend(today);
      if (event.startDate > end || event.endDate < start) return false;
    }
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

  const guestsForWeekend = (events, today) => {
    const start = startOfWeekend(today);
    const end = endOfWeekend(today);
    return events.flatMap((event) => (event.guests || [])
      .filter((guest) => {
        const date = guest.date || event.startDate;
        return date >= start && date <= end;
      })
      .map((guest) => ({ ...guest, eventId: event.id, eventName: event.name, city: event.city })));
  };

  const core = {
    conventionMatches,
    endOfWeekend,
    guestCount,
    guestsForWeekend,
    hasPublishedGuests,
    sortConventions,
    startOfWeekend,
  };

  root.ConventionRadarCore = core;
  if (typeof module !== "undefined" && module.exports) module.exports = core;
}(typeof globalThis !== "undefined" ? globalThis : this));
