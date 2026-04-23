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

      const raiseItem = document.getElementById("menu-raise");
      if (entry && !entry.raised) {
        raiseItem.style.display = "";
      } else {
        raiseItem.style.display = "none";
      }

      const priorityLabel = document.getElementById("menu-priority-label");
      if (entry && entry.priority === "high") {
        priorityLabel.textContent = "Снять приоритет";
      } else {
        priorityLabel.textContent = "Отметить приоритет";
      }

      const insightLabel = document.getElementById("menu-insight-label");
      if (entry && entry.priority === "insight") {
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

      document.getElementById("menu-migrate").addEventListener("click", async function () {
        if (!activeMenuEntryId) return;
        const entry = await dbGet("entries", activeMenuEntryId);
        if (!entry) return;
        entry.date = addDays(entry.date, 1);
        entry.status = "migrated";
        entry.updatedAt = new Date().toISOString();
        await dbPut("entries", entry);
        closeEntryMenu();
        await refreshAllScreens();
      });

      document.getElementById("menu-future").addEventListener("click", async function () {
        if (!activeMenuEntryId) return;
        const entry = await dbGet("entries", activeMenuEntryId);
        if (!entry) return;
        entry.status = "future";
        entry.updatedAt = new Date().toISOString();
        await dbPut("entries", entry);
        closeEntryMenu();
        await refreshAllScreens();
      });

      document.getElementById("menu-raise").addEventListener("click", async function () {
        if (!activeMenuEntryId) return;
        const entry = await dbGet("entries", activeMenuEntryId);
        if (!entry) return;
        entry.raised = true;
        entry.updatedAt = new Date().toISOString();
        await dbPut("entries", entry);
        closeEntryMenu();
        await refreshAllScreens();
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
        entry.status = entry.status === "irrelevant" ? "open" : "irrelevant";
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
