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
  if (body && body.update_id) return handleTelegram(body, (e && e.parameter) || {});

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

/* ===================== TELEGRAM ===================== */
var TG_TZ = "Asia/Jakarta"; // zona waktu untuk batas "hari" via Telegram
// Nama anggota untuk balasan bot (samakan dengan MEMBERS di js/config.js)
var MEMBER_NAMES = { suami: "Faris", istri: "Indana" };
function tgName(owner) { return owner === "shared" ? "Bersama" : (MEMBER_NAMES[owner] || owner); }
function tgRoleFromName(name) {
  var n = String(name || "").toLowerCase().trim();
  for (var role in MEMBER_NAMES) if (MEMBER_NAMES[role].toLowerCase() === n) return role;
  return null;
}

function handleTelegram(update, params) {
  try {
    // anti-spoof: jika TG_SECRET sudah di-set, URL webhook wajib membawanya
    var secret = props().getProperty("TG_SECRET");
    if (secret && (!params || params.tgsecret !== secret)) return json({ ok: false });

    // anti-loop: jangan proses update yang sama dua kali (Telegram bisa kirim ulang)
    var uid = Number(update.update_id || 0);
    var last = Number(props().getProperty("TG_LAST_UPDATE") || 0);
    if (uid && uid <= last) return json({ ok: true }); // sudah diproses, abaikan
    if (uid) props().setProperty("TG_LAST_UPDATE", String(uid));

    var msg = update.message || update.edited_message;
    if (!msg || !msg.text) return json({ ok: true });
    var chatId = String(msg.chat.id);
    var text = String(msg.text).trim();

    // pendaftaran mandiri pakai nama + PIN keluarga (boleh sebelum terdaftar)
    if (/^\/?daftar\b/i.test(text)) { tgSend(chatId, tgRegister(text, chatId)); return json({ ok: true }); }

    var owner = tgMemberByChat(chatId);
    if (!owner) {
      tgSend(chatId, "Assalamu'alaikum 👋\nDaftarkan dirimu dulu dengan mengetik:\n\n" +
        "*/daftar " + MEMBER_NAMES.suami + " <PIN>*  — jika kamu " + MEMBER_NAMES.suami + "\n" +
        "*/daftar " + MEMBER_NAMES.istri + " <PIN>*  — jika kamu " + MEMBER_NAMES.istri + "\n\n" +
        "(PIN = PIN keluarga yang dipakai login aplikasi)");
      return json({ ok: true });
    }

    tgSend(chatId, tgHandleCommand(owner, text));
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function tgHandleCommand(owner, text) {
  var cmd, rest = "";
  if (text.charAt(0) === "/") {
    var sp = text.indexOf(" ");
    cmd = (sp < 0 ? text : text.slice(0, sp)).slice(1).toLowerCase().split("@")[0];
    rest = (sp < 0 ? "" : text.slice(sp + 1)).trim();
  } else if (/^(.+?)\s+(-?\d+(?:[.,]\d+)?)$/.test(text)) {
    cmd = "log"; rest = text;            // shorthand: "tilawah 4"
  } else {
    cmd = "help";
  }

  if (cmd === "start" || cmd === "help" || cmd === "bantuan") return tgHelp();
  if (cmd === "hari" || cmd === "today" || cmd === "list") return tgToday(owner);
  if (cmd === "catat" || cmd === "note") {
    if (!rest) return "Tulis catatannya, mis: /catat Alhamdulillah lancar hari ini";
    addNote({ date: tgDate(), member: owner, text: rest });
    return "📝 Catatan tersimpan untuk hari ini.";
  }
  if (["log", "set", "done", "selesai", "tambah"].indexOf(cmd) >= 0) return tgLog(owner, cmd, rest);
  return "Perintah tidak dikenal. Ketik /bantuan untuk daftar perintah.";
}

function tgLog(owner, cmd, rest) {
  var keyword = rest, value = null;
  var m = rest.match(/^(.*?)\s*(-?\d+(?:[.,]\d+)?)\s*$/);
  if (m) { keyword = m[1].trim(); value = parseFloat(m[2].replace(",", ".")); }

  var matches = tgFindTargets(owner, keyword);
  if (!matches.length) return "❌ Target \"" + keyword + "\" tidak ditemukan.\nKetik /hari untuk daftar target.";
  if (matches.length > 1) {
    return "Beberapa target cocok, sebutkan lebih spesifik:\n" +
      matches.map(function (t) { return "• " + t.title; }).join("\n");
  }

  var t = matches[0], date = tgDate(), cur = tgDayValue(t.id, date), newVal;
  if (cmd === "done" || cmd === "selesai") newVal = Number(t.goal) || 1;
  else if (cmd === "tambah") newVal = cur + (value == null ? 1 : value);
  else { // log / set
    if (value == null) return "Sebutkan angkanya, mis: " + (t.title.split(" ")[0].toLowerCase()) + " 4";
    newVal = value;
  }
  if (newVal < 0) newVal = 0;
  setLog({ target_id: t.id, date: date, value: newVal });

  var p = tgProgress(t, date);
  return "✅ " + t.title + (t.owner === "shared" ? " (Bersama)" : "") +
    "\n" + tgScopeLabel(t.period) + ": " + p.total + "/" + p.goal + " " + (t.unit || "") +
    " — " + p.percent + "%" + (p.done ? " ✔️ tercapai!" : "");
}

function tgHelp() {
  return "🎯 *Tracker Target Keluarga*\n\n" +
    "Catat amal cukup ketik:\n" +
    "• `<nama> <angka>` — mis: tilawah 4, langkah 8500, tidur 7\n" +
    "• `/done <nama>` — tandai selesai (mis: /done dhuha)\n" +
    "• `/tambah <nama> [angka]` — tambah nilai (mis: /tambah olahraga)\n" +
    "• `/catat <teks>` — catatan harian\n" +
    "• `/hari` — lihat progres hari ini\n" +
    "• `/bantuan` — bantuan ini";
}

function tgToday(owner) {
  var date = tgDate();
  var ts = tgFindTargets(owner, "");
  if (!ts.length) return "Belum ada target.";
  var ord = { daily: 0, weekly: 1, monthly: 2, yearly: 3 };
  ts.sort(function (a, b) { return (ord[a.period] - ord[b.period]) || (Number(a.sort) - Number(b.sort)); });
  var lines = ts.map(function (t) {
    var p = tgProgress(t, date);
    return (p.done ? "✅" : "▫️") + " " + t.title + (t.owner === "shared" ? " (Bersama)" : "") +
      " — " + p.total + "/" + p.goal + " " + (t.unit || "");
  });
  return "📋 Progres harian " + tgName(owner) + " (" + date + "):\n" + lines.join("\n");
}

function tgRegister(text, chatId) {
  var parts = text.replace(/^\/?daftar\s*/i, "").trim().split(/\s+/);
  var name = parts[0] || "", pin = parts[1] || "";
  if (!name || !pin) return "Format: /daftar <Nama> <PIN>\nContoh: /daftar " + MEMBER_NAMES.suami + " 1234";
  if (!checkPin(pin)) return "❌ PIN salah. Coba lagi: /daftar <Nama> <PIN>";
  var role = tgRoleFromName(name);
  if (!role) return "❌ Nama harus " + MEMBER_NAMES.suami + " atau " + MEMBER_NAMES.istri + ".";
  props().setProperty(role === "suami" ? "TG_SUAMI" : "TG_ISTRI", String(chatId).trim());
  return "✅ Terdaftar sebagai *" + tgName(role) + "*.\nCoba ketik /hari atau langsung: tilawah 4";
}

/* ---- helper Telegram ---- */
function tgMemberByChat(chatId) {
  var p = props();
  if (String(p.getProperty("TG_SUAMI") || "") === String(chatId)) return "suami";
  if (String(p.getProperty("TG_ISTRI") || "") === String(chatId)) return "istri";
  return null;
}
function tgFindTargets(owner, keyword) {
  var k = (keyword || "").toLowerCase().trim();
  var ts = readAll("Targets").filter(function (t) {
    return !isFalse(t.active) && (t.owner === owner || t.owner === "shared");
  });
  return k ? ts.filter(function (t) { return String(t.title).toLowerCase().indexOf(k) >= 0; }) : ts;
}
function tgDayValue(id, date) {
  var logs = readAll("Logs");
  for (var i = 0; i < logs.length; i++)
    if (String(logs[i].target_id) === String(id) && toYmd(logs[i].date) === date) return Number(logs[i].value) || 0;
  return 0;
}
function tgProgress(t, date) {
  var w = tgPeriodWindow(t.period, date), logs = readAll("Logs"), total = 0;
  for (var i = 0; i < logs.length; i++) {
    var l = logs[i];
    if (String(l.target_id) === String(t.id)) {
      var d = toYmd(l.date);
      if (d >= w.start && d <= w.end) total += Number(l.value) || 0;
    }
  }
  var goal = Number(t.goal) || 0;
  return { total: total, goal: goal, percent: goal ? Math.min(100, Math.round(total / goal * 100)) : 0, done: total >= goal };
}
function tgPeriodWindow(period, refStr) {
  var pr = refStr.split("-");
  var ref = new Date(Number(pr[0]), Number(pr[1]) - 1, Number(pr[2]));
  var start, end;
  if (period === "weekly") {
    var off = (ref.getDay() - 1 + 7) % 7; // pekan mulai Senin
    start = new Date(ref); start.setDate(ref.getDate() - off);
    end = new Date(start); end.setDate(start.getDate() + 6);
  } else if (period === "monthly") {
    start = new Date(ref.getFullYear(), ref.getMonth(), 1);
    end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  } else if (period === "yearly") {
    start = new Date(ref.getFullYear(), 0, 1);
    end = new Date(ref.getFullYear(), 11, 31);
  } else { start = new Date(ref); end = new Date(ref); }
  return { start: fmtYmd_(start), end: fmtYmd_(end) };
}
function fmtYmd_(d) { var m = d.getMonth() + 1, day = d.getDate(); return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day); }
function tgDate() { return Utilities.formatDate(new Date(), TG_TZ, "yyyy-MM-dd"); }
function tgScopeLabel(period) { return { daily: "Hari ini", weekly: "Pekan ini", monthly: "Bulan ini", yearly: "Tahun ini" }[period] || ""; }
function tgSend(chatId, text) {
  var token = props().getProperty("TELEGRAM_TOKEN");
  if (!token) return;
  UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "Markdown" }),
    muteHttpExceptions: true,
  });
}

