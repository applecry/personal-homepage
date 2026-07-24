(function exposeExhibitionAtlasCore(root) {
  const parseIsoDate = (value) => new Date(`${value}T00:00:00Z`);
  const formatIsoDate = (value) => value.toISOString().slice(0, 10);

  const addDays = (value, amount) => {
    const date = parseIsoDate(value);
    date.setUTCDate(date.getUTCDate() + amount);
    return formatIsoDate(date);
  };

  const todayInTimeZone = (now = new Date(), timeZone = "Asia/Shanghai") => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  };

  const daysBetween = (earlier, later) => Math.round((
    Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)
  ) / 86400000);

  const signalFreshness = (signalsUpdatedAt, catalogUpdatedAt, options = {}) => {
    const timeZone = options.timeZone || "Asia/Shanghai";
    const maxAgeDays = Number.isFinite(options.maxAgeDays) ? options.maxAgeDays : 7;
    const signalDateValue = new Date(signalsUpdatedAt);
    const catalogDateValue = new Date(catalogUpdatedAt);
    const signalValid = !Number.isNaN(signalDateValue.getTime());
    const catalogValid = !Number.isNaN(catalogDateValue.getTime());

    if (!signalValid) {
      return {
        state: "missing",
        stale: true,
        reason: "missing",
        signalDate: "",
        catalogDate: catalogValid ? todayInTimeZone(catalogDateValue, timeZone) : "",
        ageDays: null,
        lagDays: null,
      };
    }

    const signalDate = todayInTimeZone(signalDateValue, timeZone);
    const catalogDate = catalogValid ? todayInTimeZone(catalogDateValue, timeZone) : "";
    const today = todayInTimeZone(options.now || new Date(), timeZone);
    const ageDays = Math.max(0, daysBetween(signalDate, today));
    const lagDays = catalogDate ? daysBetween(signalDate, catalogDate) : null;
    const reason = lagDays > 0 ? "behind-catalog" : ageDays > maxAgeDays ? "age" : "current";

    return {
      state: reason === "current" ? "current" : "stale",
      stale: reason !== "current",
      reason,
      signalDate,
      catalogDate,
      ageDays,
      lagDays,
    };
  };

  const dateRangeFor = (mode, today, customStart = "", customEnd = "") => {
    if (!mode || mode === "all") return null;
    if (mode === "ongoing") return { start: today, end: today };
    if (mode === "weekend") {
      const weekday = parseIsoDate(today).getUTCDay();
      const daysToSaturday = weekday === 0 ? -1 : 6 - weekday;
      const start = addDays(today, daysToSaturday);
      return { start, end: addDays(start, 1) };
    }
    if (mode === "month") return { start: today, end: addDays(today, 29) };
    if (mode === "custom") {
      const start = customStart || "0000-01-01";
      const end = customEnd || "9999-12-31";
      return { start, end, invalid: Boolean(customStart && customEnd && customEnd < customStart) };
    }
    return null;
  };

  const eventMatchesDate = (event, range) => {
    if (!range) return true;
    if (range.invalid) return false;
    return event.startDate <= range.end && event.endDate >= range.start;
  };

  const isCurrentOrUpcoming = (event, today) => Boolean(
    event?.endDate && today && event.endDate >= today
  );

  const currentAndUpcomingEvents = (events = [], today) => (
    events.filter((event) => isCurrentOrUpcoming(event, today))
  );

  const eventMatchesDefaultScope = (event, today, dateMode = "all") => (
    dateMode === "custom" || isCurrentOrUpcoming(event, today)
  );

  const calendarDaysForMonth = (monthKey) => {
    const [year, month] = String(monthKey).split("-").map(Number);
    if (!year || !month || month < 1 || month > 12) return [];
    const first = new Date(Date.UTC(year, month - 1, 1));
    const mondayOffset = (first.getUTCDay() + 6) % 7;
    const start = new Date(first);
    start.setUTCDate(start.getUTCDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      return {
        date: formatIsoDate(date),
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === month - 1,
      };
    });
  };

  const eventsOnDate = (events, date) => events.filter((event) => (
    event.startDate <= date && event.endDate >= date
  ));

  const sortEvents = (events, mode = "date") => [...events].sort((a, b) => {
    if (mode === "featured") {
      const featuredDifference = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
      if (featuredDifference) return featuredDifference;
    }
    if (mode === "name") return String(a.nameZh || a.name).localeCompare(String(b.nameZh || b.name), "zh-CN");
    return String(a.startDate).localeCompare(String(b.startDate)) || String(a.nameZh || a.name).localeCompare(String(b.nameZh || b.name), "zh-CN");
  });

  const deriveEventStatus = (event, today) => {
    const explicit = `${event.status || ""} ${event.statusNote || ""}`.toLowerCase();
    if (/取消|cancel/.test(explicit)) return { key: "cancelled", label: "已取消" };
    if (/延期|postpon|改期|reschedul|变更|changed/.test(explicit)) return { key: "changed", label: "排期有变" };
    if (event.endDate < today) return { key: "ended", label: "已结束" };
    if (event.startDate <= today && event.endDate >= today) return { key: "ongoing", label: "进行中" };
    if (event.startDate <= addDays(today, 7)) return { key: "soon", label: "即将开始" };
    return { key: "upcoming", label: "已排期" };
  };

  const escapeIcsText = (value = "") => String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");

  const utf8Encoder = new TextEncoder();

  const foldIcsLine = (line = "") => {
    const folded = [];
    let current = "";
    let currentBytes = 0;

    for (const character of String(line)) {
      const characterBytes = utf8Encoder.encode(character).length;
      if (current && currentBytes + characterBytes > 75) {
        folded.push(current);
        current = ` ${character}`;
        currentBytes = 1 + characterBytes;
      } else {
        current += character;
        currentBytes += characterBytes;
      }
    }

    folded.push(current);
    return folded;
  };

  const buildIcs = (event, options = {}) => {
    const url = options.url || event.url || event.sourceUrl || "";
    const now = options.now || new Date();
    const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const description = [event.summary, url ? `官方信息：${url}` : ""].filter(Boolean).join("\n");
    const explicit = `${event.status || ""} ${event.statusNote || ""}`.toLowerCase();
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Exhibit Atlas//CN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(event.id)}@lijunearth.online`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${event.startDate.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${addDays(event.endDate, 1).replace(/-/g, "")}`,
      `SUMMARY:${escapeIcsText(event.nameZh || event.name)}`,
      `LOCATION:${escapeIcsText([event.venue, event.city].filter(Boolean).join("，"))}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
    ];
    if (url) lines.push(`URL:${url}`);
    if (/取消|cancel/.test(explicit)) lines.push("STATUS:CANCELLED");
    else if (/延期|postpon|改期|reschedul|变更|changed/.test(explicit)) lines.push("STATUS:TENTATIVE");
    lines.push("END:VEVENT", "END:VCALENDAR", "");
    return lines.flatMap(foldIcsLine).join("\r\n");
  };

  const core = {
    addDays,
    buildIcs,
    calendarDaysForMonth,
    currentAndUpcomingEvents,
    dateRangeFor,
    deriveEventStatus,
    escapeIcsText,
    eventMatchesDefaultScope,
    eventsOnDate,
    eventMatchesDate,
    foldIcsLine,
    isCurrentOrUpcoming,
    signalFreshness,
    sortEvents,
    todayInTimeZone,
  };

  root.ExhibitionAtlasCore = core;
  if (typeof module !== "undefined" && module.exports) module.exports = core;
}(typeof globalThis !== "undefined" ? globalThis : this));
