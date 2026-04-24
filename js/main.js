    async function seedDemoDataIfNeeded() {
      const allEntries = await dbGetAll("entries");
      if (allEntries.length > 0) return;

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
      await dbInit();
      await migrateSchemaIfNeeded();
      await autoMigrateLooseNotes();
      await seedDemoDataIfNeeded();
      bindDayNavEvents();
      bindNavEvents();
      bindModalEvents();
      bindEntryMenuEvents();
      bindEntryPickerEvents();
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

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker
          .register("sw.js")
          .then(function (registration) {
            console.log("SW registered:", registration.scope);
          })
          .catch(function (error) {
            console.log("SW registration failed:", error);
          });
      });
    }
