/*********************************************************************
 * Tracker Target Keluarga — Backend (Google Apps Script Web App)
 * -------------------------------------------------------------------
 * Tempel seluruh file ini ke editor Apps Script milik Google Sheet Anda
 * (Extensions > Apps Script), lalu:
 *   1) Jalankan fungsi  setup()              -> membuat tab & header.
 *   2) Jalankan fungsi  setFamilyPin('1234') -> mengganti '1234' dgn PIN Anda.
 *   3) Deploy > New deployment > Web app
 *        - Execute as: Me
 *        - Who has access: Anyone
 *      Salin URL "/exec" ke js/config.js (APPS_SCRIPT_URL) dan set MOCK:false.
 *
 * KEAMANAN: PIN & token disimpan di Script Properties (server, tidak publik).
 * Tidak ada rahasia di kode frontend yang di-host GitHub Pages.
 *********************************************************************/

/* Spreadsheet di-resolve via ID (disimpan di Script Properties) supaya ANDAL di
   konteks Web App — getActiveSpreadsheet() sering null saat dipanggil web app.
   setup() mengisi SPREADSHEET_ID otomatis bila skrip terikat ke Sheet. */
var _SS_CACHE = null;
function getSS() {
  if (_SS_CACHE) return _SS_CACHE;
  var id = props().getProperty("SPREADSHEET_ID");
  if (id) { _SS_CACHE = SpreadsheetApp.openById(id); return _SS_CACHE; }
  _SS_CACHE = SpreadsheetApp.getActiveSpreadsheet();
  if (!_SS_CACHE) {
    throw new Error("SPREADSHEET_ID belum di-set. Di editor jalankan setSpreadsheetId('ID-DARI-URL-SHEET') lalu setup().");
  }
  return _SS_CACHE;
}

var SCHEMA = {
  Members: ["id", "name", "role", "telegram_chat_id"],
  Targets: ["id", "owner", "title", "period", "type", "goal", "unit", "active", "sort", "created_at"],
  Logs:    ["id", "target_id", "date", "value", "note", "created_at", "updated_at"],
  Notes:   ["id", "date", "member", "text", "created_at", "updated_at"],
};

/* ===================== ENDPOINT ===================== */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.action) return json({ ok: true, service: "target-tracker" }); // cek deployment
  if (!checkPin(p.pin)) return json({ ok: false, error: "auth" });
  try {
    if (p.action === "getState") return json(getState());
    return json({ ok: false, error: "unknown_action" });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }

  // ---- Fase 2: webhook Telegram (update punya field update_id) ----
  if (body && body.update_id) return handleTelegram(body);

  if (!checkPin(body.pin)) return json({ ok: false, error: "auth" });
  try {
    return json(route(body.action, body));
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/* ===================== ROUTING AKSI TULIS ===================== */
function route(action, b) {
  switch (action) {
    case "setLog":        return setLog(b);
    case "deleteLog":     return del("Logs", b.id);
    case "addTarget":     return addTarget(b);
    case "updateTarget":  return updateTarget(b);
    case "deleteTarget":  return deleteTarget(b.id);
    case "addNote":       return addNote(b);
    case "updateNote":    return updateNote(b);
    case "deleteNote":    return del("Notes", b.id);
    case "setMemberName": return setMemberName(b);
    default:              return { ok: false, error: "unknown_action" };
  }
}

/* ===================== BACA STATE ===================== */
function getState() {
  var members = readAll("Members").map(function (m) {
    return { id: m.id, name: m.name, role: m.role, telegram_chat_id: String(m.telegram_chat_id || "") };
  });
  var targets = readAll("Targets").map(function (t) {
    return {
      id: t.id, owner: t.owner, title: t.title, period: t.period, type: t.type,
      goal: Number(t.goal) || 0, unit: t.unit, active: !isFalse(t.active),
      sort: Number(t.sort) || 0, created_at: t.created_at,
    };
  });
  var logs = readAll("Logs").map(function (l) {
    return { id: l.id, target_id: String(l.target_id), date: toYmd(l.date),
             value: Number(l.value) || 0, note: l.note, created_at: l.created_at, updated_at: l.updated_at };
  });
  var notes = readAll("Notes").map(function (n) {
    return { id: n.id, date: toYmd(n.date), member: n.member, text: n.text,
             created_at: n.created_at, updated_at: n.updated_at };
  });
  return { ok: true, members: members, targets: targets, logs: logs, notes: notes };
}

/* ===================== AKSI ===================== */
function setLog(b) {
  // upsert berdasarkan (target_id, date) — satu baris per target per tanggal
  var sh = getSheet("Logs");
  var rows = readAll("Logs");
  var ex = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].target_id) === String(b.target_id) && toYmd(rows[i].date) === String(b.date)) { ex = rows[i]; break; }
  }
  if (ex) {
    update("Logs", ex.id, { value: b.value, note: (b.note !== undefined ? b.note : ex.note), updated_at: now() });
    return { ok: true, log: { id: ex.id, target_id: String(b.target_id), date: String(b.date),
             value: Number(b.value) || 0, note: (b.note !== undefined ? b.note : ex.note),
             created_at: ex.created_at, updated_at: now() } };
  }
  var log = { id: genId(), target_id: String(b.target_id), date: String(b.date),
              value: Number(b.value) || 0, note: b.note || "", created_at: now(), updated_at: now() };
  append("Logs", log);
  return { ok: true, log: log };
}

