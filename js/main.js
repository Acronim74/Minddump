    async function seedDemoDataIfNeeded() {
      const allEntries = await dbGetAll("entries");
      if (allEntries.length > 0) return;

      const nowIso = new Date().toISOString();
      const today = todayStr();
      const yesterday = addDays(today, -1);

      const demo = [
        {
          id: uid(),
          date: today,
          type: "task",
          text: "Позвонить врачу",
          status: "open",
          priority: "high",
          raised: false,
          collectionId: null,
          createdAt: nowIso,
          updatedAt: nowIso
        },
        {
          id: uid(),
          date: today,
          type: "event",
          text: "Встреча с командой",
          status: "open",
          priority: null,
          raised: false,
          collectionId: null,
          createdAt: new Date(Date.now() + 1000).toISOString(),
          updatedAt: new Date(Date.now() + 1000).toISOString()
        },
        {
          id: uid(),
          date: today,
          type: "note",
          text: "Заметка про рабочее место",
          status: "open",
          priority: "insight",
          raised: false,
          collectionId: null,
          createdAt: new Date(Date.now() + 2000).toISOString(),
          updatedAt: new Date(Date.now() + 2000).toISOString()
        },
        {
          id: uid(),
          date: yesterday,
          type: "task",
          text: "Отправить отчет",
          status: "open",
          priority: null,
          raised: false,
          collectionId: null,
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          updatedAt: new Date(Date.now() - 86400000).toISOString()
        },
        {
          id: uid(),
          date: today,
          type: "event",
          text: "День рождения мамы",
          status: "open",
          priority: null,
          raised: true,
          collectionId: null,
          createdAt: new Date(Date.now() + 3000).toISOString(),
          updatedAt: new Date(Date.now() + 3000).toISOString()
        },
        {
          id: uid(),
          date: addDays(today, 90),
          type: "task",
          text: "Пройти курс английского",
          status: "future",
          priority: null,
          raised: false,
          collectionId: null,
          createdAt: new Date(Date.now() + 4000).toISOString(),
          updatedAt: new Date(Date.now() + 4000).toISOString()
        }
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
        if (changed) {
          await dbPut("entries", entry);
        }
      }
    }

    async function start() {
      await dbInit();
      await migrateSchemaIfNeeded();
      await seedDemoDataIfNeeded();
      bindDayNavEvents();
      bindNavEvents();
      bindModalEvents();
      bindEntryMenuEvents();
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
