const DB_NAME = "minddump-db";
    const DB_VERSION = 4;
    let db = null;

    const nowDate = new Date();
    const COLLECTION_COLORS = [
      "#5ef5c0",
      "#7dd3fc",
      "#c4b5fd",
      "#f55e7a",
      "#f5a623",
      "#facc15",
      "#34d399",
      "#fb7185"
    ];

    const state = {
      currentDate: todayStr(),
      currentMonth: nowDate.getMonth(),
      currentYear: nowDate.getFullYear(),
      futureOffset: 0,
      weekOffset: 0,
      collActiveMenuEntryId: null,
      // User-configurable settings (SPEC §11). Defaults live here and are
      // overwritten by `loadSettings()` if a saved value exists.
      notesOverflowThreshold: 50,
      showWeekScreen: false,
      weekStartsOn: 1,
      // Internal flag — true once demo data has been seeded, OR once the
      // user has explicitly cleared all data. Prevents the seeder from
      // re-populating an empty database after the user wipes it.
      demoSeeded: false
    };
    let activeMenuEntryId = null;

    // ===== Settings persistence (localStorage) =====
    const SETTINGS_KEY = "minddump.settings.v1";

    function loadSettings() {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (typeof saved.notesOverflowThreshold === "number" && saved.notesOverflowThreshold > 0) {
          state.notesOverflowThreshold = saved.notesOverflowThreshold;
        }
        if (typeof saved.showWeekScreen === "boolean") {
          state.showWeekScreen = saved.showWeekScreen;
        }
        if (saved.weekStartsOn === 0 || saved.weekStartsOn === 1) {
          state.weekStartsOn = saved.weekStartsOn;
        }
        if (typeof saved.demoSeeded === "boolean") {
          state.demoSeeded = saved.demoSeeded;
        }
      } catch (err) {
        console.warn("Не удалось загрузить настройки:", err);
      }
    }

    function saveSettings() {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
          notesOverflowThreshold: state.notesOverflowThreshold,
          showWeekScreen: state.showWeekScreen,
          weekStartsOn: state.weekStartsOn,
          demoSeeded: state.demoSeeded
        }));
      } catch (err) {
        console.warn("Не удалось сохранить настройки:", err);
      }
    }

    function uid() {
      return crypto.randomUUID();
    }

    // Addenda badge shown inline on every card that has at least one
    // addendum. Clicking it opens the addenda overlay. Kept in core so all
    // render paths (Today / Month / Future / Collections) share the markup.
    function renderAddendaBadge(entry) {
      const n = entry && entry.addenda ? entry.addenda.length : 0;
      if (!n) return "";
      return (
        '<button type="button" class="addenda-badge js-addenda-open"' +
        ' data-id="' + entry.id + '"' +
        ' title="Дополнений: ' + n + '">+' + n + "</button>"
      );
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function todayStr() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return year + "-" + month + "-" + day;
    }

    function addDays(dateStr, daysDelta) {
      const date = new Date(dateStr + "T00:00:00");
      date.setDate(date.getDate() + daysDelta);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return year + "-" + month + "-" + day;
    }

    function formatDate(dateStr) {
      const date = new Date(dateStr + "T00:00:00");
      return new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        weekday: "long"
      }).format(date);
    }

    function formatNavDate(dateStr) {
      const date = new Date(dateStr + "T00:00:00");
      return new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(date);
    }

    async function dbInit() {
      if (db) return db;

      db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = function (event) {
          const database = request.result;
          const oldVersion = event.oldVersion || 0;

          if (!database.objectStoreNames.contains("entries")) {
            const entriesStore = database.createObjectStore("entries", { keyPath: "id" });
            entriesStore.createIndex("date", "date", { unique: false });
            entriesStore.createIndex("status", "status", { unique: false });
            entriesStore.createIndex("collectionId", "collectionId", { unique: false });
          }

          if (!database.objectStoreNames.contains("collections")) {
            database.createObjectStore("collections", { keyPath: "id" });
          }

          // V4: month and type indices for fast horizon/type filtering.
          if (oldVersion < 4) {
            const tx = request.transaction;
            const entriesStore = tx.objectStore("entries");
            if (!entriesStore.indexNames.contains("month")) {
              entriesStore.createIndex("month", "month", { unique: false });
            }
            if (!entriesStore.indexNames.contains("type")) {
              entriesStore.createIndex("type", "type", { unique: false });
            }
          }
        };

        request.onsuccess = function () {
          resolve(request.result);
        };

        request.onerror = function () {
          reject(request.error);
        };
      });

      return db;
    }

    async function dbAdd(store, obj) {
      await dbInit();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        const os = tx.objectStore(store);
        const req = os.add(obj);
        req.onsuccess = function () {
          resolve(req.result);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    }

    async function dbGetAll(store) {
      await dbInit();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const os = tx.objectStore(store);
        const req = os.getAll();
        req.onsuccess = function () {
          resolve(req.result || []);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    }

    async function dbGet(store, id) {
      await dbInit();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const os = tx.objectStore(store);
        const req = os.get(id);
        req.onsuccess = function () {
          resolve(req.result || null);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    }

    async function dbPut(store, obj) {
      await dbInit();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        const os = tx.objectStore(store);
        const req = os.put(obj);
        req.onsuccess = function () {
          resolve(req.result);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    }

    async function dbDelete(store, id) {
      await dbInit();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        const os = tx.objectStore(store);
        const req = os.delete(id);
        req.onsuccess = function () {
          resolve(true);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    }

    async function dbGetByIndex(store, indexName, value) {
      await dbInit();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const os = tx.objectStore(store);
        const idx = os.index(indexName);
        const req = idx.getAll(value);
        req.onsuccess = function () {
          resolve(req.result || []);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    }

    function getSymbolByEntry(entry) {
      if (entry.status === "done") {
        return { char: "×", color: "var(--text-muted)" };
      }
      if (entry.status === "migrated") {
        return { char: "›", color: "var(--warning)" };
      }
      if (entry.status === "future") {
        return { char: "‹", color: "#c4b5fd" };
      }
      if (entry.status === "forgotten" || entry.status === "irrelevant") {
        return { char: "~", color: "var(--text-muted)" };
      }
      if (entry.type === "event") {
        return { char: "○", color: "#7dd3fc" };
      }
      if (entry.type === "note") {
        return { char: "—", color: "#c4b5fd" };
      }
      return { char: "·", color: "var(--accent)" };
    }

    function getPriorityMarker(entry) {
      if (!entry || !entry.priority) return null;
      if (entry.priority === "high") {
        return { char: "*", color: "var(--warning)" };
      }
      if (entry.priority === "insight") {
        return { char: "!", color: "#c4b5fd" };
      }
      return null;
    }

    function renderPriorityHtml(entry) {
      const marker = getPriorityMarker(entry);
      if (!marker) {
        return '<span class="entry-priority"></span>';
      }
      return (
        '<span class="entry-priority" style="color:' +
        marker.color +
        '" title="' +
        (entry.priority === "high" ? "Высокий приоритет" : "Озарение") +
        '">' +
        marker.char +
        "</span>"
      );
    }

    function statusClassFor(entry) {
      return entry && entry.status ? "status-" + entry.status : "status-open";
    }

    async function hasOpenOnDate(dateStr) {
      const dayEntries = await dbGetByIndex("entries", "date", dateStr);
      return dayEntries.some(function (item) {
        return item.status === "open";
      });
    }

    async function countOpenOnDate(dateStr) {
      const dayEntries = await dbGetByIndex("entries", "date", dateStr);
      return dayEntries.filter(function (item) {
        return item.status === "open";
      }).length;
    }

    function monthStrFromYM(year, month) {
      return year + "-" + String(month + 1).padStart(2, "0");
    }

    function prevMonthYM(year, month) {
      if (month === 0) return { year: year - 1, month: 11 };
      return { year: year, month: month - 1 };
    }

