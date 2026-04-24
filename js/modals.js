    function openModal(defaultDate, entryToEdit, collectionId, scope) {
      const overlay = document.getElementById("modal-overlay");
      const titleEl = document.getElementById("modal-title");
      const editIdEl = document.getElementById("modal-edit-id");
      const collIdEl = document.getElementById("modal-coll-id");
      const scopeEl = document.getElementById("modal-scope");

      if (entryToEdit) {
        titleEl.textContent = "Редактировать";
        editIdEl.value = entryToEdit.id;
        collIdEl.value = "";
        scopeEl.value = "";
        document.getElementById("modal-text").value = entryToEdit.text;
        document.getElementById("modal-date").value = entryToEdit.date;
        document.querySelectorAll(".type-btn").forEach(function (btn) {
          btn.classList.toggle("active", btn.dataset.type === entryToEdit.type);
        });
        const currentPriority = entryToEdit.priority || "";
        document.querySelectorAll(".priority-btn").forEach(function (btn) {
          btn.classList.toggle("active", btn.dataset.priority === currentPriority);
        });
      } else {
        titleEl.textContent = "Новая запись";
        editIdEl.value = "";
        collIdEl.value = collectionId || "";
        scopeEl.value = scope || "";
        document.getElementById("modal-text").value = "";
        document.getElementById("modal-date").value = defaultDate || state.currentDate;
        // If opened from a collection, default the type to note.
        const defaultType = collectionId ? "note" : "task";
        document.querySelectorAll(".type-btn").forEach(function (btn) {
          btn.classList.toggle("active", btn.dataset.type === defaultType);
        });
        document.querySelectorAll(".priority-btn").forEach(function (btn) {
          btn.classList.toggle("active", btn.dataset.priority === "");
        });
      }

      overlay.style.display = "flex";
      setTimeout(function () {
        document.getElementById("modal-text").focus();
      }, 50);
    }

    function closeModal() {
      document.getElementById("modal-overlay").style.display = "none";
      document.getElementById("modal-coll-id").value = "";
      document.getElementById("modal-scope").value = "";
    }

    function bindModalEvents() {
      document.querySelectorAll(".type-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          document.querySelectorAll(".type-btn").forEach(function (innerBtn) {
            innerBtn.classList.remove("active");
          });
          btn.classList.add("active");
        });
      });

      document.querySelectorAll(".priority-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          document.querySelectorAll(".priority-btn").forEach(function (innerBtn) {
            innerBtn.classList.remove("active");
          });
          btn.classList.add("active");
        });
      });

      document.getElementById("modal-close-btn").addEventListener("click", closeModal);
      document.getElementById("modal-cancel-btn").addEventListener("click", closeModal);
      document.getElementById("modal-overlay").addEventListener("click", function (event) {
        if (event.target === this) closeModal();
      });
      document.getElementById("modal-save-btn").addEventListener("click", async function () {
        const text = document.getElementById("modal-text").value.trim();
        if (!text) {
          document.getElementById("modal-text").focus();
          return;
        }

        const type = (document.querySelector(".type-btn.active") || {}).dataset.type || "task";
        const priorityRaw =
          ((document.querySelector(".priority-btn.active") || {}).dataset || {}).priority || "";
        const priority = priorityRaw ? priorityRaw : null;
        const date = document.getElementById("modal-date").value || state.currentDate;
        const editId = document.getElementById("modal-edit-id").value;
        const collectionIdRaw = document.getElementById("modal-coll-id").value;
        const collectionId = collectionIdRaw ? collectionIdRaw : null;
        const scope = document.getElementById("modal-scope").value;
        const now = new Date().toISOString();

        if (editId) {
          const existing = await dbGet("entries", editId);
          if (existing) {
            existing.text = text;
            existing.type = type;
            existing.date = date;
            existing.month = date ? date.slice(0, 7) : existing.month;
            existing.priority = priority;
            existing.updatedAt = now;
            await dbPut("entries", existing);
          }
        } else {
          // Записи, созданные вне Daily Log, сразу принадлежат своему экрану
          // и не должны мелькать в «Сегодня».
          const initialStatus = scope === "future" ? "future" : "open";
          const initialRaised = scope === "month";
          await dbAdd("entries", {
            id: uid(),
            date: date,
            month: date ? date.slice(0, 7) : null,
            type: type,
            text: text,
            status: initialStatus,
            priority: priority,
            raised: initialRaised,
            collectionId: collectionId,
            time: null,
            addenda: [],
            createdAt: now,
            updatedAt: now
          });
        }
        closeModal();
        await refreshAllScreens();
      });

      document.getElementById("modal-text").addEventListener("keydown", function (event) {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          document.getElementById("modal-save-btn").click();
        }
        if (event.key === "Escape") closeModal();
      });
    }

    async function openEntryMenu(entryId) {
      activeMenuEntryId = entryId;
      const entry = await dbGet("entries", entryId);
      if (!entry) return;

      // Visibility per entry type (SPEC §6):
      //   «Перенести» — tasks only, and only if the task has a concrete date
      //     within the current month (otherwise there's nothing to reschedule).
      //   «В коллекцию» — notes only (collections host only notes in V1).
      //   «Изменить тип» — always available.
      const moveItem = document.getElementById("menu-move");
      const assignCollItem = document.getElementById("menu-assign-coll");

      moveItem.style.display = entry.type === "task" && entry.date ? "" : "none";
      // SPEC §6: a note can be moved between collections (or out of a
      // collection) via the same dialog, so «В коллекцию» is always
      // available on notes regardless of current collectionId.
      assignCollItem.style.display = entry.type === "note" ? "" : "none";

      const priorityLabel = document.getElementById("menu-priority-label");
      if (entry.priority === "high") {
        priorityLabel.textContent = "Снять приоритет";
      } else {
        priorityLabel.textContent = "Отметить приоритет";
      }

      const insightLabel = document.getElementById("menu-insight-label");
      if (entry.priority === "insight") {
        insightLabel.textContent = "Снять озарение";
      } else {
        insightLabel.textContent = "Отметить озарение";
      }

      document.getElementById("entry-menu-overlay").style.display = "flex";
    }

    function closeEntryMenu() {
      activeMenuEntryId = null;
      document.getElementById("entry-menu-overlay").style.display = "none";
    }

    async function refreshAllScreens() {
      await renderTodayScreen();
      if (document.getElementById("screen-month").classList.contains("active")) {
        await renderMonthScreen();
      }
      if (document.getElementById("screen-future").classList.contains("active")) {
        await renderFutureScreen();
      }
      if (document.getElementById("screen-collections").classList.contains("active")) {
        await renderCollectionsScreen();
      }
    }

    function bindEntryMenuEvents() {
      document.getElementById("entry-menu-overlay").addEventListener("click", function (event) {
        if (event.target === this) closeEntryMenu();
      });

      document.getElementById("menu-move").addEventListener("click", async function () {
        if (!activeMenuEntryId) return;
        const entry = await dbGet("entries", activeMenuEntryId);
        if (!entry) return;
        closeEntryMenu();
        openEntryPicker("move", entry);
      });

      document.getElementById("menu-change-type").addEventListener("click", async function () {
        if (!activeMenuEntryId) return;
        const entry = await dbGet("entries", activeMenuEntryId);
        if (!entry) return;
        closeEntryMenu();
        openEntryPicker("change-type", entry);
      });

      document.getElementById("menu-assign-coll").addEventListener("click", async function () {
        if (!activeMenuEntryId) return;
        const entryId = activeMenuEntryId;
        closeEntryMenu();
        await openAssignCollModal(entryId);
      });

      document.getElementById("menu-priority").addEventListener("click", async function () {
        if (!activeMenuEntryId) return;
        const entry = await dbGet("entries", activeMenuEntryId);
        if (!entry) return;
        entry.priority = entry.priority === "high" ? null : "high";
        entry.updatedAt = new Date().toISOString();
        await dbPut("entries", entry);
        closeEntryMenu();
        await refreshAllScreens();
      });

      document.getElementById("menu-insight").addEventListener("click", async function () {
        if (!activeMenuEntryId) return;
        const entry = await dbGet("entries", activeMenuEntryId);
        if (!entry) return;
        entry.priority = entry.priority === "insight" ? null : "insight";
        entry.updatedAt = new Date().toISOString();
        await dbPut("entries", entry);
        closeEntryMenu();
        await refreshAllScreens();
      });

      document.getElementById("menu-edit").addEventListener("click", async function () {
        if (!activeMenuEntryId) return;
        const entry = await dbGet("entries", activeMenuEntryId);
        if (!entry) return;
        closeEntryMenu();
        openModal(entry.date, entry, null);
      });

      document.getElementById("menu-irrelevant").addEventListener("click", async function () {
        if (!activeMenuEntryId) return;
        const entry = await dbGet("entries", activeMenuEntryId);
        if (!entry) return;
        entry.status = entry.status === "forgotten" ? "open" : "forgotten";
        entry.updatedAt = new Date().toISOString();
        await dbPut("entries", entry);
        closeEntryMenu();
        await refreshAllScreens();
      });

      document.getElementById("menu-delete").addEventListener("click", async function () {
        if (!activeMenuEntryId) return;
        if (!confirm("Удалить запись?")) return;
        await dbDelete("entries", activeMenuEntryId);
        closeEntryMenu();
        await refreshAllScreens();
      });
    }

    // ===== Entry picker (SPEC §6: "Перенести" / "Изменить тип") =====
    // A lightweight overlay that hosts small forms for picker-driven card
    // actions. Reuses the .migration-picker-* styles defined in modals.css.

    let activePickerEntryId = null;
    let activePickerAction = null;

    function openEntryPicker(action, entry) {
      activePickerEntryId = entry.id;
      activePickerAction = action;

      const title = document.getElementById("entry-picker-title");
      const body = document.getElementById("entry-picker-body");

      if (action === "move") {
        title.textContent = "Перенести задачу";
        body.innerHTML = buildMoveForm(entry);
      } else if (action === "change-type") {
        title.textContent = "Изменить тип";
        body.innerHTML = buildChangeTypeForm(entry);
        attachChangeTypeListeners(body, entry);
      } else {
        return;
      }

      document.getElementById("entry-picker-overlay").style.display = "flex";
    }

    function closeEntryPicker() {
      activePickerEntryId = null;
      activePickerAction = null;
      const body = document.getElementById("entry-picker-body");
      if (body) body.innerHTML = "";
      document.getElementById("entry-picker-overlay").style.display = "none";
    }

    // --- Move form: day picker within current month. ---
    function buildMoveForm(entry) {
      // Constrain to the month the task currently lives in — SPEC §6 forbids
      // jumping horizons from card actions; horizon changes go through the
      // migration ritual.
      const month = (entry.date || "").slice(0, 7) || monthStrFromYM(state.currentYear, state.currentMonth);
      const first = month + "-01";
      const lastDay = new Date(
        parseInt(month.slice(0, 4), 10),
        parseInt(month.slice(5, 7), 10),
        0
      ).getDate();
      const last = month + "-" + String(lastDay).padStart(2, "0");
      return (
        '<div class="migration-picker-form">' +
        '<label class="migration-picker-label">Новая дата</label>' +
        '<input class="migration-picker-input" id="entry-picker-date" type="date"' +
        ' value="' + (entry.date || first) + '"' +
        ' min="' + first + '" max="' + last + '">' +
        '<div class="migration-picker-actions">' +
        '<button class="migration-picker-cancel" id="entry-picker-cancel" type="button">Отмена</button>' +
        '<button class="migration-picker-apply" id="entry-picker-apply" type="button">Применить</button>' +
        "</div>" +
        "</div>"
      );
    }

    // --- Change-type form: target type + type-specific extras. ---
    function buildChangeTypeForm(entry) {
      const types = [
        { id: "task",  label: "· Задача" },
        { id: "event", label: "○ Событие" },
        { id: "note",  label: "— Заметка" }
      ].filter(function (t) { return t.id !== entry.type; });

      const radios = types.map(function (t, i) {
        const checked = i === 0 ? " checked" : "";
        return (
          '<label class="migration-picker-check">' +
          '<input type="radio" name="target-type" value="' + t.id + '"' + checked + "> " +
          t.label + "</label>"
        );
      }).join("");

      return (
        '<div class="migration-picker-form">' +
        '<label class="migration-picker-label">Новый тип</label>' +
        '<div id="entry-picker-types">' + radios + "</div>" +
        '<div id="entry-picker-extras"></div>' +
        '<div class="migration-picker-actions">' +
        '<button class="migration-picker-cancel" id="entry-picker-cancel" type="button">Отмена</button>' +
        '<button class="migration-picker-apply" id="entry-picker-apply" type="button">Применить</button>' +
        "</div>" +
        "</div>"
      );
    }

    function attachChangeTypeListeners(container, entry) {
      const extras = container.querySelector("#entry-picker-extras");
      const radios = container.querySelectorAll('input[name="target-type"]');
      async function renderExtras() {
        const selected = container.querySelector('input[name="target-type"]:checked');
        const target = selected ? selected.value : null;
        extras.innerHTML = await buildTypeExtrasHtml(target, entry);
      }
      radios.forEach(function (r) { r.addEventListener("change", renderExtras); });
      renderExtras();
    }

    async function buildTypeExtrasHtml(targetType, entry) {
      const today = state.currentDate;
      if (targetType === "task") {
        return (
          '<label class="migration-picker-label">Дата</label>' +
          '<input class="migration-picker-input" data-field="date" type="date" value="' +
          (entry.date || today) + '">' +
          '<label class="migration-picker-check">' +
          '<input type="checkbox" data-field="undated"> без даты</label>'
        );
      }
      if (targetType === "event") {
        return (
          '<label class="migration-picker-label">Дата</label>' +
          '<input class="migration-picker-input" data-field="date" type="date" value="' +
          (entry.date || today) + '">' +
          '<label class="migration-picker-label">Время (необязательно)</label>' +
          '<input class="migration-picker-input" data-field="time" type="time" value="' +
          (entry.time || "") + '">'
        );
      }
      if (targetType === "note") {
        const collections = await dbGetAll("collections");
        const collOptions = collections
          .map(function (c) { return '<option value="' + c.id + '">' + escapeHtml(c.name) + "</option>"; })
          .join("");
        const collSelect = collections.length
          ? '<select class="migration-picker-input" data-field="coll" disabled>' + collOptions + "</select>"
          : '<div class="migration-picker-hint">Коллекций пока нет — заметка останется в блоке месяца.</div>';
        return (
          '<label class="migration-picker-check">' +
          '<input type="radio" name="note-target" value="month" data-field="note-target" checked>' +
          " В блоке «Заметки месяца»</label>" +
          (collections.length
            ? '<label class="migration-picker-check">' +
              '<input type="radio" name="note-target" value="coll" data-field="note-target">' +
              " В коллекцию</label>" +
              collSelect
            : collSelect)
        );
      }
      return "";
    }

    function bindEntryPickerEvents() {
      const overlay = document.getElementById("entry-picker-overlay");
      overlay.addEventListener("click", function (event) {
        if (event.target === this) closeEntryPicker();
      });
      document.getElementById("entry-picker-close").addEventListener("click", closeEntryPicker);

      // Delegated because the Apply/Cancel buttons live inside dynamic HTML.
      overlay.addEventListener("click", async function (event) {
        const btn = event.target.closest("#entry-picker-apply, #entry-picker-cancel");
        if (!btn) return;
        if (btn.id === "entry-picker-cancel") {
          closeEntryPicker();
          return;
        }
        // Apply — resolve the current entry + action.
        if (!activePickerEntryId || !activePickerAction) return;
        const entry = await dbGet("entries", activePickerEntryId);
        if (!entry) {
          closeEntryPicker();
          return;
        }

        // Enable coll select when the radio flips (done here because the
        // extras block is re-rendered on every type change; we attach fresh).
        // Note: in practice the listener in attachChangeTypeListeners handles
        // the type switch, but the coll radio change is handled below via
        // event delegation at apply time.
        const body = document.getElementById("entry-picker-body");

        if (activePickerAction === "move") {
          const dateEl = body.querySelector("#entry-picker-date");
          if (!dateEl || !dateEl.value) return;
          entry.date = dateEl.value;
          entry.month = dateEl.value.slice(0, 7);
          entry.status = "open";
          entry.updatedAt = new Date().toISOString();
          await dbPut("entries", entry);
        } else if (activePickerAction === "change-type") {
          const typeEl = body.querySelector('input[name="target-type"]:checked');
          if (!typeEl) return;
          const target = typeEl.value;
          const extras = body.querySelector("#entry-picker-extras");
          const now = new Date().toISOString();
          if (target === "task") {
            const undated = extras.querySelector('[data-field="undated"]');
            const dateEl = extras.querySelector('[data-field="date"]');
            entry.type = "task";
            entry.status = "open";
            entry.time = null;
            entry.collectionId = null;
            if (undated && undated.checked) {
              entry.date = null;
              if (!entry.month) entry.month = monthStrFromYM(state.currentYear, state.currentMonth);
            } else if (dateEl && dateEl.value) {
              entry.date = dateEl.value;
              entry.month = dateEl.value.slice(0, 7);
            } else {
              return;
            }
          } else if (target === "event") {
            const dateEl = extras.querySelector('[data-field="date"]');
            const timeEl = extras.querySelector('[data-field="time"]');
            if (!dateEl || !dateEl.value) return;
            entry.type = "event";
            entry.status = "upcoming";
            entry.date = dateEl.value;
            entry.month = dateEl.value.slice(0, 7);
            entry.time = timeEl && timeEl.value ? timeEl.value : null;
            entry.collectionId = null;
          } else if (target === "note") {
            const noteTarget = extras.querySelector('input[name="note-target"]:checked');
            const collSel = extras.querySelector('[data-field="coll"]');
            entry.type = "note";
            entry.status = "active";
            entry.time = null;
            if (noteTarget && noteTarget.value === "coll" && collSel && collSel.value) {
              entry.collectionId = collSel.value;
            } else {
              entry.collectionId = null;
            }
          }
          entry.updatedAt = now;
          await dbPut("entries", entry);
        }

        closeEntryPicker();
        await refreshAllScreens();
      });

      // Enable/disable coll select when "В коллекцию" radio toggles inside
      // a re-rendered change-type extras block.
      overlay.addEventListener("change", function (event) {
        if (event.target && event.target.name === "note-target") {
          const body = document.getElementById("entry-picker-body");
          const collSel = body.querySelector('[data-field="coll"]');
          if (collSel) {
            collSel.disabled = event.target.value !== "coll";
          }
        }
      });
    }
