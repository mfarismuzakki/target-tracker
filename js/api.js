/* =====================================================================
   API — lapisan komunikasi data
   ---------------------------------------------------------------------
   Menyediakan satu objek `API` dengan method yang sama, baik untuk:
   - MODE DEMO (MOCK)  : data contoh tersimpan di localStorage perangkat.
   - MODE NYATA        : memanggil Google Apps Script Web App (Sheets).

   Catatan CORS: request POST sengaja TIDAK menyetel header Content-Type
   (default "text/plain") agar tergolong "simple request" dan tidak memicu
   CORS preflight yang tidak ditangani Apps Script. Server mem-parse body
   dengan JSON.parse(e.postData.contents).
   ===================================================================== */
(function () {
  "use strict";

  const PIN_KEY = "tt_pin";
  const MOCK_KEY = "tt_mock_db";

  /* ---------- util kecil ---------- */
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const shift = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return ymd(d); };

  /* ---------- PIN (disimpan di perangkat, bukan rahasia server) ---------- */
  function getPin() { return localStorage.getItem(PIN_KEY) || ""; }
  function setPin(p) { localStorage.setItem(PIN_KEY, p); }
  function clearPin() { localStorage.removeItem(PIN_KEY); }

  /* =================================================================
     MODE NYATA — panggilan ke Apps Script
     ================================================================= */
  function ensureUrl() {
    if (!window.APP_CONFIG.APPS_SCRIPT_URL) {
      throw new Error("APPS_SCRIPT_URL belum diisi di js/config.js");
    }
  }
  async function callGet(action, params) {
    ensureUrl();
    const url = new URL(window.APP_CONFIG.APPS_SCRIPT_URL);
    url.searchParams.set("action", action);
    url.searchParams.set("pin", getPin());
    for (const k in (params || {})) url.searchParams.set(k, params[k]);
    const res = await fetch(url.toString(), { method: "GET", redirect: "follow" });
    return res.json();
  }
  async function callPost(action, payload) {
    ensureUrl();
    const body = JSON.stringify(Object.assign({ action, pin: getPin() }, payload));
    const res = await fetch(window.APP_CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      body, // tanpa header => Content-Type text/plain => tanpa preflight
    });
    return res.json();
  }

  /* =================================================================
     MODE DEMO — "database" di localStorage
     ================================================================= */
  function seedDB() {
    const targets = [
      mkTarget("suami",  "Tilawah Al-Qur'an", "daily",   "quantity", 4, "halaman", 1),
      mkTarget("istri",  "Tilawah Al-Qur'an", "daily",   "quantity", 4, "halaman", 2),
      mkTarget("suami",  "Shalat Dhuha",      "daily",   "checkbox", 1, "kali",    3),
      mkTarget("shared", "Shalat Subuh berjamaah", "daily", "checkbox", 1, "kali",  4),
      mkTarget("suami",  "Angkat beban",      "weekly",  "checkbox", 3, "kali",    5),
      mkTarget("istri",  "Olahraga",          "weekly",  "checkbox", 3, "kali",    6),
      mkTarget("shared", "Sedekah",           "monthly", "quantity", 4, "kali",    7),
      mkTarget("shared", "Khatam Al-Qur'an",  "yearly",  "quantity", 2, "kali",    8),
    ];
    const byTitle = (own, t) => targets.find(x => x.owner === own && x.title === t).id;
    const logs = [
      mkLog(byTitle("suami", "Tilawah Al-Qur'an"), shift(0), 2),
      mkLog(byTitle("istri", "Tilawah Al-Qur'an"), shift(0), 4),
      mkLog(byTitle("suami", "Tilawah Al-Qur'an"), shift(-1), 4),
      mkLog(byTitle("shared", "Shalat Subuh berjamaah"), shift(0), 1),
      mkLog(byTitle("suami", "Angkat beban"), shift(-2), 1),
      mkLog(byTitle("suami", "Angkat beban"), shift(0), 1),
      mkLog(byTitle("shared", "Sedekah"), shift(-3), 2),
    ];
    const notes = [
      mkNote(shift(0), "shared", "Alhamdulillah, semangat memulai tracker keluarga 💪"),
    ];
    const members = [
      { id: "suami", name: "Faris", role: "Suami", telegram_chat_id: "" },
      { id: "istri", name: "Indana", role: "Istri", telegram_chat_id: "" },
    ];
    return { members, targets, logs, notes };
  }
  function mkTarget(owner, title, period, type, goal, unit, sort) {
    return { id: uid(), owner, title, period, type, goal, unit, active: true, sort,
             created_at: new Date().toISOString() };
  }
  function mkLog(target_id, date, value, note) {
    return { id: uid(), target_id, date, value, note: note || "",
             created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  }
  function mkNote(date, member, text) {
    return { id: uid(), date, member, text,
             created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  }
  function loadDB() {
    const raw = localStorage.getItem(MOCK_KEY);
    if (raw) { try { return JSON.parse(raw); } catch (e) { /* reseed */ } }
    const db = seedDB();
    saveDB(db);
    return db;
  }
  function saveDB(db) { localStorage.setItem(MOCK_KEY, JSON.stringify(db)); }

  const mock = {
    async getState() {
      const db = loadDB();
      return { ok: true, members: db.members, targets: db.targets, logs: db.logs, notes: db.notes };
    },
    async setLog(p) {
      const db = loadDB();
      let log = db.logs.find(l => l.target_id === p.target_id && l.date === p.date);
      if (log) {
        log.value = p.value;
        if (p.note !== undefined) log.note = p.note;
        log.updated_at = new Date().toISOString();
      } else {
        log = mkLog(p.target_id, p.date, p.value, p.note);
        db.logs.push(log);
      }
      saveDB(db);
      return { ok: true, log };
    },
    async deleteLog(id) {
      const db = loadDB();
      db.logs = db.logs.filter(l => l.id !== id);
      saveDB(db);
      return { ok: true };
    },
    async addTarget(t) {
      const db = loadDB();
      const target = mkTarget(t.owner, t.title, t.period, t.type, Number(t.goal), t.unit,
                              db.targets.length + 1);
      db.targets.push(target);
      saveDB(db);
      return { ok: true, target };
    },
    async updateTarget(t) {
      const db = loadDB();
      const target = db.targets.find(x => x.id === t.id);
      if (!target) return { ok: false, error: "not_found" };
      Object.assign(target, {
        owner: t.owner, title: t.title, period: t.period, type: t.type,
        goal: Number(t.goal), unit: t.unit,
        active: t.active === undefined ? target.active : t.active,
      });
      saveDB(db);
      return { ok: true, target };
    },
    async deleteTarget(id) {
      const db = loadDB();
      db.targets = db.targets.filter(t => t.id !== id);
      db.logs = db.logs.filter(l => l.target_id !== id);
      saveDB(db);
      return { ok: true };
    },
    async addNote(n) {
      const db = loadDB();
      const note = mkNote(n.date, n.member, n.text);
      db.notes.push(note);
      saveDB(db);
      return { ok: true, note };
    },
    async updateNote(n) {
      const db = loadDB();
      const note = db.notes.find(x => x.id === n.id);
      if (!note) return { ok: false, error: "not_found" };
      note.text = n.text;
      note.updated_at = new Date().toISOString();
      saveDB(db);
      return { ok: true, note };
    },
    async deleteNote(id) {
      const db = loadDB();
      db.notes = db.notes.filter(n => n.id !== id);
      saveDB(db);
      return { ok: true };
    },
    async setMemberName(id, name) {
      const db = loadDB();
      const m = db.members.find(x => x.id === id);
      if (m) { m.name = name; saveDB(db); }
      return { ok: true, member: m };
    },
  };

  /* =================================================================
     API publik — memilih mock atau nyata
     ================================================================= */
  const isMock = () => !!window.APP_CONFIG.MOCK;

  // Pancarkan event mulai/selesai agar UI bisa menampilkan loader untuk
  // SETIAP panggilan API (di mode demo pun, walau sangat cepat).
  let _pending = 0;
  function track(promise) {
    _pending++;
    window.dispatchEvent(new CustomEvent("api:start"));
    return Promise.resolve(promise).finally(() => {
      _pending = Math.max(0, _pending - 1);
      window.dispatchEvent(new CustomEvent("api:end", { detail: { pending: _pending } }));
    });
  }

  window.API = {
    getPin, setPin, clearPin,
    isMock,

    getState:      ()  => track(isMock() ? mock.getState()        : callGet("getState")),
    setLog:        (p) => track(isMock() ? mock.setLog(p)         : callPost("setLog", p)),
    deleteLog:     (id)=> track(isMock() ? mock.deleteLog(id)     : callPost("deleteLog", { id })),
    addTarget:     (t) => track(isMock() ? mock.addTarget(t)      : callPost("addTarget", t)),
    updateTarget:  (t) => track(isMock() ? mock.updateTarget(t)   : callPost("updateTarget", t)),
    deleteTarget:  (id)=> track(isMock() ? mock.deleteTarget(id)  : callPost("deleteTarget", { id })),
    addNote:       (n) => track(isMock() ? mock.addNote(n)        : callPost("addNote", n)),
    updateNote:    (n) => track(isMock() ? mock.updateNote(n)     : callPost("updateNote", n)),
    deleteNote:    (id)=> track(isMock() ? mock.deleteNote(id)    : callPost("deleteNote", { id })),
    setMemberName: (id, name) => track(isMock() ? mock.setMemberName(id, name)
                                                 : callPost("setMemberName", { id, name })),

    // Untuk MODE DEMO: kosongkan data contoh agar ter-seed ulang.
    _resetMock: () => localStorage.removeItem(MOCK_KEY),
  };
})();
