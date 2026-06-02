/* =====================================================================
   APP — orkestrasi: login, routing, event, modal, toast
   ===================================================================== */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const esc = UI.esc;
  const MONTHS = UI.MONTHS;
  const DOW_FULL = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
  const PERIOD_LABEL = UI.PERIOD_LABEL;

  const el = {
    login: $("#login"), loginForm: $("#login-form"), pin: $("#pin-input"),
    loginBtn: $("#login-btn"), captcha: $("#captcha"),
    loginError: $("#login-error"), loginHint: $("#login-hint"),
    appMain: $("#app-main"), view: $("#view"), title: $("#app-title"),
    scopeTabs: $("#scope-tabs"), menuBtn: $("#menu-btn"),
    modalRoot: $("#modal-root"), toast: $("#toast"),
    loaderBar: $("#loader-bar"), loaderOverlay: $("#loader-overlay"), loaderText: $("#loader-text"),
  };
  let captchaCtl = null;

  let openModal = null; // { type, date } untuk refresh modal aktif

  /* ---------------- util tampilan ---------------- */
  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2200);
  }
  function fmtDate(ds) {
    const d = Store.parse(ds);
    const h = Hijri.gToH(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return `${DOW_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}
            <small class="muted" style="font-weight:400;font-size:.8em;display:block">${Hijri.str(h)}</small>`;
  }
  async function guard(fn) {
    try { return await fn(); }
    catch (e) { console.error(e); toast("Gagal: " + (e.message || e)); }
  }

  /* ---------------- loader ---------------- */
  function showOverlay(text) {
    el.loaderText.textContent = text || "Memuat…";
    el.loaderOverlay.hidden = false;
  }
  function hideOverlay() { el.loaderOverlay.hidden = true; }

  // Loading bar tipis di atas mengikuti SEMUA panggilan API.
  let _apiPending = 0;
  window.addEventListener("api:start", () => {
    _apiPending++;
    el.loaderBar.classList.add("active");
  });
  window.addEventListener("api:end", () => {
    _apiPending = Math.max(0, _apiPending - 1);
    if (_apiPending === 0) el.loaderBar.classList.remove("active");
  });

  /* ---------------- boot & auth ---------------- */
  function mountCaptcha() {
    if (captchaCtl || !window.Captcha) return;
    captchaCtl = Captcha.mount(el.captcha, {
      onSuccess: function () { el.loginBtn.disabled = false; },
      onReset:   function () { el.loginBtn.disabled = true; },
    });
  }
  function showLogin() {
    el.appMain.hidden = true;
    el.login.hidden = false;
    mountCaptcha();
    if (API.isMock()) {
      el.loginHint.textContent = "Mode demo aktif — masukkan PIN apa saja untuk mencoba.";
      el.loginHint.hidden = false;
    }
  }
  function showApp() {
    el.login.hidden = true;
    el.appMain.hidden = false;
  }
  async function tryLoad() {
    const res = await API.getState();
    if (res && res.ok) {
      Store.setState(res);
      showApp();
      render();
      return true;
    }
    return false;
  }
  async function boot() {
    if (API.getPin()) {
      showOverlay("Memuat data…");
      const ok = await guard(tryLoad);
      hideOverlay();
      if (ok) return;
    }
    showLogin();
  }

  el.loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const pin = el.pin.value.trim();
    if (!pin) {
      el.loginError.textContent = "Masukkan PIN dulu.";
      el.loginError.hidden = false;
      return;
    }
    if (!captchaCtl || !captchaCtl.isSolved()) {
      el.loginError.textContent = "Selesaikan verifikasi geser dulu.";
      el.loginError.hidden = false;
      return;
    }
    el.loginError.hidden = true;
    el.loginBtn.disabled = true;
    API.setPin(pin);
    guard(async () => {
      showOverlay("Sedang masuk…");
      const ok = await tryLoad();
      hideOverlay();
      if (!ok) {
        API.clearPin();
        el.loginError.textContent = "PIN salah atau server tidak terjangkau.";
        el.loginError.hidden = false;
        if (captchaCtl) captchaCtl.reset(); // wajib verifikasi ulang
      }
    });
  });

  /* ---------------- routing & render ---------------- */
  const TITLES = { today: "Hari Ini", calendar: "Kalender", stats: "Statistik", targets: "Kelola Target" };
  function render() {
    el.title.textContent = TITLES[Store.route];
    // tab scope relevan di "Hari Ini" & "Statistik"
    el.scopeTabs.hidden = !(Store.route === "today" || Store.route === "stats");
    el.scopeTabs.innerHTML = UI.scopeTabs();
    // nav aktif
    document.querySelectorAll(".nav-btn").forEach(b =>
      b.classList.toggle("active", b.dataset.route === Store.route));
    // konten
    if (Store.route === "today") el.view.innerHTML = UI.todayView();
    else if (Store.route === "calendar") el.view.innerHTML = UI.calendarView();
    else if (Store.route === "stats") el.view.innerHTML = Stats.view(Store.scope);
    else el.view.innerHTML = UI.targetsView();
  }
  function setRoute(r) { Store.route = r; render(); }
  function setScope(s) { Store.scope = s; render(); }

  /* ---------------- perubahan log ---------------- */
  async function setLogValue(targetId, date, value) {
    value = Math.max(0, value);
    const row = Store.logRow(targetId, date);
    if (value === 0 && row) {
      await API.deleteLog(row.id);
      Store.removeLog(row.id);
    } else {
      const res = await API.setLog({ target_id: targetId, date, value });
      if (res && res.ok) Store.upsertLog(res.log);
    }
  }
  async function changeLog(targetId, date, mode) {
    const cur = Store.logValue(targetId, date);
    let next = cur;
    if (mode === "inc") next = cur + 1;
    else if (mode === "dec") next = cur - 1;
    else if (mode === "toggle") next = cur >= 1 ? 0 : 1;
    await setLogValue(targetId, date, next);
  }

  /* ---------------- event: konten utama ---------------- */
  el.view.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const id = b.dataset.target;
    const date = b.dataset.date;

    if (act === "inc" || act === "dec" || act === "toggle") {
      guard(async () => { await changeLog(id, date, act); render(); });
    } else if (act === "day") {
      openDayModal(b.dataset.date);
    } else if (act === "cal-prev" || act === "cal-next") {
      const d = new Date(Store.cal.y, Store.cal.m + (act === "cal-next" ? 1 : -1), 1);
      Store.cal = { y: d.getFullYear(), m: d.getMonth() };
      render();
    } else if (act === "add-target") {
      openTargetEditor(null);
    } else if (act === "edit-target") {
      openTargetEditor(Store.targetById(id));
    } else if (act === "del-target") {
      const t = Store.targetById(id);
      if (t && confirm(`Hapus target "${t.title}"? Semua catatannya ikut terhapus.`)) {
        guard(async () => { await API.deleteTarget(id); Store.removeTarget(id); render(); toast("Target dihapus"); });
      }
    }
  });

  el.scopeTabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-scope]");
    if (b) setScope(b.dataset.scope);
  });
  document.querySelectorAll(".nav-btn").forEach(b =>
    b.addEventListener("click", () => setRoute(b.dataset.route)));
  el.menuBtn.addEventListener("click", openSettings);

  /* ================= MODAL ================= */
  function showModal(html) {
    el.modalRoot.innerHTML =
      `<div class="modal-overlay" data-act="overlay"><div class="modal">${html}</div></div>`;
  }
  function closeModal() { el.modalRoot.innerHTML = ""; openModal = null; }

  el.modalRoot.addEventListener("click", (e) => {
    const overlay = e.target.closest(".modal-overlay");
    if (e.target.dataset.act === "overlay") { closeModal(); return; }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;

    if (act === "close-modal") closeModal();
    else if (act === "d-inc" || act === "d-dec" || act === "d-tog") {
      const mode = { "d-inc":"inc", "d-dec":"dec", "d-tog":"toggle" }[act];
      guard(async () => { await changeLog(b.dataset.target, b.dataset.date, mode); refreshDayModal(); render(); });
    } else if (act === "add-note") {
      const date = b.dataset.date;
      const text = $("#note-text").value.trim();
      const member = $("#note-member").value;
      if (!text) return;
      guard(async () => {
        const res = await API.addNote({ date, member, text });
        if (res && res.ok) Store.upsertNote(res.note);
        refreshDayModal(); render();
      });
    } else if (act === "del-note") {
      guard(async () => { await API.deleteNote(b.dataset.id); Store.removeNote(b.dataset.id); refreshDayModal(); render(); });
    } else if (act === "save-target") {
      saveTargetFromForm();
    } else if (act === "logout") {
      API.clearPin(); closeModal(); location.reload();
    } else if (act === "reset-demo") {
      API._resetMock(); closeModal(); guard(tryLoad); toast("Data demo direset");
    }
  });

  /* ---------- modal: detail hari (kalender) ---------- */
  function openDayModal(date) { openModal = { type: "day", date }; refreshDayModal(); }
  function refreshDayModal() {
    if (!openModal || openModal.type !== "day") return;
    showModal(dayModalHTML(openModal.date));
  }
  function dayRow(t, date) {
    const val = Store.logValue(t.id, date);
    const isDailyCheck = t.type === "checkbox" && t.period === "daily";
    const control = isDailyCheck
      ? `<button class="check ${val >= 1 ? "on" : ""}" data-act="d-tog"
           data-target="${t.id}" data-date="${date}">✓</button>`
      : `<div class="stepper">
           <button data-act="d-dec" data-target="${t.id}" data-date="${date}">−</button>
           <span class="val">${val}</span>
           <button data-act="d-inc" data-target="${t.id}" data-date="${date}">+</button>
         </div>`;
    return `<div class="target" style="padding:.45rem 0;border-bottom:1px solid var(--border)">
        <div class="target-main">
          <div class="target-title">${esc(t.title)}</div>
          <div class="target-meta">${esc(Store.memberName(t.owner))} · ${PERIOD_LABEL[t.period]} · target ${t.goal} ${esc(t.unit || "")}</div>
        </div>${control}
      </div>`;
  }
  function dayModalHTML(date) {
    const targets = Store.activeTargets();
    const notes = Store.notesForDate(date);
    const d = Store.parse(date);
    const evtInfo = Hijri.eventsForDate(d.getFullYear(), d.getMonth() + 1, d.getDate());

    const memberOpts = [
      `<option value="shared">Bersama</option>`,
      `<option value="suami">${esc(Store.memberName("suami"))}</option>`,
      `<option value="istri">${esc(Store.memberName("istri"))}</option>`,
    ].join("");

    const noteItems = notes.length ? notes.map(n =>
      `<div class="note-item">
         <div class="note-text"><b class="small muted">${esc(Store.memberName(n.member))}:</b> ${esc(n.text)}</div>
         <button class="btn btn-sm btn-ghost" data-act="del-note" data-id="${n.id}">Hapus</button>
       </div>`).join("") : `<p class="muted small">Belum ada catatan.</p>`;

    const islamicBanner = evtInfo.events.length
      ? `<div class="islamic-banner">${evtInfo.events.map(e => `<span>🌙 ${esc(e)}</span>`).join("")}</div>`
      : "";

    return `<div class="modal-head">
        <h2>${fmtDate(date)}</h2>
        <button class="icon-btn" data-act="close-modal" aria-label="tutup">✕</button>
      </div>
      ${islamicBanner}
      <div class="section-title">Target</div>
      ${targets.map(t => dayRow(t, date)).join("")}
      <div class="section-title">Catatan</div>
      ${noteItems}
      <div class="field" style="margin-top:.7rem">
        <textarea id="note-text" placeholder="Tulis catatan untuk tanggal ini..."></textarea>
      </div>
      <div class="row">
        <select id="note-member" class="field" style="margin:0">${memberOpts}</select>
        <button class="btn btn-primary" data-act="add-note" data-date="${date}">+ Catatan</button>
      </div>`;
  }

  /* ---------- modal: editor target ---------- */
  let editingId = null;
  function opt(v, label, sel) { return `<option value="${v}" ${sel === v ? "selected" : ""}>${label}</option>`; }
  function openTargetEditor(t) {
    editingId = t ? t.id : null;
    const v = t || { owner: Store.scope === "shared" ? "shared" : Store.scope,
                     title: "", period: "daily", type: "quantity", goal: 1, unit: "" };
    const html = `<div class="modal-head">
        <h2>${t ? "Ubah Target" : "Target Baru"}</h2>
        <button class="icon-btn" data-act="close-modal">✕</button>
      </div>
      <div class="field"><label>Judul</label>
        <input id="t-title" value="${esc(v.title)}" placeholder="mis. Tilawah Al-Qur'an" /></div>
      <div class="field"><label>Untuk siapa</label>
        <select id="t-owner">
          ${opt("suami", esc(Store.memberName("suami")), v.owner)}
          ${opt("istri", esc(Store.memberName("istri")), v.owner)}
          ${opt("shared", "Bersama (keluarga)", v.owner)}
        </select></div>
      <div class="row">
        <div class="field"><label>Periode</label>
          <select id="t-period">
            ${opt("daily","Harian",v.period)}${opt("weekly","Pekanan",v.period)}
            ${opt("monthly","Bulanan",v.period)}${opt("yearly","Tahunan",v.period)}
          </select></div>
        <div class="field"><label>Jenis</label>
          <select id="t-type">
            ${opt("quantity","Jumlah (angka)",v.type)}${opt("checkbox","Centang/kejadian",v.type)}
          </select></div>
      </div>
      <div class="row">
        <div class="field"><label>Target (angka)</label>
          <input id="t-goal" type="number" min="1" value="${esc(v.goal)}" /></div>
        <div class="field"><label>Satuan</label>
          <input id="t-unit" value="${esc(v.unit || "")}" placeholder="halaman / kali / menit" /></div>
      </div>
      <button class="btn btn-primary btn-block" data-act="save-target">Simpan</button>`;
    openModal = { type: "target" };
    showModal(html);
  }
  function saveTargetFromForm() {
    const data = {
      title: $("#t-title").value.trim(),
      owner: $("#t-owner").value,
      period: $("#t-period").value,
      type: $("#t-type").value,
      goal: Math.max(1, parseInt($("#t-goal").value, 10) || 1),
      unit: $("#t-unit").value.trim(),
    };
    if (!data.title) { toast("Judul wajib diisi"); return; }
    guard(async () => {
      if (editingId) {
        const res = await API.updateTarget(Object.assign({ id: editingId }, data));
        if (res && res.ok) Store.upsertTarget(res.target);
      } else {
        const res = await API.addTarget(data);
        if (res && res.ok) Store.upsertTarget(res.target);
      }
      closeModal(); render(); toast("Target disimpan");
    });
  }

  /* ---------- modal: pengaturan ---------- */
  function openSettings() {
    const demoBtn = API.isMock()
      ? `<button class="btn btn-block" data-act="reset-demo" style="margin-bottom:.6rem">Reset data demo</button>` : "";
    const html = `<div class="modal-head">
        <h2>Pengaturan</h2>
        <button class="icon-btn" data-act="close-modal">✕</button>
      </div>
      <div class="section-title">Nama anggota</div>
      <div class="card" style="margin-bottom:1rem">
        <div class="target-meta">Suami</div><div class="target-title">${esc(Store.memberName("suami"))}</div>
        <div class="target-meta" style="margin-top:.5rem">Istri</div><div class="target-title">${esc(Store.memberName("istri"))}</div>
        <p class="muted small" style="margin:.6rem 0 0">Diatur di <code>js/config.js</code> (MEMBERS).</p>
      </div>
      <div class="section-title">Akun</div>
      ${demoBtn}
      <button class="btn btn-block btn-danger" data-act="logout">Keluar (hapus PIN)</button>
      <p class="muted small" style="margin-top:1rem;text-align:center">
        ${esc(window.APP_CONFIG.APP_NAME)} ${API.isMock() ? "· mode demo" : ""}</p>`;
    openModal = { type: "settings" };
    showModal(html);
  }

  /* ---------------- service worker (PWA offline) ---------------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  /* ---------------- mulai ---------------- */
  boot();
})();
