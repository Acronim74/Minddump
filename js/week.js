    // Week screen (SPEC §4). Optional view, toggled in Settings. Shows the
    // 7 days of the current week. Week boundaries follow `state.weekStartsOn`
    // (0 = Sunday, 1 = Monday; default Monday per SPEC §11).
    //
    // Visibility rules mirror the Month screen:
    //   - tasks/events are shown by their `date`
    //   - notes are shown only when they have no `collectionId`
    //   - forgotten entries are hidden

    const WEEKDAY_SHORT = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];

    function parseIsoDate(s) {
      // Parse YYYY-MM-DD as a local calendar date (Date(y, m-1, d) avoids
      // the UTC shift that `new Date("YYYY-MM-DD")` would apply).
      const y = parseInt(s.slice(0, 4), 10);
      const m = parseInt(s.slice(5, 7), 10) - 1;
      const d = parseInt(s.slice(8, 10), 10);
      return new Date(y, m, d);
    }

    function toIsoDate(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return y + "-" + m + "-" + day;
    }

    function getWeekStartDate(baseDateStr, weekStartsOn) {
      const base = parseIsoDate(baseDateStr);
      const dow = base.getDay(); // 0..6 (Sun..Sat)
      const start = weekStartsOn === 0 ? 0 : 1;
      let delta = dow - start;
      if (delta < 0) delta += 7;
      base.setDate(base.getDate() - delta);
      return base;
    }

    function getWeekDates(baseDateStr, weekStartsOn) {
      const start = getWeekStartDate(baseDateStr, weekStartsOn);
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        days.push(d);
      }
      return days;
    }

    function formatWeekRange(days) {
      if (days.length === 0) return "";
      const first = days[0];
      const last = days[days.length - 1];
      const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
      if (sameMonth) {
        return (
          first.getDate() +
          "–" +
          last.getDate() +
          " " +
          first.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
        );
      }
      return (
        first.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) +
        " – " +
        last.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
      );
    }

    async function renderWeekScreen() {
      const offset = state.weekOffset || 0;
      // Base date = today + offset weeks. We shift currentDate so the week
      // containing it is the one displayed.
      const todayIso = state.currentDate;
      const base = parseIsoDate(todayIso);
      base.setDate(base.getDate() + offset * 7);
      const baseIso = toIsoDate(base);

      const weekStartsOn = state.weekStartsOn === 0 ? 0 : 1;
      const days = getWeekDates(baseIso, weekStartsOn);

      const titleEl = document.getElementById("week-title");
      const rangeEl = document.getElementById("week-range");
      if (titleEl) {
        if (offset === 0) titleEl.textContent = "Эта неделя";
        else if (offset === -1) titleEl.textContent = "Прошлая неделя";
        else if (offset === 1) titleEl.textContent = "Следующая неделя";
        else titleEl.textContent = offset > 0 ? "+" + offset + " нед." : offset + " нед.";
      }
      if (rangeEl) rangeEl.textContent = formatWeekRange(days);

      const allEntries = await dbGetAll("entries");
      const today = todayStr();

      const grid = document.getElementById("week-days-grid");
      grid.innerHTML = days
        .map(function (d) { return renderWeekDayBlock(d, allEntries, today); })
        .join("");

      bindWeekDayClicks(grid);
    }

    function renderWeekDayBlock(dateObj, allEntries, todayIso) {
      const iso = toIsoDate(dateObj);
      const dow = dateObj.getDay();
      const weekdayLabel = WEEKDAY_SHORT[dow];
      const isToday = iso === todayIso;

      // Same filter as Month: by date, notes only when uncollected, hide
      // forgotten.
      const dayEntries = allEntries.filter(function (e) {
        if (e.status === "forgotten") return false;
        if (e.date !== iso) return false;
        if (e.type === "note" && e.collectionId) return false;
        return true;
      });

      let taskCount = 0, eventCount = 0, noteCount = 0;
      dayEntries.forEach(function (e) {
        if (e.type === "task") taskCount++;
        else if (e.type === "event") eventCount++;
        else if (e.type === "note") noteCount++;
      });

      const isEmpty = dayEntries.length === 0;

      const countsHtml =
        '<div class="week-day-counts">' +
        (taskCount ? '<span class="week-day-count">· ' + taskCount + "</span>" : "") +
        (eventCount ? '<span class="week-day-count">○ ' + eventCount + "</span>" : "") +
        (noteCount ? '<span class="week-day-count">— ' + noteCount + "</span>" : "") +
        "</div>";

      const entriesHtml = isEmpty
        ? '<div class="week-day-empty-hint">—</div>'
        : '<div class="week-day-entries">' +
          dayEntries
            .sort(compareTodayEntries)
            .map(function (e) { return renderWeekEntryRow(e); })
            .join("") +
          "</div>";

      return (
        '<div class="week-day-block' +
        (isToday ? " is-today" : "") +
        (isEmpty ? " is-empty" : "") +
        '" data-date="' + iso + '">' +
        '<div class="week-day-header">' +
        '<button type="button" class="week-day-num-badge' +
        (isEmpty ? " is-empty" : "") +
        '" data-date="' + iso + '">' + dateObj.getDate() + "</button>" +
        '<span class="week-day-weekday">' + weekdayLabel + "</span>" +
        countsHtml +
        "</div>" +
        entriesHtml +
        "</div>"
      );
    }

    function renderWeekEntryRow(entry) {
      const sym = getSymbolByEntry(entry);
      const statusClass = statusClassFor(entry);
      const timeHtml =
        entry.type === "event" && entry.time
          ? '<span class="week-entry-time">' + escapeHtml(entry.time) + "</span>"
          : "";
      return (
        '<div class="week-entry-row ' + statusClass + '" data-id="' + entry.id + '">' +
        '<span class="week-entry-symbol" style="color:' + sym.color + '">' + sym.char + "</span>" +
        timeHtml +
        '<span class="week-entry-text">' + escapeHtml(entry.text) + "</span>" +
        renderAddendaBadge(entry) +
        "</div>"
      );
    }

    function bindWeekDayClicks(grid) {
      grid.onclick = async function (event) {
        // Addenda badge — handled globally, ignore here.
        if (event.target.closest(".js-addenda-open")) return;

        // Day-number badge: jump to Today on that date.
        const badge = event.target.closest(".week-day-num-badge");
        if (badge && badge.dataset.date) {
          state.currentDate = badge.dataset.date;
          switchToScreen("today");
          await renderTodayScreen();
          return;
        }

        // Entry row: open edit modal.
        const row = event.target.closest(".week-entry-row");
        if (row) {
          const entry = await dbGet("entries", row.dataset.id);
          if (!entry) return;
          openModal(entry.date, entry, null);
        }
      };
    }

    function bindWeekNavEvents() {
      const prev = document.getElementById("week-prev");
      const next = document.getElementById("week-next");
      if (prev) {
        prev.addEventListener("click", async function () {
          state.weekOffset = (state.weekOffset || 0) - 1;
          await renderWeekScreen();
        });
      }
      if (next) {
        next.addEventListener("click", async function () {
          state.weekOffset = (state.weekOffset || 0) + 1;
          await renderWeekScreen();
        });
      }
    }

    // Show/hide the Week nav button in both sidebar and bottom nav.
    function applyShowWeekScreen(show) {
      state.showWeekScreen = !!show;
      document.querySelectorAll("[data-week-btn]").forEach(function (btn) {
        btn.style.display = show ? "" : "none";
      });
      // If week was hidden while it was active, fall back to Today.
      if (!show) {
        const weekScreen = document.getElementById("screen-week");
        if (weekScreen && weekScreen.classList.contains("active")) {
          switchToScreen("today");
        }
      }
    }
