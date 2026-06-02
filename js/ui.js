/* =====================================================================
   UI — fungsi render (mengembalikan HTML string). Event ditangani app.js.
   ===================================================================== */
(function () {
  "use strict";

  const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli",
                  "Agustus","September","Oktober","November","Desember"];
  const DOW = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"]; // index = getDay()
  const DOW_FULL = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
  const PERIOD_LABEL = { daily:"Harian", weekly:"Pekanan", monthly:"Bulanan", yearly:"Tahunan" };
  const SCOPE_LABEL = { daily:"Hari ini", weekly:"Pekan ini", monthly:"Bulan ini", yearly:"Tahun ini" };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

  /* ---------- tab scope (Suami / Istri / Bersama) ---------- */
  function scopeTabs() {
    const tabs = [
      { id: "suami",  label: Store.memberName("suami") },
      { id: "istri",  label: Store.memberName("istri") },
      { id: "shared", label: "Bersama" },
    ];
    return tabs.map(t =>
      `<button class="scope-tab ${Store.scope === t.id ? "active" : ""}"
               data-scope="${t.id}" role="tab">${esc(t.label)}</button>`).join("");
  }

  /* ---------- satu kartu target ---------- */
  function targetCard(t) {
    const today = Store.today();
    const p = Store.progress(t, today);
    const todayVal = Store.logValue(t.id, today);
    const isDailyCheck = t.type === "checkbox" && t.period === "daily";

    let meta;
    if (isDailyCheck) meta = p.done ? "Sudah dikerjakan hari ini" : "Belum dikerjakan hari ini";
    else meta = `${SCOPE_LABEL[t.period]}: <b>${p.total}</b> / ${p.goal} ${esc(t.unit || "")}`;

    let control;
    if (isDailyCheck) {
      const on = todayVal >= 1;
      control = `<button class="check ${on ? "on" : ""}" data-act="toggle"
                   data-target="${t.id}" data-date="${today}" aria-label="tandai">✓</button>`;
    } else {
      control = `<div class="stepper">
          <button data-act="dec" data-target="${t.id}" data-date="${today}" aria-label="kurangi">−</button>
          <span class="val">${todayVal}</span>
          <button data-act="inc" data-target="${t.id}" data-date="${today}" aria-label="tambah">+</button>
        </div>`;
    }

    const pctLabel = isDailyCheck
      ? (p.done ? `<span class="target-pct done">✓</span>` : "")
      : `<span class="target-pct ${p.done ? "done" : ""}">${p.percent}%</span>`;

    const bar = isDailyCheck ? "" :
      `<div class="progress-bar">
         <div class="progress-fill ${p.done ? "done" : ""}" style="width:${p.percent}%"></div>
       </div>`;

    return `<div class="card target ${p.done ? "target-done" : ""}">
        <div class="target">
          <div class="target-main">
            <div class="target-head">
              <span class="target-title">${esc(t.title)}</span>
              ${pctLabel}
            </div>
            <div class="target-meta">${meta}</div>
            ${bar}
          </div>
          ${control}
        </div>
      </div>`;
  }

  /* ---------- kartu ringkasan (hero) di atas dashboard ---------- */
  function summaryHeader(scope, list, today) {
    let done = 0;
    list.forEach(t => { if (Store.progress(t, today).done) done++; });
    const total = list.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const name = scope === "shared" ? "Keluarga" : Store.memberName(scope);

    const d = Store.parse(today);
    const masehi = `${DOW_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const h = Hijri.gToH(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const evt = Hijri.eventsForDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const evtLine = evt.events.length
      ? `<div class="hero-evt">🌙 ${esc(evt.events.join(", "))}</div>` : "";

    const st = window.Stats ? Stats.streak(scope) : 0;
    const streakChip = st > 0 ? `<div class="hero-streak">🔥 ${st} hari beruntun</div>` : "";

    return `<div class="hero">
        <div class="hero-top">
          <div class="hero-greet">
            <div class="hero-hi">Assalamu'alaikum,</div>
            <div class="hero-name">${esc(name)}</div>
          </div>
          <div class="ring" style="--p:${pct}">
            <div class="ring-inner"><b>${done}</b><span>/${total}</span></div>
          </div>
        </div>
        <div class="hero-dates">
          <span class="hero-date">${masehi}</span>
          <span class="hero-hijri">${Hijri.str(h)}</span>
        </div>
        <div class="hero-chips">${evtLine}${streakChip}</div>
      </div>`;
  }

  /* ---------- VIEW: Hari Ini ---------- */
  function todayView() {
    const today = Store.today();
    const scope = Store.scope;
    const list = Store.targetsForScope(scope);
    let html = summaryHeader(scope, list, today);

    if (!list.length) {
      html += `<div class="empty">
          <div class="empty-ico">🎯</div>
          <p>Belum ada target untuk <b>${esc(Store.memberName(scope))}</b>.</p>
          <button class="btn btn-primary" data-act="add-target">+ Tambah target pertama</button>
        </div>`;
      return html;
    }
    const order = ["daily", "weekly", "monthly", "yearly"];
    for (const period of order) {
      const items = list.filter(t => t.period === period);
      if (!items.length) continue;
      html += `<div class="section-title st-${period}">${PERIOD_LABEL[period]}
                 <span class="st-count">${items.length}</span></div>`;
      html += items.map(targetCard).join("");
    }
    return html;
  }

  /* ---------- VIEW: Kalender ---------- */
  function calendarView() {
    const { y, m } = Store.cal;
    const ws = (window.APP_CONFIG.WEEK_START ?? 1);
    const today = Store.today();

    // Hitung header bulan Hijriyah (ambil dari awal & akhir bulan Masehi)
    const hFirst = Hijri.gToH(y, m + 1, 1);
    const hLast  = Hijri.gToH(y, m + 1, new Date(y, m + 1, 0).getDate());
    const hijriHeader = hFirst.m === hLast.m
      ? `${Hijri.monthName(hFirst.m)} ${hFirst.y} H`
      : `${Hijri.monthName(hFirst.m)}–${Hijri.monthName(hLast.m)} ${hLast.y} H`;

    // pra-hitung hari penting bulan ini
    const islamicEvts = window.Hijri ? Hijri.eventsForGregorianMonth(y, m + 1) : {};

    // header hari
    let dow = "";
    for (let i = 0; i < 7; i++) dow += `<div class="cal-dow">${DOW[(ws + i) % 7]}</div>`;

    // sel awal: mundur ke awal pekan
    const first = new Date(y, m, 1);
    const offset = (first.getDay() - ws + 7) % 7;
    const start = new Date(y, m, 1 - offset);

    let cells = "";
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const ds = Store.ymd(d);
      const out = d.getMonth() !== m;
      const isToday = ds === today;

      const noteCount = Store.notesForDate(ds).length;
      const dayLogs = Store.logsForDate(ds);
      const anyDone = Store.activeTargets().some(t =>
        t.period === "daily" && Store.logValue(t.id, ds) >= (Number(t.goal) || 1)
        && Store.logValue(t.id, ds) > 0);

      // tanggal Hijriyah
      const h = Hijri.gToH(d.getFullYear(), d.getMonth() + 1, d.getDate());
      const hijriDay = h.d;
      // tandai 1 Hijri (awal bulan)
      const isNewHijriMonth = h.d === 1;

      // hari penting Islam
      const evtInfo = islamicEvts[ds];
      const hasIslamicEvt = !!evtInfo;

      let dots = "";
      if (anyDone) dots += `<span class="dot done"></span>`;
      else if (dayLogs.length) dots += `<span class="dot log"></span>`;
      if (noteCount) dots += `<span class="dot note"></span>`;
      if (hasIslamicEvt) dots += `<span class="dot islamic"></span>`;

      const extraClass = [
        out ? "out" : "",
        isToday ? "today" : "",
        hasIslamicEvt ? "has-evt" : "",
        isNewHijriMonth ? "hijri-new" : "",
      ].filter(Boolean).join(" ");

      cells += `<button class="cal-cell ${extraClass}" data-act="day" data-date="${ds}">
          <span class="cal-gday">${d.getDate()}</span>
          <span class="cal-hday ${isNewHijriMonth ? "new-month" : ""}">${hijriDay}</span>
          <span class="dots">${dots}</span>
        </button>`;
    }

    // daftar hari penting bulan ini
    let evtList = "";
    const evtEntries = Object.entries(islamicEvts).sort((a, b) => a[0].localeCompare(b[0]));
    if (evtEntries.length) {
      evtList = `<div class="section-title" style="margin-top:1.2rem">Hari Penting Islam – ${MONTHS[m]}</div>
        <div class="evt-list">` +
        evtEntries.map(([ds, ev]) => {
          const d = Store.parse(ds);
          return `<div class="evt-row">
            <span class="evt-date">${d.getDate()} ${MONTHS[m].slice(0,3)} · ${Hijri.short(ev.hijri)}</span>
            <span class="evt-name">${ev.events.join(", ")}</span>
          </div>`;
        }).join("") +
        `</div>`;
    }

    return `<div class="cal-head">
        <button class="icon-btn" data-act="cal-prev" aria-label="bulan sebelumnya">◀</button>
        <div class="cal-head-titles">
          <h2>${MONTHS[m]} ${y}</h2>
          <p class="cal-hijri-header">${hijriHeader}</p>
        </div>
        <button class="icon-btn" data-act="cal-next" aria-label="bulan berikutnya">▶</button>
      </div>
      <div class="cal-grid">${dow}${cells}</div>
      <div class="cal-legend">
        <span><span class="dot done" style="display:inline-block"></span> tercapai</span>
        <span><span class="dot log" style="display:inline-block"></span> aktivitas</span>
        <span><span class="dot note" style="display:inline-block"></span> catatan</span>
        <span><span class="dot islamic" style="display:inline-block"></span> hari penting</span>
      </div>
      ${evtList}`;
  }

  /* ---------- VIEW: Kelola Target ---------- */
  function targetsView() {
    let html = `<button class="btn btn-primary btn-block" data-act="add-target"
                  style="margin-bottom:1rem">+ Tambah target</button>`;
    const groups = [
      { id: "suami",  label: Store.memberName("suami") },
      { id: "istri",  label: Store.memberName("istri") },
      { id: "shared", label: "Bersama" },
    ];
    for (const g of groups) {
      const items = Store.activeTargets().filter(t => t.owner === g.id);
      html += `<div class="section-title">${esc(g.label)}</div>`;
      if (!items.length) { html += `<p class="muted small" style="margin:.2rem">Belum ada.</p>`; continue; }
      for (const t of items) {
        html += `<div class="card">
            <div class="target">
              <div class="target-main">
                <div class="target-title">${esc(t.title)}</div>
                <div class="target-meta">
                  <span class="pill pill-${t.period}">${PERIOD_LABEL[t.period]}</span>
                  target ${t.goal} ${esc(t.unit || "")} · ${t.type === "checkbox" ? "centang" : "jumlah"}
                </div>
              </div>
              <div class="card-actions">
                <button class="btn btn-sm" data-act="edit-target" data-target="${t.id}">Ubah</button>
                <button class="btn btn-sm btn-ghost btn-danger-ghost" data-act="del-target" data-target="${t.id}">Hapus</button>
              </div>
            </div>
          </div>`;
      }
    }
    return html;
  }

  window.UI = {
    esc, MONTHS, PERIOD_LABEL,
    scopeTabs, todayView, calendarView, targetsView, targetCard,
  };
})();
