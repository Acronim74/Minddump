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
        return (
          '<div class="entry-item ' + statusClass + '" data-id="' + entry.id + '">' +
            priorityHtml +
            '<span class="entry-symbol" style="color:' + sym.color + '">' + sym.char + "</span>" +
            '<span class="entry-text">' + escapeHtml(entry.text) + "</span>" +
            '<button type="button" class="entry-action js-toggle-done">✓</button>' +
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
      const sortedDates = Object.keys(inDays).sort();

      if (!sortedDates.length) {
        listEl.innerHTML = undatedTaskEvent.length
          ? ""
          : '<div class="month-empty">Нет записей за этот месяц</div>';
      } else {
        listEl.innerHTML = sortedDates.map(function (dateStr) {
          const entries = inDays[dateStr].slice().sort(compareTodayEntries);
          const dayNum = parseInt(dateStr.split("-")[2], 10);
          const isToday = dateStr === today;
          const hasOpen = entries.some(function (e) {
            return e.type === "task" && e.status === "open";
          });

          let badgeClass = "month-day-num-badge";
          if (isToday) badgeClass += " is-today";
          else if (hasOpen) badgeClass += " has-open";

          const weekday = new Date(dateStr).toLocaleDateString("ru-RU", { weekday: "short" });
          const countLabel = formatCountLabel(entries.length);

          return (
            '<div class="month-day-block">' +
              '<div class="month-day-num-col">' +
                '<div class="' + badgeClass + '" data-date="' + dateStr + '">' + dayNum + "</div>" +
                (entries.length > 1 ? '<div class="month-day-line"></div>' : "") +
              "</div>" +
              '<div class="month-day-entries-col">' +
                '<div class="month-day-header-row">' +
                  '<span class="month-day-weekday">' + weekday + "</span>" +
                  '<span class="month-day-count">· ' + countLabel + "</span>" +
                "</div>" +
                entries.map(renderMonthEntryRow).join("") +
              "</div>" +
            "</div>"
          );
        }).join("");
      }

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

    async function renderMigrationBanner() {
      const host = document.getElementById("month-entries-list");
      if (!host) return;

      const existing = document.getElementById("migration-banner");
      if (existing) existing.remove();

      const now = new Date();
      const isCurrentMonth =
        state.currentYear === now.getFullYear() && state.currentMonth === now.getMonth();
      if (!isCurrentMonth) return;

      const prev = prevMonthYM(state.currentYear, state.currentMonth);
      const prevStr = monthStrFromYM(prev.year, prev.month);
      const allEntries = await dbGetAll("entries");

      const unclosedTasks = allEntries.filter(function (e) {
        return e.month === prevStr && e.type === "task" && e.status === "open";
      });
      const looseIdeas = allEntries.filter(function (e) {
        return e.month === prevStr && e.type === "note" && !e.collectionId;
      });

      if (unclosedTasks.length === 0 && looseIdeas.length === 0) return;

      const prevLabel = new Date(prev.year, prev.month, 1).toLocaleDateString("ru-RU", {
        month: "long"
      });

      const banner = document.createElement("div");
      banner.id = "migration-banner";
      banner.className = "migration-banner";
      banner.innerHTML =
        '<div class="migration-banner-icon">📋</div>' +
        '<div class="migration-banner-body">' +
          '<div class="migration-banner-title">Пора подвести итоги — ' +
          escapeHtml(prevLabel) +
          "</div>" +
          '<div class="migration-banner-meta">Незакрытых: ' +
          unclosedTasks.length +
          " · Заметок без коллекции: " +
          looseIdeas.length +
          "</div>" +
        "</div>" +
        '<button class="migration-banner-btn" id="migration-start-btn" type="button">Начать миграцию</button>';

      host.parentElement.insertBefore(banner, host);

      document
        .getElementById("migration-start-btn")
        .addEventListener("click", function () {
          openMigrationModal(unclosedTasks, looseIdeas);
        });
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
          entry.updatedAt = new Date().toISOString();
          await dbPut("entries", entry);
          await renderMonthScreen();
        }

        if (action === "to-coll") {
          await openAssignCollModal(id);
        }

        if (action === "forget") {
          if (!confirm("Удалить заметку?")) return;
          await dbDelete("entries", id);
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

    function openMigrationModal(tasks, ideas) {
      const overlay = document.getElementById("migration-overlay");

      const tasksSection = document.getElementById("migration-tasks-section");
      const tasksList = document.getElementById("migration-tasks-list");
      if (tasks.length === 0) {
        tasksSection.style.display = "none";
        tasksList.innerHTML = "";
      } else {
        tasksSection.style.display = "block";
        tasksList.innerHTML = tasks
          .map(function (entry) {
            return (
              '<div class="migration-item" data-id="' +
              entry.id +
              '">' +
                '<div class="migration-item-text">· ' +
                escapeHtml(entry.text) +
                "</div>" +
                '<div class="migration-item-actions">' +
                  '<button class="migration-btn" data-action="migrate-next" data-id="' +
                  entry.id +
                  '" type="button" title="Перенести на следующий месяц">›</button>' +
                  '<button class="migration-btn" data-action="to-future" data-id="' +
                  entry.id +
                  '" type="button" title="Отложить в Полгода">‹</button>' +
                  '<button class="migration-btn danger" data-action="irrelevant" data-id="' +
                  entry.id +
                  '" type="button" title="Неактуально">~</button>' +
                "</div>" +
              "</div>"
            );
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
            return (
              '<div class="migration-item" data-id="' +
              entry.id +
              '">' +
                '<div class="migration-item-text">— ' +
                escapeHtml(entry.text) +
                "</div>" +
                '<div class="migration-item-actions">' +
                  '<button class="migration-btn" data-action="idea-to-coll" data-id="' +
                  entry.id +
                  '" type="button" title="В коллекцию">→</button>' +
                  '<button class="migration-btn" data-action="idea-to-task" data-id="' +
                  entry.id +
                  '" type="button" title="В задачу">↻</button>' +
                  '<button class="migration-btn danger" data-action="idea-forget" data-id="' +
                  entry.id +
                  '" type="button" title="Забыть">×</button>' +
                "</div>" +
              "</div>"
            );
          })
          .join("");
      }

      overlay.style.display = "flex";
    }

    function closeMigrationModal() {
      document.getElementById("migration-overlay").style.display = "none";
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

      const tasksList = document.getElementById("migration-tasks-list");
      tasksList.addEventListener("click", async function (event) {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;
        const id = btn.dataset.id;
        const entry = await dbGet("entries", id);
        if (!entry) return;
        const now = new Date().toISOString();

        if (btn.dataset.action === "migrate-next") {
          // Перенести в следующий месяц: первое число нового месяца
          const parts = entry.date.split("-");
          let y = parseInt(parts[0], 10);
          let m = parseInt(parts[1], 10);
          m++;
          if (m > 12) {
            m = 1;
            y++;
          }
          entry.date = y + "-" + String(m).padStart(2, "0") + "-01";
          entry.status = "migrated";
        } else if (btn.dataset.action === "to-future") {
          entry.status = "future";
        } else if (btn.dataset.action === "irrelevant") {
          entry.status = "irrelevant";
        }

        entry.updatedAt = now;
        await dbPut("entries", entry);

        const item = btn.closest(".migration-item");
        if (item) item.remove();
      });

      const ideasList = document.getElementById("migration-ideas-list");
      ideasList.addEventListener("click", async function (event) {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;
        const id = btn.dataset.id;
        const entry = await dbGet("entries", id);
        if (!entry) return;
        const now = new Date().toISOString();

        if (btn.dataset.action === "idea-to-coll") {
          closeMigrationModal();
          await openAssignCollModal(id);
          return;
        }

        if (btn.dataset.action === "idea-to-task") {
          entry.type = "task";
          entry.updatedAt = now;
          await dbPut("entries", entry);
        }

        if (btn.dataset.action === "idea-forget") {
          await dbDelete("entries", id);
        }

        const item = btn.closest(".migration-item");
        if (item) item.remove();
      });
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

