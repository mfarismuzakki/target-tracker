/* =====================================================================
   STATS.JS — perhitungan performa + gamifikasi (level, poin, streak,
   lencana) dan render halaman Statistik. Semua dihitung dari Store.
   ===================================================================== */
(function () {
  "use strict";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

  const LEVELS = [
    { min: 0,     title: "Pemula" },
    { min: 100,   title: "Rajin" },
    { min: 300,   title: "Istiqomah" },
    { min: 700,   title: "Mujahid" },
    { min: 1500,  title: "Teladan" },
    { min: 3000,  title: "Ahli Ibadah" },
    { min: 6000,  title: "Bintang" },
    { min: 12000, title: "Legenda" },
  ];

  function scopeTargets(scope) { return Store.targetsForScope(scope); }
  function dailyTargets(scope) { return scopeTargets(scope).filter(t => t.period === "daily"); }
  function idSet(scope) { return new Set(scopeTargets(scope).map(t => t.id)); }

  /* peta tanggal -> jumlah amal (log > 0) untuk scope */
  function activityByDate(scope) {
    const ids = idSet(scope);
    const map = {};
    for (const l of Store.logs) {
      if (!ids.has(l.target_id)) continue;
      if ((Number(l.value) || 0) <= 0) continue;
      map[l.date] = (map[l.date] || 0) + 1;
    }
    return map;
  }

  /* streak berjalan (hari beruntun dengan ≥1 amal, berakhir hari ini / kemarin) */
  function streak(scope) {
    const act = activityByDate(scope);
    let s = 0;
    const d = Store.parse(Store.today());
    if (!act[Store.ymd(d)]) d.setDate(d.getDate() - 1);
    while (act[Store.ymd(d)]) { s++; d.setDate(d.getDate() - 1); }
    return s;
  }

  /* streak terbaik sepanjang masa */
  function bestStreak(scope) {
    const act = activityByDate(scope);
    const days = Object.keys(act).sort();
    let best = 0, cur = 0, prev = null;
    for (const ds of days) {
      if (prev) {
        const pd = Store.parse(prev); pd.setDate(pd.getDate() + 1);
        cur = (Store.ymd(pd) === ds) ? cur + 1 : 1;
      } else cur = 1;
      best = Math.max(best, cur);
      prev = ds;
    }
    return best;
  }

  /* total poin: tiap amal +5, tiap target harian tuntas +10 */
  function points(scope) {
    const ids = idSet(scope);
    const tById = {}; scopeTargets(scope).forEach(t => tById[t.id] = t);
    let entries = 0, dailyDone = 0;
    for (const l of Store.logs) {
      if (!ids.has(l.target_id)) continue;
      const v = Number(l.value) || 0; if (v <= 0) continue;
      entries++;
      const t = tById[l.target_id];
      if (t && t.period === "daily" && v >= (Number(t.goal) || 1)) dailyDone++;
    }
    return entries * 5 + dailyDone * 10;
  }

  function level(pts) {
    let idx = 0;
    for (let i = 0; i < LEVELS.length; i++) if (pts >= LEVELS[i].min) idx = i;
    const cur = LEVELS[idx], next = LEVELS[idx + 1] || null;
    const pct = next ? Math.round(((pts - cur.min) / (next.min - cur.min)) * 100) : 100;
    return { num: idx + 1, title: cur.title, pts, next, pct, toNext: next ? next.min - pts : 0 };
  }

  /* N hari terakhir: fraksi target harian tuntas per hari */
  function lastDays(scope, n) {
    const dt = dailyTargets(scope);
    const act = activityByDate(scope);
    const res = [];
    const base = Store.parse(Store.today());
    for (let i = n - 1; i >= 0; i--) {
      const day = new Date(base); day.setDate(base.getDate() - i);
      const ds = Store.ymd(day);
      let done = 0;
      for (const t of dt) if (Store.logValue(t.id, ds) >= (Number(t.goal) || 1)) done++;
      const entries = act[ds] || 0;
      const frac = dt.length ? done / dt.length : (entries > 0 ? 1 : 0);
      res.push({ ds, day, done, total: dt.length, entries, frac });
    }
    return res;
  }

  function consistency7(scope) {
    const days = lastDays(scope, 7);
    const tot = days.reduce((a, b) => a + b.total, 0);
    const don = days.reduce((a, b) => a + b.done, 0);
    if (!tot) return days.some(d => d.entries > 0) ? 100 : 0;
    return Math.round((don / tot) * 100);
  }

  function totals(scope) {
    const ids = idSet(scope);
    let entries = 0; const prod = new Set();
    for (const l of Store.logs) {
      if (ids.has(l.target_id) && (Number(l.value) || 0) > 0) { entries++; prod.add(l.date); }
    }
    return { entries: entries, productiveDays: prod.size };
  }

  function badges(scope) {
    const best = bestStreak(scope), t = totals(scope), pts = points(scope);
    return [
      { ico: "👣", name: "Langkah Pertama", desc: "Catat 1 amal", got: t.entries >= 1 },
      { ico: "🔥", name: "Pekan Beruntun", desc: "Streak 7 hari", got: best >= 7 },
      { ico: "🌙", name: "Sebulan Penuh", desc: "Streak 30 hari", got: best >= 30 },
      { ico: "⭐", name: "50 Amal", desc: "50 amal tercatat", got: t.entries >= 50 },
      { ico: "💯", name: "100 Amal", desc: "100 amal tercatat", got: t.entries >= 100 },
      { ico: "🏆", name: "Teladan", desc: "Capai 1500 poin", got: pts >= 1500 },
    ];
  }

  /* ================= RENDER ================= */
  function view(scope) {
    const list = scopeTargets(scope);
    if (!list.length) {
      return `<div class="empty">
          <div class="empty-ico">📊</div>
          <p>Belum ada data statistik untuk <b>${esc(Store.memberName(scope))}</b>.</p>
          <p class="small">Tambahkan target & catat amal harian untuk mulai mengumpulkan poin.</p>
        </div>`;
    }

    const lv = level(points(scope));
    const s = streak(scope), best = bestStreak(scope), c7 = consistency7(scope);
    const t = totals(scope);
    const days = lastDays(scope, 14);
    const bdgs = badges(scope);
    const today = Store.today();

    /* kartu gamifikasi */
    const gami = `<div class="gami">
        <div class="gami-top">
          <div class="gami-badge"><span>Lv</span><b>${lv.num}</b></div>
          <div class="gami-info">
            <div class="gami-title">${esc(lv.title)}</div>
            <div class="gami-pts">${lv.pts.toLocaleString("id-ID")} poin</div>
          </div>
          <div class="gami-streak"><span class="gami-flame">🔥</span><b>${s}</b><span>hari</span></div>
        </div>
        <div class="gami-bar"><div class="gami-fill" style="width:${lv.pct}%"></div></div>
        <div class="gami-next">${lv.next
          ? `${lv.toNext.toLocaleString("id-ID")} poin lagi → <b>${esc(lv.next.title)}</b>`
          : "Level maksimum tercapai 🎉"}</div>
      </div>`;

    /* tile statistik */
    const tile = (ico, num, lbl) =>
      `<div class="stat-tile"><div class="stat-ico">${ico}</div>
         <div class="stat-num">${num}</div><div class="stat-lbl">${lbl}</div></div>`;
    const tiles = `<div class="stat-tiles">
        ${tile("🔥", s, "Streak (hari)")}
        ${tile("🏅", best, "Streak terbaik")}
        ${tile("📈", c7 + "%", "Konsistensi 7h")}
        ${tile("✅", t.entries, "Total amal")}
      </div>`;

    /* grafik 14 hari */
    const maxLabelEvery = 1;
    const chart = `<div class="section-title st-daily">Aktivitas 14 Hari Terakhir</div>
      <div class="card">
        <div class="chart">
          ${days.map((d, i) => {
            const h = Math.max(6, Math.round(d.frac * 100));
            const isToday = d.ds === today;
            const cls = d.frac >= 1 ? "full" : (d.frac > 0 ? "" : "empty");
            return `<div class="chart-col">
                <div class="chart-track">
                  <div class="chart-bar ${cls} ${isToday ? "today" : ""}" style="height:${h}%"></div>
                </div>
                <span class="chart-lbl ${isToday ? "today" : ""}">${d.day.getDate()}</span>
              </div>`;
          }).join("")}
        </div>
      </div>`;

    /* progres per target (periode berjalan) */
    const order = ["daily", "weekly", "monthly", "yearly"];
    const sorted = list.slice().sort((a, b) => order.indexOf(a.period) - order.indexOf(b.period));
    const targetRows = sorted.map(t => {
      const p = Store.progress(t, today);
      return `<div class="card">
          <div class="target-head">
            <span class="target-title">${esc(t.title)}</span>
            <span class="target-pct ${p.done ? "done" : ""}">${p.percent}%</span>
          </div>
          <div class="target-meta">${({daily:"Hari ini",weekly:"Pekan ini",monthly:"Bulan ini",yearly:"Tahun ini"}[t.period])}: <b>${p.total}</b> / ${p.goal} ${esc(t.unit || "")}</div>
          <div class="progress-bar"><div class="progress-fill ${p.done ? "done" : ""}" style="width:${p.percent}%"></div></div>
        </div>`;
    }).join("");

    /* lencana */
    const badgeGrid = `<div class="section-title">Lencana</div>
      <div class="badges">
        ${bdgs.map(b => `<div class="badge ${b.got ? "got" : "locked"}">
            <div class="badge-ico">${b.ico}</div>
            <div class="badge-name">${esc(b.name)}</div>
            <div class="badge-desc">${esc(b.desc)}</div>
          </div>`).join("")}
      </div>`;

    return gami + tiles + chart +
      `<div class="section-title">Progres Target</div>` + targetRows +
      badgeGrid;
  }

  window.Stats = {
    view: view,
    streak: streak,
    points: points,
    level: function (scope) { return level(points(scope)); },
  };
})();