function addTarget(b) {
  var target = { id: genId(), owner: b.owner, title: b.title, period: b.period, type: b.type,
                 goal: Number(b.goal) || 1, unit: b.unit || "", active: true,
                 sort: readAll("Targets").length + 1, created_at: now() };
  append("Targets", target);
  return { ok: true, target: target };
}
function updateTarget(b) {
  update("Targets", b.id, { owner: b.owner, title: b.title, period: b.period, type: b.type,
                            goal: Number(b.goal) || 1, unit: b.unit || "" });
  var t = readAll("Targets").filter(function (x) { return String(x.id) === String(b.id); })[0];
  if (!t) return { ok: false, error: "not_found" };
  t.goal = Number(t.goal) || 0; t.active = !isFalse(t.active); t.sort = Number(t.sort) || 0;
  return { ok: true, target: t };
}
function deleteTarget(id) {
  del("Targets", id);
  // hapus juga log milik target ini
  var logs = readAll("Logs");
  for (var i = 0; i < logs.length; i++) {
    if (String(logs[i].target_id) === String(id)) del("Logs", logs[i].id);
  }
  return { ok: true };
}

function addNote(b) {
  var note = { id: genId(), date: String(b.date), member: b.member || "shared", text: b.text || "",
               created_at: now(), updated_at: now() };
  append("Notes", note);
  return { ok: true, note: note };
}
function updateNote(b) {
  update("Notes", b.id, { text: b.text || "", updated_at: now() });
  var n = readAll("Notes").filter(function (x) { return String(x.id) === String(b.id); })[0];
  return n ? { ok: true, note: { id: n.id, date: toYmd(n.date), member: n.member, text: n.text,
              created_at: n.created_at, updated_at: n.updated_at } } : { ok: false, error: "not_found" };
}
function setMemberName(b) {
  update("Members", b.id, { name: b.name });
  return { ok: true, member: { id: b.id, name: b.name } };
}

