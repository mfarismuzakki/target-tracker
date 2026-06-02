/* =====================================================================
   STORE — state aplikasi, util tanggal, dan perhitungan progres
   ===================================================================== */
(function () {
  "use strict";

  const pad = (n) => String(n).padStart(2, "0");

  const Store = {
    /* ---------- state ---------- */
    members: [],
    targets: [],
    logs: [],
    notes: [],

    scope: "suami",            // suami | istri | shared
    route: "today",            // today | calendar | targets
    cal: { y: 0, m: 0 },       // kursor bulan kalender (m: 0-11)

    /* ---------- util tanggal ---------- */
    ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
    parse(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); },
    today() { return this.ymd(new Date()); },

    /* Jendela periode (start..end, inklusif) sebagai string YYYY-MM-DD */
    periodWindow(period, refStr) {
      const ref = this.parse(refStr || this.today());
      const ws = (window.APP_CONFIG.WEEK_START ?? 1);
      let start, end;
      if (period === "daily") {
        start = new Date(ref); end = new Date(ref);
      } else if (period === "weekly") {
        const off = (ref.getDay() - ws + 7) % 7;
        start = new Date(ref); start.setDate(ref.getDate() - off);
        end = new Date(start); end.setDate(start.getDate() + 6);
      } else if (period === "monthly") {
        start = new Date(ref.getFullYear(), ref.getMonth(), 1);
        end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      } else { // yearly
        start = new Date(ref.getFullYear(), 0, 1);
        end = new Date(ref.getFullYear(), 11, 31);
      }
      return { start: this.ymd(start), end: this.ymd(end) };
    },

    /* ---------- query ---------- */
    memberName(id) {
      if (id === "shared") return "Bersama";
      const hard = (window.APP_CONFIG.MEMBERS || {})[id];
      if (hard) return hard;
      const m = this.members.find(x => x.id === id);
      return m ? m.name : id;
    },
    activeTargets() {
      return this.targets
        .filter(t => t.active !== false)
        .sort((a, b) => (a.sort || 0) - (b.sort || 0));
    },
    targetsForScope(scope) {
      return this.activeTargets().filter(t => t.owner === scope);
    },
    targetById(id) { return this.targets.find(t => t.id === id); },

    /* Total nilai sebuah target dalam periode yang memuat refStr */
    progress(target, refStr) {
      const w = this.periodWindow(target.period, refStr);
      let total = 0;
      for (const l of this.logs) {
        if (l.target_id === target.id && l.date >= w.start && l.date <= w.end) {
          total += Number(l.value) || 0;
        }
      }
      const goal = Number(target.goal) || 0;
      const percent = goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : 0;
      return { total, goal, percent, done: total >= goal, window: w };
    },

    /* Nilai log untuk satu target pada satu tanggal (0 bila belum ada) */
    logValue(target_id, dateStr) {
      const l = this.logs.find(x => x.target_id === target_id && x.date === dateStr);
      return l ? Number(l.value) || 0 : 0;
    },
    logRow(target_id, dateStr) {
      return this.logs.find(x => x.target_id === target_id && x.date === dateStr) || null;
    },
    notesForDate(dateStr) {
      return this.notes.filter(n => n.date === dateStr);
    },
    logsForDate(dateStr) {
      return this.logs.filter(l => l.date === dateStr);
    },

    /* ---------- mutasi state lokal (setelah API sukses) ---------- */
    setState(s) {
      this.members = s.members || [];
      this.targets = s.targets || [];
      this.logs = s.logs || [];
      this.notes = s.notes || [];
    },
    upsertLog(log) {
      const i = this.logs.findIndex(l => l.id === log.id);
      if (i >= 0) this.logs[i] = log; else this.logs.push(log);
    },
    removeLog(id) { this.logs = this.logs.filter(l => l.id !== id); },
    upsertTarget(t) {
      const i = this.targets.findIndex(x => x.id === t.id);
      if (i >= 0) this.targets[i] = t; else this.targets.push(t);
    },
    removeTarget(id) {
      this.targets = this.targets.filter(t => t.id !== id);
      this.logs = this.logs.filter(l => l.target_id !== id);
    },
    upsertNote(n) {
      const i = this.notes.findIndex(x => x.id === n.id);
      if (i >= 0) this.notes[i] = n; else this.notes.push(n);
    },
    removeNote(id) { this.notes = this.notes.filter(n => n.id !== id); },
  };

  // inisialisasi kursor kalender ke bulan ini
  const now = new Date();
  Store.cal = { y: now.getFullYear(), m: now.getMonth() };

  window.Store = Store;
})();