/* ---- pengaturan Telegram (jalankan manual di editor) ---- */
function setTelegramToken(token) {
  if (!token) throw new Error("Token dari BotFather wajib diisi.");
  props().setProperty("TELEGRAM_TOKEN", String(token).trim());
  return "OK — token tersimpan.";
}
function setTelegramUser(role, chatId) {
  if (role !== "suami" && role !== "istri") throw new Error("role harus 'suami' atau 'istri'.");
  props().setProperty(role === "suami" ? "TG_SUAMI" : "TG_ISTRI", String(chatId).trim());
  return "OK — " + role + " terdaftar.";
}
// Jalankan dengan URL /exec Web App, mis: setupTelegramWebhook('https://script.google.com/macros/s/AKfy.../exec')
function setupTelegramWebhook(execUrl) {
  var token = props().getProperty("TELEGRAM_TOKEN");
  if (!token) throw new Error("Jalankan setTelegramToken('...') dulu.");
  var secret = props().getProperty("TG_SECRET");
  if (!secret) { secret = Utilities.getUuid().replace(/-/g, ""); props().setProperty("TG_SECRET", secret); }
  var base = execUrl || ScriptApp.getService().getUrl();
  base = base.replace(/\/dev$/, "/exec");
  // mulai dari update terbaru: abaikan update lama (TG_LAST_UPDATE = 0 berarti proses semua baru)
  props().setProperty("TG_LAST_UPDATE", "0");
  var res = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/setWebhook", {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({
      url: base + "?tgsecret=" + secret,
      allowed_updates: ["message", "edited_message"],
      drop_pending_updates: true,   // buang antrean lama agar tak membanjir
    }),
    muteHttpExceptions: true,
  });
  Logger.log(res.getContentText());
  return res.getContentText();
}
function deleteTelegramWebhook() {
  var token = props().getProperty("TELEGRAM_TOKEN");
  var res = UrlFetchApp.fetch(
    "https://api.telegram.org/bot" + token + "/deleteWebhook?drop_pending_updates=true",
    { muteHttpExceptions: true });
  Logger.log(res.getContentText());
  return res.getContentText();
}

/* Pengingat harian (opsional) — pasang time-driven trigger ke fungsi ini */
function sendReminders() {
  var date = tgDate();
  ["suami", "istri"].forEach(function (role) {
    var chatId = props().getProperty(role === "suami" ? "TG_SUAMI" : "TG_ISTRI");
    if (!chatId) return;
    var pending = tgFindTargets(role, "").filter(function (t) {
      return t.period === "daily" && !tgProgress(t, date).done;
    });
    if (!pending.length) {
      tgSend(chatId, "🌟 MasyaAllah, semua target harianmu sudah tercapai. Barakallahu fiik!");
    } else {
      tgSend(chatId, "⏰ Pengingat target harian:\n" + pending.map(function (t) {
        var p = tgProgress(t, date);
        return "▫️ " + t.title + " (" + p.total + "/" + p.goal + " " + (t.unit || "") + ")";
      }).join("\n"));
    }
  });
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