/* ===================== HELPER SHEET ===================== */
function getSheet(name) {
  var ss = getSS();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(SCHEMA[name]); }
  return sh;
}
function readAll(name) {
  var sh = getSheet(name);
  if (sh.getLastRow() < 2) return [];
  var vals = sh.getDataRange().getValues();
  var head = vals.shift();
  var out = [];
  for (var r = 0; r < vals.length; r++) {
    var row = vals[r];
    if (row.join("") === "") continue;
    var o = {};
    for (var c = 0; c < head.length; c++) o[head[c]] = row[c];
    out.push(o);
  }
  return out;
}
function append(name, obj) {
  var sh = getSheet(name);
  var row = SCHEMA[name].map(function (h) { return obj[h] !== undefined ? obj[h] : ""; });
  sh.appendRow(row);
}
function rowIndexById(sh, id) {
  var ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (var i = 1; i < ids.length; i++) { if (String(ids[i][0]) === String(id)) return i + 1; }
  return -1;
}
function update(name, id, patch) {
  var sh = getSheet(name);
  var r = rowIndexById(sh, id);
  if (r < 0) return false;
  var head = SCHEMA[name];
  for (var c = 0; c < head.length; c++) {
    if (patch[head[c]] !== undefined) sh.getRange(r, c + 1).setValue(patch[head[c]]);
  }
  return true;
}
function del(name, id) {
  var sh = getSheet(name);
  var r = rowIndexById(sh, id);
  if (r < 0) return { ok: true };
  sh.deleteRow(r);
  return { ok: true };
}

/* ===================== KEAMANAN (PIN) ===================== */
function props() { return PropertiesService.getScriptProperties(); }
function checkPin(pin) {
  var want = props().getProperty("FAMILY_PIN") || "";
  if (!want) return false; // PIN belum di-set -> tolak semua
  return constEq(String(pin || ""), want);
}
function constEq(a, b) {
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/* ===================== FASE 2: TELEGRAM (stub) ===================== */
function handleTelegram(update) {
  // Akan diisi di Fase 2:
  //  - ambil TELEGRAM_TOKEN dari Script Properties
  //  - verifikasi update.message.chat.id ada di tab Members (telegram_chat_id)
  //  - parse perintah (mis. "/tilawah 4") lalu setLog(...) ke Sheet
  //  - balas pesan via Telegram Bot API
  return json({ ok: true });
}

/* ===================== UTIL ===================== */
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function genId() { return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function now() { return new Date().toISOString(); }
function isFalse(v) { return v === false || v === "FALSE" || v === "false" || v === 0; }
function toYmd(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return String(v || "");
}

/* ===================== SETUP (jalankan manual) ===================== */
function setup() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) props().setProperty("SPREADSHEET_ID", active.getId());
  for (var name in SCHEMA) getSheet(name);
  // pastikan kolom tanggal disimpan sebagai teks (bukan dikonversi jadi Date)
  formatTextColumn("Logs", "date");
  formatTextColumn("Notes", "date");
  if (readAll("Members").length === 0) {
    append("Members", { id: "suami", name: "Faris", role: "Suami", telegram_chat_id: "" });
    append("Members", { id: "istri", name: "Indana", role: "Istri", telegram_chat_id: "" });
  }
  Logger.log("Setup selesai. Berikutnya jalankan setFamilyPin('PIN-ANDA') lalu Deploy sebagai Web app.");
  return "OK";
}
function formatTextColumn(name, field) {
  var sh = getSheet(name);
  var col = SCHEMA[name].indexOf(field) + 1;
  sh.getRange(1, col, sh.getMaxRows(), 1).setNumberFormat("@");
}
function setFamilyPin(pin) {
  if (!pin || String(pin).length < 4) throw new Error("PIN minimal 4 karakter.");
  props().setProperty("FAMILY_PIN", String(pin));
  Logger.log("PIN keluarga tersimpan.");
  return "OK";
}
// Hanya perlu bila skrip TIDAK terikat ke Sheet (standalone). Ambil ID dari URL
// spreadsheet: .../spreadsheets/d/<ID-INI>/edit
function setSpreadsheetId(id) {
  if (!id) throw new Error("Berikan ID spreadsheet dari URL sheet.");
  props().setProperty("SPREADSHEET_ID", String(id).trim());
  _SS_CACHE = null;
  Logger.log("SPREADSHEET_ID tersimpan.");
  return "OK";
}
