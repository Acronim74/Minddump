    async function renderTodayScreen() {
      const screen = document.getElementById("screen-today");
      const rawList = await dbGetByIndex("entries", "date", state.currentDate);

      // На экране «Сегодня» показываем:
      //  - задачи и события в активных статусах
      //  - заметки без коллекции (заметки в коллекции живут только в коллекции)
      //  - записи, уехавшие в Полгода (status="future") пока исключаем — это временное
      //    поведение до Фазы 3, когда Полгода будет фильтроваться по `month`.
      //  - забытые (status="forgotten") не показываем в активных списках.
      const list = rawList.filter(function (e) {
        if (e.status === "future") return false;
        if (e.status === "forgotten") return false;
        if (e.type === "note" && e.collectionId) return false;
        return true;
      });

      list.sort(compareTodayEntries);

      const rowsHtml = list.map(function (entry) {
        const sym = getSymbolByEntry(entry);
        const statusClass = statusClassFor(entry);
        const priorityHtml = renderPriorityHtml(entry);
        // Only tasks have a "done" state (SPEC §2).
        const doneBtn = entry.type === "task"
          ? '<button type="button" class="entry-action js-toggle-done">✓</button>'
          : "";
        return (
          '<div class="entry-item ' + statusClass + '" data-id="' + entry.id + '">' +
            priorityHtml +
            '<span class="entry-symbol" style="color:' + sym.color + '">' + sym.char + "</span>" +
            '<span class="entry-text">' + escapeHtml(entry.text) + "</span>" +
            doneBtn +
            '<button type="button" class="entry-action js-entry-menu">···</button>' +
          "</div>"
        );
      }).join("");

      const emptyHtml =
        '<div class="empty-state">' +
          "<h3>Нет записей на сегодня</h3>" +
          "<p>Нажмите + чтобы добавить первую</p>" +
        "</div>";

      const yesterdayDate = addDays(state.currentDate, -1);
      const yesterdayOpen = await countOpenOnDate(yesterdayDate);
      const yesterdayBanner =
        yesterdayOpen > 0
          ? '<div class="today-banner" id="today-yesterday-banner" data-date="' +
            yesterdayDate +
            '">⚠ Вчера осталось ' +
            yesterdayOpen +
            " " +
            pluralOpen(yesterdayOpen) +
            "</div>"
          : "";

      screen.innerHTML =
        '<header class="today-header">' +
          "<div>" +
            '<h1 class="today-title">Сегодня</h1>' +
            '<div class="today-date-subtitle">' + escapeHtml(formatDate(state.currentDate)) + "</div>" +
          "</div>" +
          '<button class="add-btn" id="today-add-btn" type="button" aria-label="Добавить запись">+</button>' +
        "</header>" +
        yesterdayBanner +
        '<section class="entries-list">' + (rowsHtml || emptyHtml) + "</section>";

      bindTodayActions();
      renderDayNav();
    }

    function pluralOpen(n) {
      if (n % 10 === 1 && n % 100 !== 11) return "невыполненная";
      if ([2, 3, 4].indexOf(n % 10) !== -1 && [12, 13, 14].indexOf(n % 100) === -1) return "невыполненных";
      return "невыполненных";
    }

    // Comparator for entries inside a single day on Today/Week screens.
    // Groups: events first (ordered by time, no-time last), then tasks, then notes.
    // Within a group entries fall back to createdAt ascending.
    function compareTodayEntries(a, b) {
      const groupOrder = { event: 0, task: 1, note: 2 };
      const ga = groupOrder[a.type] != null ? groupOrder[a.type] : 3;
      const gb = groupOrder[b.type] != null ? groupOrder[b.type] : 3;
      if (ga !== gb) return ga - gb;

      if (a.type === "event") {
        // Events with time come first sorted by HH:MM; events without time trail.
        const ta = a.time ? parseInt(a.time.replace(":", ""), 10) : 10000;
        const tb = b.time ? parseInt(b.time.replace(":", ""), 10) : 10000;
        if (ta !== tb) return ta - tb;
      }

      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    }

    function bindTodayActions() {
      const addBtn = document.getElementById("today-add-btn");
      if (addBtn) {
        addBtn.onclick = function () {
          openModal(state.currentDate, null, null);
        };
      }

      const yesterdayBanner = document.getElementById("today-yesterday-banner");
      if (yesterdayBanner) {
        yesterdayBanner.onclick = async function () {
          const targetDate = yesterdayBanner.getAttribute("data-date");
          if (!targetDate) return;
          state.currentDate = targetDate;
          await renderTodayScreen();
        };
      }

      const toggleButtons = document.querySelectorAll(".js-toggle-done");
      toggleButtons.forEach(function (button) {
        button.onclick = async function (event) {
          const row = event.currentTarget.closest(".entry-item");
          if (!row) return;
          const entryId = row.getAttribute("data-id");
          const entry = await dbGet("entries", entryId);
          if (!entry) return;
          entry.status = entry.status === "done" ? "open" : "done";
          entry.updatedAt = new Date().toISOString();
          await dbPut("entries", entry);
          await renderTodayScreen();
        };
      });

      const menuButtons = document.querySelectorAll(".js-entry-menu");
      menuButtons.forEach(function (button) {
        button.onclick = function (event) {
          const row = event.currentTarget.closest(".entry-item");
          if (!row) return;
          openEntryMenu(row.getAttribute("data-id"));
        };
      });
    }

    async function renderDayNav() {
      const label = document.getElementById("day-nav-label");
      const prevBtn = document.getElementById("day-prev");
      if (label) {
        label.textContent = formatNavDate(state.currentDate);
      }
      if (prevBtn) {
        const previousDate = addDays(state.currentDate, -1);
        const hasOpen = await hasOpenOnDate(previousDate);
        prevBtn.classList.toggle("alert", hasOpen);
      }
    }

    function bindDayNavEvents() {
      const prevBtn = document.getElementById("day-prev");
      const nextBtn = document.getElementById("day-next");

      prevBtn.addEventListener("click", async function () {
        state.currentDate = addDays(state.currentDate, -1);
        await renderTodayScreen();
      });

      nextBtn.addEventListener("click", async function () {
        state.currentDate = addDays(state.currentDate, 1);
        await renderTodayScreen();
      });
    }

    function switchToScreen(target) {
      const allNavBtns = document.querySelectorAll(".nav-btn, .sidebar-btn");
      const screens = {
        today: document.getElementById("screen-today"),
        month: document.getElementById("screen-month"),
        future: document.getElementById("screen-future"),
        collections: document.getElementById("screen-collections"),
        settings: document.getElementById("screen-settings")
      };
      const dayNav = document.getElementById("day-nav");

      allNavBtns.forEach(function (btn) {
        btn.classList.toggle("active", btn.getAttribute("data-screen") === target);
      });
      Object.keys(screens).forEach(function (key) {
        if (screens[key]) screens[key].classList.toggle("active", key === target);
      });
      dayNav.classList.toggle("hidden", target !== "today");
    }

    async function renderMonthScreen() {
      const year = state.currentYear;
      const month = state.currentMonth;

      const titleEl = document.getElementById("month-title");
      titleEl.textContent = new Date(year, month, 1).toLocaleDateString("ru-RU", {
        month: "long",
        year: "numeric"
      });

      const allEntries = await dbGetAll("entries");
      const monthStr = monthStrFromYM(year, month);
      const today = todayStr();

      // Month view shows everything that belongs to this month via `entry.month`:
      //  - tasks and events (dated → by day; undated → "Без даты" block)
      //  - notes without a collection (dated → by day; undated → "Заметки месяца")
      //  - notes attached to a collection are hidden (they live in the collection)
      //  - forgotten entries are hidden
      const monthEntries = allEntries.filter(function (e) {
        if (e.month !== monthStr) return false;
        if (e.status === "forgotten") return false;
        if (e.type === "note" && e.collectionId) return false;
        return true;
      });

      const inDays = {};
      const undatedTaskEvent = [];
      const undatedNotes = [];

      monthEntries.forEach(function (e) {
        if (e.date) {
          if (!inDays[e.date]) inDays[e.date] = [];
          inDays[e.date].push(e);
        } else if (e.type === "note") {
          undatedNotes.push(e);
        } else {
          undatedTaskEvent.push(e);
        }
      });

      // "Без даты" (task/event without a date). Hidden when empty.
      const undatedSection = document.getElementById("month-undated-section");
      const undatedList = document.getElementById("month-undated-list");
      if (!undatedTaskEvent.length) {
        undatedSection.style.display = "none";
        undatedList.innerHTML = "";
      } else {
        undatedTaskEvent.sort(compareTodayEntries);
        undatedSection.style.display = "block";
        undatedList.innerHTML = undatedTaskEvent.map(renderMonthEntryRow).join("");
      }

      const listEl = document.getElementById("month-entries-list");
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      const dayBlocks = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr =
          year +
          "-" +
          String(month + 1).padStart(2, "0") +
          "-" +
          String(day).padStart(2, "0");
        const entries = (inDays[dateStr] || []).slice().sort(compareTodayEntries);
        const isToday = dateStr === today;
        const hasOpen = entries.some(function (e) {
          return e.type === "task" && e.status === "open";
        });
        const isEmpty = entries.length === 0;

        let blockClass = "month-day-block";
        if (isEmpty) blockClass += " is-empty";
        if (isToday) blockClass += " is-today";

        let badgeClass = "month-day-num-badge";
        if (isToday) badgeClass += " is-today";
        else if (hasOpen) badgeClass += " has-open";
        if (isEmpty) badgeClass += " is-empty";

        const weekday = new Date(dateStr).toLocaleDateString("ru-RU", { weekday: "short" });
        const countLabel = isEmpty ? "" : formatCountLabel(entries.length);

        dayBlocks.push(
          '<div class="' + blockClass + '">' +
            '<div class="month-day-num-col">' +
              '<div class="' + badgeClass + '" data-date="' + dateStr + '">' + day + "</div>" +
              (entries.length > 1 ? '<div class="month-day-line"></div>' : "") +
            "</div>" +
            '<div class="month-day-entries-col">' +
              '<div class="month-day-header-row">' +
                '<span class="month-day-weekday">' + weekday + "</span>" +
                (countLabel ? '<span class="month-day-count">· ' + countLabel + "</span>" : "") +
              "</div>" +
              entries.map(renderMonthEntryRow).join("") +
            "</div>" +
          "</div>"
        );
      }

      listEl.innerHTML = dayBlocks.join("");

      // "Заметки месяца": undated notes without a collection.
      const ideasSection = document.getElementById("month-ideas-section");
      const ideasList = document.getElementById("month-ideas-list");
      if (!undatedNotes.length) {
        ideasSection.style.display = "none";
        ideasList.innerHTML = "";
      } else {
        undatedNotes.sort(function (a, b) {
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        });
        ideasSection.style.display = "block";
        ideasList.innerHTML = undatedNotes.map(function (entry) {
          const priorityHtml = renderPriorityHtml(entry);
          return (
            '<div class="month-idea-row" data-id="' + entry.id + '">' +
              priorityHtml +
              '<span class="month-idea-symbol">—</span>' +
              '<span class="month-idea-text">' + escapeHtml(entry.text) + "</span>" +
              '<div class="month-idea-actions">' +
                '<button class="month-idea-btn" data-action="to-coll" data-id="' + entry.id + '" type="button">→ В коллекцию</button>' +
                '<button class="month-idea-btn to-task" data-action="to-task" data-id="' + entry.id + '" type="button">↻ В задачу</button>' +
                '<button class="month-idea-btn danger" data-action="forget" data-id="' + entry.id + '" type="button">Забыть</button>' +
              "</div>" +
            "</div>"
          );
        }).join("");
      }

      await renderMigrationBanner();
      await renderNotesOverflowBanner();
      bindMonthEvents();
    }

    function renderMonthEntryRow(entry) {
      const sym = getSymbolByEntry(entry);
      const statusClass = statusClassFor(entry);
      const priorityHtml = renderPriorityHtml(entry);
      const timeHtml =
        entry.type === "event" && entry.time
          ? '<span class="month-entry-time">' + escapeHtml(entry.time) + "</span>"
          : "";
      return (
        '<div class="month-entry-row ' + statusClass + '" data-id="' + entry.id + '">' +
          priorityHtml +
          '<span class="month-entry-symbol" style="color:' + sym.color + '">' + sym.char + "</span>" +
          timeHtml +
          '<span class="month-entry-text">' + escapeHtml(entry.text) + "</span>" +
        "</div>"
      );
    }

    function formatCountLabel(n) {
      const mod10 = n % 10;
      const mod100 = n % 100;
      let word;
      if (mod10 === 1 && mod100 !== 11) word = "запись";
      else if ([2, 3, 4].indexOf(mod10) !== -1 && [12, 13, 14].indexOf(mod100) === -1) word = "записи";
      else word = "записей";
      return n + " " + word;
    }

    // "Пора подвести итоги" — shown on the CURRENT month view when either:
    //   (a) today is within the last 2 days of the current month (early warning), or
    //   (b) the previous month still has unclosed tasks or unsorted notes
    //       (late reminder — the user didn't finish the ritual on time).
    // In case (a) the target month is the current one; in case (b) it is the previous.
    // The banner disappears only once the target month has nothing to review.
    async function renderMigrationBanner() {
      const host = document.getElementById("month-entries-list");
      if (!host) return;

      const existing = document.getElementById("migration-banner");
      if (existing) existing.remove();

      const now = new Date();
      const isCurrentMonth =
        state.currentYear === now.getFullYear() && state.currentMonth === now.getMonth();
      if (!isCurrentMonth) return;

      const curStr = monthStrFromYM(state.currentYear, state.currentMonth);
      const prev = prevMonthYM(state.currentYear, state.currentMonth);
      const prevStr = monthStrFromYM(prev.year, prev.month);

      const daysInCurMonth = new Date(state.currentYear, state.currentMonth + 1, 0).getDate();
      const withinLastTwoDays = now.getDate() >= daysInCurMonth - 1;

      const allEntries = await dbGetAll("entries");

      const prevUnclosedTasks = allEntries.filter(function (e) {
        return e.month === prevStr && e.type === "task" && e.status === "open";
      });
      const prevLooseNotes = allEntries.filter(function (e) {
        return (
          e.month === prevStr &&
          e.type === "note" &&
          !e.collectionId &&
          e.status !== "forgotten"
        );
      });

      // Determine which month is "on the ritual table" and which records to show.
      let targetMonthStr;
      let targetLabel;
      let tasksToReview;
      let notesToReview;

      if (prevUnclosedTasks.length > 0 || prevLooseNotes.length > 0) {
        // Late reminder: finish last month first.
        targetMonthStr = prevStr;
        targetLabel = new Date(prev.year, prev.month, 1).toLocaleDateString("ru-RU", {
          month: "long"
        });
        tasksToReview = prevUnclosedTasks;
        notesToReview = prevLooseNotes;
      } else if (withinLastTwoDays) {
        // Early warning for the current month.
        const curUnclosedTasks = allEntries.filter(function (e) {
          return e.month === curStr && e.type === "task" && e.status === "open";
        });
        const curLooseNotes = allEntries.filter(function (e) {
          return (
            e.month === curStr &&
            e.type === "note" &&
            !e.collectionId &&
            e.status !== "forgotten"
          );
        });
        if (curUnclosedTasks.length === 0 && curLooseNotes.length === 0) return;
        targetMonthStr = curStr;
        targetLabel = new Date(state.currentYear, state.currentMonth, 1).toLocaleDateString(
          "ru-RU",
          { month: "long" }
        );
        tasksToReview = curUnclosedTasks;
        notesToReview = curLooseNotes;
      } else {
        return;
      }

      const banner = document.createElement("div");
      banner.id = "migration-banner";
      banner.className = "migration-banner";
      banner.innerHTML =
        '<div class="migration-banner-icon">📋</div>' +
        '<div class="migration-banner-body">' +
          '<div class="migration-banner-title">Пора подвести итоги — ' +
          escapeHtml(targetLabel) +
          "</div>" +
          '<div class="migration-banner-meta">Незакрытых: ' +
          tasksToReview.length +
          " · Заметок без коллекции: " +
          notesToReview.length +
          "</div>" +
        "</div>" +
        '<button class="migration-banner-btn" id="migration-start-btn" type="button">Начать миграцию</button>';

      host.parentElement.insertBefore(banner, host);

      document
        .getElementById("migration-start-btn")
        .addEventListener("click", function () {
          openMigrationModal(tasksToReview, notesToReview, targetMonthStr);
        });
    }

    // "Пора разобрать заметки" — separate banner driven by the DB-wide count of
    // uncategorised notes. Threshold is configurable (SPEC §1 setting, default 50).
    async function renderNotesOverflowBanner() {
      const host = document.getElementById("month-entries-list");
      if (!host) return;
      const existing = document.getElementById("notes-overflow-banner");
      if (existing) existing.remove();

      const threshold = state.notesOverflowThreshold || 50;
      const allEntries = await dbGetAll("entries");
      const looseCount = allEntries.filter(function (e) {
        return (
          e.type === "note" &&
          !e.collectionId &&
          e.status !== "forgotten"
        );
      }).length;
      if (looseCount < threshold) return;

      const banner = document.createElement("div");
      banner.id = "notes-overflow-banner";
      banner.className = "migration-banner notes-overflow-banner";
      banner.innerHTML =
        '<div class="migration-banner-icon">🗂️</div>' +
        '<div class="migration-banner-body">' +
          '<div class="migration-banner-title">Пора разобрать заметки</div>' +
          '<div class="migration-banner-meta">В базе ' +
          looseCount +
          " заметок без коллекции (порог " +
          threshold +
          "). Загляните в Месяц прошлых периодов и разложите их по коллекциям.</div>" +
        "</div>";

      host.parentElement.insertBefore(banner, host);
    }

    function bindMonthEvents() {
      const listEl = document.getElementById("month-entries-list");
      listEl.onclick = async function (event) {
        const row = event.target.closest(".month-entry-row");
        if (row) {
          const entry = await dbGet("entries", row.dataset.id);
          if (!entry) return;
          // Click on a card opens edit modal in place — we don't teleport to Today.
          openModal(entry.date, entry, null);
          return;
        }
        const badge = event.target.closest(".month-day-num-badge");
        if (badge && badge.dataset.date) {
          // The number badge is still a convenient shortcut to jump to that day.
          state.currentDate = badge.dataset.date;
          switchToScreen("today");
          await renderTodayScreen();
        }
      };

      const undatedList = document.getElementById("month-undated-list");
      if (undatedList) {
        undatedList.onclick = async function (event) {
          const row = event.target.closest(".month-entry-row");
          if (!row) return;
          const entry = await dbGet("entries", row.dataset.id);
          if (!entry) return;
          openModal(entry.date, entry, null);
        };
      }

      const ideasList = document.getElementById("month-ideas-list");
      ideasList.onclick = async function (event) {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        const entry = await dbGet("entries", id);
        if (!entry) return;

        if (action === "to-task") {
          entry.type = "task";
          entry.status = "open";
          entry.updatedAt = new Date().toISOString();
          await dbPut("entries", entry);
          await renderMonthScreen();
        }

        if (action === "to-coll") {
          await openAssignCollModal(id);
        }

        if (action === "forget") {
          // SPEC §9: "Забыть" — soft-статус, не hard delete.
          entry.status = "forgotten";
          entry.updatedAt = new Date().toISOString();
          await dbPut("entries", entry);
          await renderMonthScreen();
        }
      };
    }

    function bindMonthNavEvents() {
      document.getElementById("month-prev").addEventListener("click", async function () {
        state.currentMonth--;
        if (state.currentMonth < 0) {
          state.currentMonth = 11;
          state.currentYear--;
        }
        await renderMonthScreen();
      });

      document.getElementById("month-next").addEventListener("click", async function () {
        state.currentMonth++;
        if (state.currentMonth > 11) {
          state.currentMonth = 0;
          state.currentYear++;
        }
        await renderMonthScreen();
      });
    }

    function bindNavEvents() {
      const navButtons = document.querySelectorAll(".nav-btn, .sidebar-btn");

      navButtons.forEach(function (button) {
        button.addEventListener("click", async function () {
          const target = button.getAttribute("data-screen");
          switchToScreen(target);
          if (target === "month") {
            await renderMonthScreen();
          }
          if (target === "future") {
            await renderFutureScreen();
          }
          if (target === "collections") {
            await renderCollectionsScreen();
          }
        });
      });
    }

    // SPEC §5 actions on a task in the migration ritual:
    //   done        - пометить выполненной (если вдруг вспомнили)
    //   next-month  - перенести в следующий месяц (выбор дня или «без даты»)
    //   to-future   - отложить в Полгода (выбор месяца из 6-месячного горизонта)
    //   to-event    - превратить в событие (выбор даты + опц. времени)
    //   to-note     - превратить в заметку (в блок месяца или в коллекцию)
    //   forget      - забыть (soft-delete)
    const TASK_MIGRATION_BUTTONS = [
      { action: "done",        label: "✓", title: "Выполнено" },
      { action: "next-month",  label: "›", title: "В следующий месяц" },
      { action: "to-future",   label: "‹", title: "В Полгода" },
      { action: "to-event",    label: "⇄○", title: "В событие" },
      { action: "to-note",     label: "⇄—", title: "В заметку" },
      { action: "forget",      label: "~",  title: "Забыть", danger: true }
    ];

    // SPEC §5 actions on a note in the migration ritual:
    //   to-task   - превратить в задачу (выбор дня)
    //   to-event  - превратить в событие (дата + опц. время)
    //   to-coll   - переложить в коллекцию (использует уже существующий выбор)
    //   forget    - забыть
    const NOTE_MIGRATION_BUTTONS = [
      { action: "to-task",   label: "⇄·",  title: "В задачу" },
      { action: "to-event",  label: "⇄○",  title: "В событие" },
      { action: "to-coll",   label: "→",   title: "В коллекцию" },
      { action: "forget",    label: "~",   title: "Забыть", danger: true }
    ];

    function renderMigrationItem(entry, buttons, symbol) {
      const actionsHtml = buttons
        .map(function (b) {
          return (
            '<button class="migration-btn' +
            (b.danger ? " danger" : "") +
            '" data-action="' +
            b.action +
            '" data-id="' +
            entry.id +
            '" type="button" title="' +
            b.title +
            '">' +
            b.label +
            "</button>"
          );
        })
        .join("");

      return (
        '<div class="migration-item" data-id="' +
        entry.id +
        '">' +
        '<div class="migration-item-text">' +
        symbol +
        " " +
        escapeHtml(entry.text) +
        "</div>" +
        '<div class="migration-item-actions">' +
        actionsHtml +
        "</div>" +
        '<div class="migration-item-picker" hidden></div>' +
        "</div>"
      );
    }

    function openMigrationModal(tasks, ideas, targetMonthStr) {
      const overlay = document.getElementById("migration-overlay");
      overlay.dataset.targetMonth = targetMonthStr || "";

      const tasksSection = document.getElementById("migration-tasks-section");
      const tasksList = document.getElementById("migration-tasks-list");
      if (tasks.length === 0) {
        tasksSection.style.display = "none";
        tasksList.innerHTML = "";
      } else {
        tasksSection.style.display = "block";
        tasksList.innerHTML = tasks
          .map(function (entry) {
            return renderMigrationItem(entry, TASK_MIGRATION_BUTTONS, "·");
          })
          .join("");
      }

      const ideasSection = document.getElementById("migration-ideas-section");
      const ideasList = document.getElementById("migration-ideas-list");
      if (ideas.length === 0) {
        ideasSection.style.display = "none";
        ideasList.innerHTML = "";
      } else {
        ideasSection.style.display = "block";
        ideasList.innerHTML = ideas
          .map(function (entry) {
            return renderMigrationItem(entry, NOTE_MIGRATION_BUTTONS, "—");
          })
          .join("");
      }

      overlay.style.display = "flex";
    }

    // ===== Picker builders =====

    function addMonthsToMonthStr(monthStr, delta) {
      const parts = monthStr.split("-");
      let y = parseInt(parts[0], 10);
      let m = parseInt(parts[1], 10) + delta;
      while (m > 12) { m -= 12; y++; }
      while (m < 1)  { m += 12; y--; }
      return y + "-" + String(m).padStart(2, "0");
    }

    function lastDayOfMonth(monthStr) {
      const y = parseInt(monthStr.slice(0, 4), 10);
      const m = parseInt(monthStr.slice(5, 7), 10);
      return new Date(y, m, 0).getDate();
    }

    function humanMonth(monthStr) {
      const y = parseInt(monthStr.slice(0, 4), 10);
      const m = parseInt(monthStr.slice(5, 7), 10) - 1;
      return new Date(y, m, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    }

    // All pickers share a wrapper with Применить/Отмена buttons.
    function wrapPicker(innerHtml) {
      return (
        '<div class="migration-picker-form">' +
        innerHtml +
        '<div class="migration-picker-actions">' +
        '<button class="migration-picker-cancel" data-picker-action="cancel" type="button">Отмена</button>' +
        '<button class="migration-picker-apply" data-picker-action="apply" type="button">Применить</button>' +
        "</div>" +
        "</div>"
      );
    }

    // Day picker within a given month. Optional "без даты" toggle for tasks.
    function buildDayPicker(monthStr, opts) {
      opts = opts || {};
      const first = monthStr + "-01";
      const last = monthStr + "-" + String(lastDayOfMonth(monthStr)).padStart(2, "0");
      const defaultDate = opts.defaultDate || first;
      const allowUndated = opts.allowUndated !== false;
      const label = opts.label || ("День в " + humanMonth(monthStr));

      return wrapPicker(
        '<label class="migration-picker-label">' + label + "</label>" +
        '<input class="migration-picker-input" type="date" data-field="date" value="' +
        defaultDate + '" min="' + first + '" max="' + last + '">' +
        (allowUndated
          ? '<label class="migration-picker-check">' +
            '<input type="checkbox" data-field="undated"> без даты' +
            "</label>"
          : "")
      );
    }

    // Month-in-6-months picker for "В Полгода". Range: source+1 .. source+6.
    function buildMonthPicker(sourceMonthStr) {
      const options = [];
      for (let i = 1; i <= 6; i++) {
        const ms = addMonthsToMonthStr(sourceMonthStr, i);
        options.push(
          '<option value="' + ms + '">' + humanMonth(ms) + "</option>"
        );
      }
      return wrapPicker(
        '<label class="migration-picker-label">Месяц</label>' +
        '<select class="migration-picker-input" data-field="month">' +
        options.join("") +
        "</select>"
      );
    }

    // Date + optional time picker — for "В событие".
    function buildEventPicker(defaultDate) {
      return wrapPicker(
        '<label class="migration-picker-label">Дата</label>' +
        '<input class="migration-picker-input" type="date" data-field="date" value="' +
        (defaultDate || todayStr()) + '">' +
        '<label class="migration-picker-label">Время (необязательно)</label>' +
        '<input class="migration-picker-input" type="time" data-field="time">'
      );
    }

    // "В заметку" sub-choice: leave in month block or drop into a collection.
    async function buildNoteTargetPicker() {
      const collections = await dbGetAll("collections");
      const collOptions = collections
        .map(function (c) {
          return '<option value="' + c.id + '">' + escapeHtml(c.name) + "</option>";
        })
        .join("");
      const select = collections.length
        ? '<select class="migration-picker-input" data-field="coll" disabled>' +
          collOptions + "</select>"
        : '<div class="migration-picker-hint">Коллекций пока нет — будет в блоке месяца.</div>';
      return wrapPicker(
        '<label class="migration-picker-check">' +
        '<input type="radio" name="note-target" value="month" data-field="note-target" checked>' +
        " В блоке «Заметки месяца»</label>" +
        (collections.length
          ? '<label class="migration-picker-check">' +
            '<input type="radio" name="note-target" value="coll" data-field="note-target">' +
            " В коллекцию</label>" +
            select
          : select)
      );
    }

    function closeMigrationModal() {
      document.getElementById("migration-overlay").style.display = "none";
    }

    function collapseMigrationItemPicker(item) {
      if (!item) return;
      const picker = item.querySelector(".migration-item-picker");
      if (!picker) return;
      picker.hidden = true;
      picker.innerHTML = "";
      delete item.dataset.pendingAction;
    }

    async function expandMigrationItemPicker(item, action, entry, targetMonthStr) {
      const picker = item.querySelector(".migration-item-picker");
      if (!picker) return;
      item.dataset.pendingAction = action;

      const sourceMonth =
        entry.month ||
        (entry.date ? entry.date.slice(0, 7) : targetMonthStr || monthStrFromYM(state.currentYear, state.currentMonth));

      let html = "";
      if (entry.type === "task" && action === "next-month") {
        const nextMonth = addMonthsToMonthStr(sourceMonth, 1);
        html = buildDayPicker(nextMonth, { allowUndated: true, defaultDate: nextMonth + "-01" });
      } else if (entry.type === "task" && action === "to-future") {
        html = buildMonthPicker(sourceMonth);
      } else if (action === "to-event") {
        html = buildEventPicker(entry.date || todayStr());
      } else if (entry.type === "task" && action === "to-note") {
        html = await buildNoteTargetPicker();
      } else if (entry.type === "note" && action === "to-task") {
        html = buildDayPicker(sourceMonth, { allowUndated: true, defaultDate: entry.date || (sourceMonth + "-01") });
      } else {
        return;
      }

      picker.innerHTML = html;
      picker.hidden = false;

      // Enable/disable coll select when note-target radio flips.
      if (entry.type === "task" && action === "to-note") {
        const radios = picker.querySelectorAll('input[name="note-target"]');
        const collSelect = picker.querySelector('[data-field="coll"]');
        radios.forEach(function (r) {
          r.addEventListener("change", function () {
            if (collSelect) collSelect.disabled = r.value !== "coll" || !r.checked;
          });
        });
      }
    }

    // Returns null if apply should be aborted (invalid input etc.).
    async function applyMigrationAction(entry, action, pickerEl, targetMonthStr) {
      const now = new Date().toISOString();

      if (entry.type === "task") {
        if (action === "done") {
          entry.status = "done";
        } else if (action === "next-month") {
          const undated = pickerEl && pickerEl.querySelector('[data-field="undated"]');
          const dateInput = pickerEl && pickerEl.querySelector('[data-field="date"]');
          if (undated && undated.checked) {
            const source = entry.month || monthStrFromYM(state.currentYear, state.currentMonth);
            entry.month = addMonthsToMonthStr(source, 1);
            entry.date = null;
          } else if (dateInput && dateInput.value) {
            entry.date = dateInput.value;
            entry.month = dateInput.value.slice(0, 7);
          } else {
            return false;
          }
          entry.status = "open";
        } else if (action === "to-future") {
          const sel = pickerEl && pickerEl.querySelector('[data-field="month"]');
          if (!sel || !sel.value) return false;
          entry.month = sel.value;
          entry.date = null;
          entry.status = "open";
        } else if (action === "to-event") {
          const dateInput = pickerEl && pickerEl.querySelector('[data-field="date"]');
          const timeInput = pickerEl && pickerEl.querySelector('[data-field="time"]');
          if (!dateInput || !dateInput.value) return false;
          entry.type = "event";
          entry.date = dateInput.value;
          entry.month = dateInput.value.slice(0, 7);
          entry.time = timeInput && timeInput.value ? timeInput.value : null;
          entry.status = "upcoming";
        } else if (action === "to-note") {
          const target = pickerEl && pickerEl.querySelector('input[name="note-target"]:checked');
          const collSel = pickerEl && pickerEl.querySelector('[data-field="coll"]');
          entry.type = "note";
          entry.status = "active";
          if (target && target.value === "coll" && collSel && collSel.value) {
            entry.collectionId = collSel.value;
          } else {
            entry.collectionId = null;
          }
        } else if (action === "forget") {
          entry.status = "forgotten";
        } else {
          return false;
        }
      } else if (entry.type === "note") {
        if (action === "to-task") {
          const undated = pickerEl && pickerEl.querySelector('[data-field="undated"]');
          const dateInput = pickerEl && pickerEl.querySelector('[data-field="date"]');
          entry.type = "task";
          entry.status = "open";
          if (undated && undated.checked) {
            entry.date = null;
          } else if (dateInput && dateInput.value) {
            entry.date = dateInput.value;
            entry.month = dateInput.value.slice(0, 7);
          } else {
            return false;
          }
        } else if (action === "to-event") {
          const dateInput = pickerEl && pickerEl.querySelector('[data-field="date"]');
          const timeInput = pickerEl && pickerEl.querySelector('[data-field="time"]');
          if (!dateInput || !dateInput.value) return false;
          entry.type = "event";
          entry.date = dateInput.value;
          entry.month = dateInput.value.slice(0, 7);
          entry.time = timeInput && timeInput.value ? timeInput.value : null;
          entry.status = "upcoming";
        } else if (action === "forget") {
          entry.status = "forgotten";
        } else {
          return false;
        }
      } else {
        return false;
      }

      entry.updatedAt = now;
      await dbPut("entries", entry);
      return true;
    }

    function bindMigrationEvents() {
      const overlay = document.getElementById("migration-overlay");
      overlay.addEventListener("click", function (event) {
        if (event.target === this) closeMigrationModal();
      });
      document.getElementById("migration-close").addEventListener("click", closeMigrationModal);
      document.getElementById("migration-done").addEventListener("click", async function () {
        closeMigrationModal();
        await renderMonthScreen();
      });

      // Generic migration list click handler — reused for tasks and notes lists.
      async function handleMigrationClick(event) {
        const overlay = document.getElementById("migration-overlay");
        const targetMonthStr = overlay.dataset.targetMonth || "";

        // Picker Apply/Cancel inside an already-open picker.
        const pickerBtn = event.target.closest("[data-picker-action]");
        if (pickerBtn) {
          const item = pickerBtn.closest(".migration-item");
          if (!item) return;
          const action = item.dataset.pendingAction;
          const id = item.dataset.id;
          if (pickerBtn.dataset.pickerAction === "cancel") {
            collapseMigrationItemPicker(item);
            return;
          }
          // apply
          const entry = await dbGet("entries", id);
          if (!entry) return;
          const pickerEl = item.querySelector(".migration-item-picker");
          const ok = await applyMigrationAction(entry, action, pickerEl, targetMonthStr);
          if (!ok) return;
          item.remove();
          return;
        }

        // Row action button.
        const btn = event.target.closest("[data-action]");
        if (!btn) return;
        const item = btn.closest(".migration-item");
        if (!item) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const entry = await dbGet("entries", id);
        if (!entry) return;

        // Simple immediate actions (no picker needed).
        if (action === "done" || action === "forget") {
          const ok = await applyMigrationAction(entry, action, null, targetMonthStr);
          if (ok) item.remove();
          return;
        }

        // "В коллекцию" for notes — reuses the dedicated assign-collection modal.
        if (entry.type === "note" && action === "to-coll") {
          closeMigrationModal();
          await openAssignCollModal(id);
          return;
        }

        // Picker-driven actions: toggle the inline picker under the row.
        if (item.dataset.pendingAction === action) {
          collapseMigrationItemPicker(item);
        } else {
          await expandMigrationItemPicker(item, action, entry, targetMonthStr);
        }
      }

      document
        .getElementById("migration-tasks-list")
        .addEventListener("click", handleMigrationClick);
      document
        .getElementById("migration-ideas-list")
        .addEventListener("click", handleMigrationClick);
    }

    function bindSettingsEvents() {
      document.getElementById("export-btn").addEventListener("click", async function () {
        const entries = await dbGetAll("entries");
        const collections = await dbGetAll("collections");
        const data = {
          version: 2,
          exportedAt: new Date().toISOString(),
          entries: entries,
          collections: collections
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "minddump-" + todayStr() + ".json";
        link.click();
        URL.revokeObjectURL(url);
      });

      document.getElementById("import-file").addEventListener("change", async function (event) {
        const file = event.target.files[0];
        if (!file) return;

        const text = await file.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (_error) {
          alert("Ошибка: файл повреждён или не является JSON");
          event.target.value = "";
          return;
        }

        if (!Array.isArray(data.entries) || !Array.isArray(data.collections)) {
          alert("Ошибка: неверный формат файла");
          event.target.value = "";
          return;
        }

        if (
          !confirm(
            "Импортировать данные?\n\n" +
              "Записей: " +
              data.entries.length +
              "\n" +
              "Коллекций: " +
              data.collections.length +
              "\n\n" +
              "Существующие данные будут объединены с импортируемыми."
          )
        ) {
          event.target.value = "";
          return;
        }

        for (const collection of data.collections) {
          const existingCollection = await dbGet("collections", collection.id);
          if (!existingCollection) {
            await dbAdd("collections", collection);
          }
        }

        for (const entry of data.entries) {
          const existingEntry = await dbGet("entries", entry.id);
          if (!existingEntry) {
            if (entry.priority === undefined) entry.priority = null;
            if (entry.raised === undefined) entry.raised = false;
            if (entry.month === undefined) {
              entry.month = entry.date ? entry.date.slice(0, 7) : null;
            }
            if (entry.type === "event" && entry.time === undefined) entry.time = null;
            if (entry.addenda === undefined) entry.addenda = [];
            if (entry.status === "irrelevant") entry.status = "forgotten";
            await dbAdd("entries", entry);
          }
        }

        event.target.value = "";
        alert("Импорт завершён");
        await renderTodayScreen();
      });

      document.getElementById("clear-btn").addEventListener("click", async function () {
        if (!confirm("Удалить ВСЕ данные?\nЭто действие нельзя отменить.")) return;
        if (!confirm("Вы уверены? Все записи и коллекции будут удалены навсегда.")) return;

        const entries = await dbGetAll("entries");
        const collections = await dbGetAll("collections");

        for (const entry of entries) {
          await dbDelete("entries", entry.id);
        }
        for (const collection of collections) {
          await dbDelete("collections", collection.id);
        }

        await renderTodayScreen();
        alert("Данные удалены");
      });
    }

