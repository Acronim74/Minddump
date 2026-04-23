    function getFutureMonths() {
      // Future Log covers the next 6 months starting from the month after current.
      // With `futureOffset=0` user sees months [now+1 .. now+6].
      // Arrows shift the window by ±6 months; current and past months are still
      // reachable via the ← arrow.
      const result = [];
      const now = new Date();
      let startMonth = now.getMonth() + 1 + state.futureOffset * 6;
      let startYear = now.getFullYear();

      while (startMonth < 0) {
        startMonth += 12;
        startYear--;
      }
      while (startMonth > 11) {
        startMonth -= 12;
        startYear++;
      }

      for (let i = 0; i < 6; i++) {
        let m = startMonth + i;
        let y = startYear;
        while (m > 11) {
          m -= 12;
          y++;
        }
        result.push({
          year: y,
          month: m,
          label: new Date(y, m, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
        });
      }
      return result;
    }

    function pluralEntries(n) {
      if (n % 10 === 1 && n % 100 !== 11) return "запись";
      if ([2, 3, 4].indexOf(n % 10) !== -1 && [12, 13, 14].indexOf(n % 100) === -1) return "записи";
      return "записей";
    }

    async function renderFutureScreen() {
      const months = getFutureMonths();
      const allEntries = await dbGetAll("entries");
      const today = todayStr();

      const first = months[0];
      const last = months[5];
      const firstName = new Date(first.year, first.month, 1).toLocaleDateString("ru-RU", {
        month: "long"
      });
      const lastName = new Date(last.year, last.month, 1).toLocaleDateString("ru-RU", {
        month: "long",
        year: "numeric"
      });
      document.getElementById("future-range").textContent = firstName + " — " + lastName;

      const firstMonthStr =
        months[0].year + "-" + String(months[0].month + 1).padStart(2, "0");

      const blocksHtml = months
        .map(function (m) {
          const monthStr = m.year + "-" + String(m.month + 1).padStart(2, "0");

          // Полгода = горизонт «задачи и события на ближайшие 6 месяцев».
          // Заметки сюда не попадают никогда (SPEC §3). Забытое прячем.
          // Legacy-флаг status="future": пока держим как альтернативный способ
          // попасть в Полгода, чтобы старые записи не исчезли. В будущих фазах
          // он уйдёт вместе с перестройкой migration.
          const entries = allEntries.filter(function (e) {
            if (e.type === "note") return false;
            if (e.status === "forgotten") return false;

            const entryMonth = e.month || (e.date ? e.date.slice(0, 7) : null);
            if (entryMonth === monthStr) return true;

            // Legacy: просроченные future-записи без точного месяца оседают в первом блоке.
            if (e.status === "future" && e.date && e.date <= today && monthStr === firstMonthStr) {
              return true;
            }
            return false;
          });

          const isEmpty = entries.length === 0;
          const count = entries.length;
          const nameClass = isEmpty ? "future-month-name empty" : "future-month-name";

          const monthLabel = new Date(m.year, m.month, 1).toLocaleDateString("ru-RU", {
            month: "long",
            year: "numeric"
          });

          const entriesHtml = entries
            .map(function (entry) {
              const sym = getSymbolByEntry(entry);
              const statusClass = statusClassFor(entry);
              const priorityHtml = renderPriorityHtml(entry);
              const dayNum = entry.date ? parseInt(entry.date.split("-")[2], 10) : "";
              const dateHint =
                entry.date && !entry.date.startsWith(monthStr)
                  ? ""
                  : dayNum
                    ? dayNum +
                      " " +
                      new Date(m.year, m.month, 1).toLocaleDateString("ru-RU", { month: "short" })
                    : "";

              return (
                '<div class="future-entry-row ' +
                statusClass +
                '" data-id="' +
                entry.id +
                '">' +
                priorityHtml +
                '<span class="future-entry-symbol" style="color:' +
                sym.color +
                '">' +
                sym.char +
                "</span>" +
                '<span class="future-entry-text">' +
                escapeHtml(entry.text) +
                "</span>" +
                (dateHint ? '<span class="future-entry-date">' + dateHint + "</span>" : "") +
                '<button class="future-entry-del" data-action="delete-future" data-id="' +
                entry.id +
                '" type="button" title="Удалить">×</button>' +
                "</div>"
              );
            })
            .join("");

          return (
            '<div class="future-month-block" data-month="' +
            monthStr +
            '">' +
            '<div class="future-month-header" data-toggle="' +
            monthStr +
            '">' +
            '<span class="' +
            nameClass +
            '">' +
            monthLabel.toUpperCase() +
            "</span>" +
            '<div class="future-month-meta">' +
            '<span class="future-month-count">' +
            (count ? count + " " + pluralEntries(count) : "—") +
            "</span>" +
            '<span class="future-month-toggle">' +
            (isEmpty ? "▸" : "▾") +
            "</span>" +
            "</div>" +
            "</div>" +
            (isEmpty
              ? '<div class="future-empty-body future-month-body" data-body="' +
                monthStr +
                '">Нет записей' +
                '<button class="future-add-btn" data-action="add-future" data-month="' +
                monthStr +
                '" type="button">+ Добавить</button>' +
                "</div>"
              : '<div class="future-month-body" data-body="' +
                monthStr +
                '">' +
                entriesHtml +
                '<button class="future-add-btn" data-action="add-future" data-month="' +
                monthStr +
                '" type="button">+ Добавить запись</button>' +
                "</div>") +
            "</div>"
          );
        })
        .join("");

      document.getElementById("future-blocks").innerHTML = blocksHtml;
      bindFutureEvents();
    }

    function bindFutureEvents() {
      const blocksEl = document.getElementById("future-blocks");

      blocksEl.onclick = async function (event) {
        const header = event.target.closest("[data-toggle]");
        if (header && !event.target.closest("[data-action]")) {
          const monthStr = header.dataset.toggle;
          const body = blocksEl.querySelector('[data-body="' + monthStr + '"]');
          const toggle = header.querySelector(".future-month-toggle");
          if (body) {
            const isCollapsed = body.classList.contains("collapsed");
            body.classList.toggle("collapsed", !isCollapsed);
            if (toggle) toggle.textContent = isCollapsed ? "▾" : "▸";
          }
          return;
        }

        const delBtn = event.target.closest('[data-action="delete-future"]');
        if (delBtn) {
          if (!confirm("Удалить запись?")) return;
          await dbDelete("entries", delBtn.dataset.id);
          await renderFutureScreen();
          return;
        }

        const addBtn = event.target.closest('[data-action="add-future"]');
        if (addBtn) {
          const monthStr = addBtn.dataset.month;
          const defaultDate = monthStr + "-01";
          openModal(defaultDate, null, null, "future");
          return;
        }
      };
    }

    function bindFutureNavEvents() {
      document.getElementById("future-prev").addEventListener("click", async function () {
        state.futureOffset--;
        await renderFutureScreen();
      });

      document.getElementById("future-next").addEventListener("click", async function () {
        state.futureOffset++;
        await renderFutureScreen();
      });
    }
