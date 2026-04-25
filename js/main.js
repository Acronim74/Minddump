    async function seedDemoDataIfNeeded() {
      // Persistent guard: once demo has been seeded OR the user has wiped
      // their data via Settings → "Очистить", we never re-seed. Without
      // this, an empty database after a manual clear would silently get
      // the demo records back on next launch.
      if (state.demoSeeded) return;
      const allEntries = await dbGetAll("entries");
      if (allEntries.length > 0) {
        state.demoSeeded = true;
        saveSettings();
        return;
      }

      const today = todayStr();
      const yesterday = addDays(today, -1);

      function makeEntry(overrides, offsetMs) {
        const ts = new Date(Date.now() + (offsetMs || 0)).toISOString();
        const date = overrides.date || null;
        return Object.assign(
          {
            id: uid(),
            date: date,
            month: date ? date.slice(0, 7) : null,
            type: "task",
            text: "",
            status: "open",
            priority: null,
            raised: false,
            collectionId: null,
            time: null,
            addenda: [],
            createdAt: ts,
            updatedAt: ts
          },
          overrides
        );
      }

      const demo = [
        makeEntry({ date: today, type: "task", text: "Позвонить врачу", priority: "high" }, 0),
        makeEntry({ date: today, type: "event", text: "Встреча с командой" }, 1000),
        makeEntry({ date: today, type: "note", text: "Заметка про рабочее место", priority: "insight" }, 2000),
        makeEntry({ date: yesterday, type: "task", text: "Отправить отчет" }, -86400000),
        makeEntry({ date: today, type: "event", text: "День рождения мамы", raised: true }, 3000),
        makeEntry(
          { date: addDays(today, 90), type: "task", text: "Пройти курс английского", status: "future" },
          4000
        )
      ];

      for (const item of demo) {
        await dbAdd("entries", item);
      }
      state.demoSeeded = true;
      saveSettings();
    }

    async function migrateSchemaIfNeeded() {
      const entries = await dbGetAll("entries");
      for (const entry of entries) {
        let changed = false;

        if (entry.priority === undefined) {
          entry.priority = null;
          changed = true;
        }
        if (entry.raised === undefined) {
          entry.raised = false;
          changed = true;
        }

        // V4: derive `month` from `date`, fill in time/addenda defaults,
        // rename legacy status `irrelevant` to `forgotten`.
        if (entry.month === undefined) {
          entry.month = entry.date ? entry.date.slice(0, 7) : null;
          changed = true;
        }
        if (entry.type === "event" && entry.time === undefined) {
          entry.time = null;
          changed = true;
        }
        if (entry.addenda === undefined) {
          entry.addenda = [];
          changed = true;
        }
        if (entry.status === "irrelevant") {
          entry.status = "forgotten";
          changed = true;
        }

        if (changed) {
          await dbPut("entries", entry);
        }
      }
    }

    // SPEC §5: unsorted notes auto-migrate into the new month. At app start we
    // pull any note whose `collectionId` is null and whose `month` lies in the
    // past up to the current month. `date` and `createdAt` are preserved for
    // history. Notes attached to a collection never auto-migrate.
    async function autoMigrateLooseNotes() {
      const entries = await dbGetAll("entries");
      const now = new Date();
      const curMonthStr =
        now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");

      for (const entry of entries) {
        if (entry.type !== "note") continue;
        if (entry.collectionId) continue;
        if (entry.status === "forgotten") continue;
        if (!entry.month || entry.month >= curMonthStr) continue;

        entry.month = curMonthStr;
        entry.updatedAt = new Date().toISOString();
        await dbPut("entries", entry);
      }
    }

    async function start() {
      loadSettings();
      await dbInit();
      await migrateSchemaIfNeeded();
      await autoMigrateLooseNotes();
      await seedDemoDataIfNeeded();
      applyShowWeekScreen(state.showWeekScreen);
      bindDayNavEvents();
      bindNavEvents();
      bindWeekNavEvents();
      bindModalEvents();
      bindEntryMenuEvents();
      bindEntryPickerEvents();
      bindAddendaEvents();
      bindMonthNavEvents();
      bindFutureNavEvents();
      bindCollModalEvents();
      bindAssignCollEvents();
      bindSettingsEvents();
      bindMigrationEvents();
      await renderTodayScreen();
    }

    start().catch(function (error) {
      console.error("Ошибка запуска приложения:", error);
      alert("Ошибка запуска приложения. Откройте консоль браузера.");
    });

    // ===== Service worker + auto-update =====
    //
    // The page does three things on every load:
    //   1. Register the SW (creates one if missing).
    //   2. Ask the browser to re-fetch sw.js (`registration.update()`).
    //      If we're online and the server has a new BUILD, this triggers
    //      install of a new SW; if we're offline the call fails silently
    //      and the cached version keeps running.
    //   3. When a new SW finishes installing, tell it to skip the
    //      "waiting" state and immediately take over. The browser fires
    //      `controllerchange` once that happens — we use that signal to
    //      do a one-time soft reload so the page picks up the new code.
    //
    // The `hadController` flag prevents the very first SW install (when
    // there was no controller yet) from triggering an immediate reload
    // for a user who has just opened the app for the first time.
    if ("serviceWorker" in navigator) {
      const hadController = !!navigator.serviceWorker.controller;
      let reloading = false;

      function activateNewWorker(worker) {
        if (!worker) return;
        if (worker.state === "installed") {
          worker.postMessage({ type: "SKIP_WAITING" });
          return;
        }
        worker.addEventListener("statechange", function () {
          if (worker.state === "installed") {
            worker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      }

      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (!hadController) return; // first-ever install: no swap, no reload
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });

      window.addEventListener("load", function () {
        navigator.serviceWorker
          .register("./sw.js", { scope: "./", updateViaCache: "none" })
          .then(function (registration) {
            // If a new SW was already waiting between sessions, activate
            // it right away.
            if (registration.waiting) activateNewWorker(registration.waiting);

            // If the browser is currently installing one, hook into it.
            if (registration.installing) activateNewWorker(registration.installing);

            registration.addEventListener("updatefound", function () {
              activateNewWorker(registration.installing);
            });

            // Proactively check the server for an updated SW. When
            // offline this rejects and we silently keep running.
            registration.update().catch(function () {});
          })
          .catch(function (error) {
            console.warn("SW registration failed:", error);
          });
      });
    }
