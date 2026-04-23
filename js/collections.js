    async function renderCollectionsScreen() {
      const collections = await dbGetAll("collections");
      collections.sort(function (a, b) {
        return a.name.localeCompare(b.name, "ru");
      });

      const allEntries = await dbGetAll("entries");
      const listEl = document.getElementById("collections-list");

      if (!collections.length) {
        listEl.innerHTML =
          '<div class="coll-empty-state">' +
          "Нет коллекций<br>" +
          '<small style="font-size:12px">Нажмите + чтобы создать первую</small>' +
          "</div>";
        return;
      }

      listEl.innerHTML = collections
        .map(function (coll) {
          // В V1 в коллекциях живут только заметки. Забытые скрываем.
          // Если в БД по исторической причине остались task/event с collectionId —
          // не показываем их здесь: они останутся в своих временных срезах.
          const collEntries = allEntries.filter(function (e) {
            return (
              e.collectionId === coll.id &&
              e.type === "note" &&
              e.status !== "forgotten"
            );
          });
          const count = collEntries.length;

          const entriesHtml = collEntries
            .map(function (entry) {
              const sym = getSymbolByEntry(entry);
              const statusClass = statusClassFor(entry);
              const priorityHtml = renderPriorityHtml(entry);
              return (
                '<div class="coll-entry-row ' +
                statusClass +
                '" data-id="' +
                entry.id +
                '">' +
                priorityHtml +
                '<span class="coll-entry-symbol" style="color:' +
                sym.color +
                '">' +
                sym.char +
                "</span>" +
                '<span class="coll-entry-text">' +
                escapeHtml(entry.text) +
                "</span>" +
                '<button class="coll-entry-del" data-action="delete-coll-entry" data-id="' +
                entry.id +
                '" type="button" title="Удалить">×</button>' +
                "</div>"
              );
            })
            .join("");

          return (
            '<div class="coll-block" data-coll-id="' +
            coll.id +
            '">' +
            '<div class="coll-block-header" data-toggle-coll="' +
            coll.id +
            '">' +
            '<span class="coll-dot" style="background:' +
            coll.color +
            '"></span>' +
            '<span class="coll-block-name">' +
            escapeHtml(coll.name) +
            "</span>" +
            '<span class="coll-block-count">' +
            (count || "") +
            "</span>" +
            '<div class="coll-block-actions">' +
            '<button class="coll-icon-btn" data-action="edit-coll" data-id="' +
            coll.id +
            '" type="button" title="Переименовать">✎</button>' +
            '<button class="coll-icon-btn danger" data-action="delete-coll" data-id="' +
            coll.id +
            '" type="button" title="Удалить">×</button>' +
            "</div>" +
            '<span class="coll-toggle-icon">▸</span>' +
            "</div>" +
            '<div class="coll-block-body collapsed" data-coll-body="' +
            coll.id +
            '">' +
            entriesHtml +
            '<button class="coll-add-entry-btn" data-action="add-coll-entry" data-coll-id="' +
            coll.id +
            '" type="button">+ Добавить запись</button>' +
            "</div>" +
            "</div>"
          );
        })
        .join("");

      bindCollectionsEvents();
    }

    function bindCollectionsEvents() {
      const listEl = document.getElementById("collections-list");

      listEl.onclick = async function (event) {
        const header = event.target.closest("[data-toggle-coll]");
        if (header && !event.target.closest("[data-action]")) {
          const collId = header.getAttribute("data-toggle-coll");
          const body = listEl.querySelector('[data-coll-body="' + collId + '"]');
          const icon = header.querySelector(".coll-toggle-icon");
          if (body) {
            const isCollapsed = body.classList.contains("collapsed");
            body.classList.toggle("collapsed", !isCollapsed);
            if (icon) icon.textContent = isCollapsed ? "▾" : "▸";
          }
          return;
        }

        const btn = event.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if (action === "edit-coll") {
          event.stopPropagation();
          const coll = await dbGet("collections", id);
          if (!coll) return;
          openCollModal(coll);
          return;
        }

        if (action === "delete-coll") {
          event.stopPropagation();
          const coll = await dbGet("collections", id);
          if (!coll) return;
          if (!confirm('Удалить коллекцию «' + coll.name + '»?\nЗаписи останутся, но потеряют привязку.')) return;
          const allEntries = await dbGetAll("entries");
          for (let i = 0; i < allEntries.length; i++) {
            const ent = allEntries[i];
            if (ent.collectionId === id) {
              ent.collectionId = null;
              ent.updatedAt = new Date().toISOString();
              await dbPut("entries", ent);
            }
          }
          await dbDelete("collections", id);
          await renderCollectionsScreen();
          return;
        }

        if (action === "delete-coll-entry") {
          const entry = await dbGet("entries", id);
          if (!entry) return;
          if (!confirm("Удалить запись?")) return;
          await dbDelete("entries", id);
          await renderCollectionsScreen();
          return;
        }

        if (action === "add-coll-entry") {
          const collId = btn.dataset.collId;
          openModal(state.currentDate, null, collId);
          return;
        }
      };
    }

    function openCollModal(collToEdit) {
      const overlay = document.getElementById("collection-modal-overlay");
      const titleEl = document.getElementById("coll-modal-title");
      const editIdEl = document.getElementById("coll-modal-edit-id");
      const nameEl = document.getElementById("coll-modal-name");

      const picker = document.getElementById("coll-color-picker");
      const selectedColor = collToEdit ? collToEdit.color : COLLECTION_COLORS[0];
      picker.innerHTML = COLLECTION_COLORS.map(function (c) {
        return (
          '<div class="coll-color-swatch' +
          (c === selectedColor ? " active" : "") +
          '" data-color="' +
          c +
          '" style="background:' +
          c +
          '"></div>'
        );
      }).join("");

      if (collToEdit) {
        titleEl.textContent = "Редактировать";
        editIdEl.value = collToEdit.id;
        nameEl.value = collToEdit.name;
      } else {
        titleEl.textContent = "Новая коллекция";
        editIdEl.value = "";
        nameEl.value = "";
      }

      overlay.style.display = "flex";
      setTimeout(function () {
        nameEl.focus();
      }, 50);
    }

    function closeCollModal() {
      document.getElementById("collection-modal-overlay").style.display = "none";
    }

    function bindCollModalEvents() {
      document.getElementById("coll-color-picker").addEventListener("click", function (event) {
        const swatch = event.target.closest(".coll-color-swatch");
        if (!swatch) return;
        document.querySelectorAll(".coll-color-swatch").forEach(function (s) {
          s.classList.remove("active");
        });
        swatch.classList.add("active");
      });

      document.getElementById("coll-modal-close").addEventListener("click", closeCollModal);
      document.getElementById("coll-modal-cancel").addEventListener("click", closeCollModal);

      document.getElementById("collection-modal-overlay").addEventListener("click", function (event) {
        if (event.target === this) closeCollModal();
      });

      document.getElementById("coll-modal-save").addEventListener("click", async function () {
        const name = document.getElementById("coll-modal-name").value.trim();
        if (!name) {
          document.getElementById("coll-modal-name").focus();
          return;
        }

        const activeSwatch = document.querySelector("#coll-color-picker .coll-color-swatch.active");
        const color = activeSwatch ? activeSwatch.dataset.color : COLLECTION_COLORS[0];
        const editId = document.getElementById("coll-modal-edit-id").value;
        const now = new Date().toISOString();

        if (editId) {
          const existing = await dbGet("collections", editId);
          if (existing) {
            existing.name = name;
            existing.color = color;
            existing.updatedAt = now;
            await dbPut("collections", existing);
          }
        } else {
          await dbAdd("collections", {
            id: uid(),
            name: name,
            color: color,
            createdAt: now
          });
        }

        closeCollModal();
        await renderCollectionsScreen();
      });

      document.getElementById("coll-modal-name").addEventListener("keydown", function (event) {
        if (event.key === "Enter") document.getElementById("coll-modal-save").click();
        if (event.key === "Escape") closeCollModal();
      });

      document.getElementById("new-collection-btn").addEventListener("click", function () {
        openCollModal(null);
      });
    }

    async function openAssignCollModal(entryId) {
      state.collActiveMenuEntryId = entryId;
      const collections = await dbGetAll("collections");
      const listEl = document.getElementById("assign-coll-list");

      if (!collections.length) {
        listEl.innerHTML =
          '<div style="padding:14px;color:var(--text-muted);font-size:13px">Нет коллекций. Создайте их на вкладке Коллекции.</div>';
      } else {
        listEl.innerHTML = collections
          .map(function (c) {
            return (
              '<div class="assign-coll-item" data-coll-id="' +
              c.id +
              '">' +
              '<span class="coll-dot" style="background:' +
              c.color +
              '"></span>' +
              escapeHtml(c.name) +
              "</div>"
            );
          })
          .join("");
      }

      document.getElementById("assign-coll-overlay").style.display = "flex";
    }

    function closeAssignCollModal() {
      state.collActiveMenuEntryId = null;
      document.getElementById("assign-coll-overlay").style.display = "none";
    }

    function bindAssignCollEvents() {
      document.getElementById("assign-coll-close").addEventListener("click", closeAssignCollModal);
      document.getElementById("assign-coll-overlay").addEventListener("click", function (event) {
        if (event.target === this) closeAssignCollModal();
      });

      document.getElementById("assign-coll-list").addEventListener("click", async function (event) {
        const item = event.target.closest("[data-coll-id]");
        if (!item) return;
        const collId = item.dataset.collId;
        const entryId = state.collActiveMenuEntryId;
        if (!entryId) return;

        const entry = await dbGet("entries", entryId);
        if (!entry) return;
        entry.collectionId = collId;
        entry.updatedAt = new Date().toISOString();
        await dbPut("entries", entry);

        closeAssignCollModal();
        closeEntryMenu();
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
      });
    }

