/* =====================================================================
   KONFIGURASI APLIKASI
   ---------------------------------------------------------------------
   File ini AMAN bersifat publik. JANGAN menaruh PIN atau token rahasia
   di sini — rahasia disimpan di server (Google Apps Script Properties).
   ===================================================================== */
window.APP_CONFIG = {

  // Setelah men-deploy Apps Script sebagai Web App, tempel URL "/exec"-nya
  // di sini. Contoh: "https://script.google.com/macros/s/AKfy....../exec"
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxVTC5Fd6ku-t5IZDpPpAHavYRdHBC8-Jv0W6D8_AiRAhKHSzAbciJRswERZHdxAz2i/exec",

  // true  = MODE DEMO. Aplikasi memakai data contoh di perangkat (tanpa
  //         backend Google). Cocok untuk mencoba tampilan. PIN apa saja diterima.
  // false = MODE NYATA. Aplikasi membaca/menulis ke Google Sheets via URL di atas.
  MOCK: false,

  // Awal pekan untuk perhitungan target pekanan. 1 = Senin, 0 = Minggu.
  WEEK_START: 1,

  // Nama anggota (HARDCODE). Tampil di tab & label, tidak bergantung spreadsheet.
  // Ubah di sini bila perlu ganti nama.
  MEMBERS: { suami: "Faris", istri: "Indana" },

  // Nama aplikasi yang tampil di judul.
  APP_NAME: "Tracker Target Keluarga",
};
