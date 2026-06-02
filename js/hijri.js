/* =====================================================================
   HIJRI.JS — konversi tanggal Masehi ↔ Hijriyah + hari penting Islam
   Algoritma: Kuwaiti (dipakai kalkulasi ijtima' visual), akurasi ±1 hari.
   ===================================================================== */
(function () {
  "use strict";

  var HIJRI_MONTHS = [
    "Muharram","Safar","Rabi'ul Awal","Rabi'ul Akhir",
    "Jumadal Ula","Jumadal Akhirah","Rajab","Sya'ban",
    "Ramadan","Syawal","Dzulqa'dah","Dzulhijjah"
  ];

  /* ---------- gregorian → JDN ---------- */
  function gToJdn(y, m, d) {
    return (1461 * (y + 4800 + Math.floor((m - 14) / 12))) / 4
      + (367 * (m - 2 - 12 * Math.floor((m - 14) / 12))) / 12
      - (3 * Math.floor((y + 4900 + Math.floor((m - 14) / 12)) / 100)) / 4
      + d - 32075;
  }
  function jdnToG(jd) {
    jd = Math.floor(jd);
    var l = jd + 68569;
    var n = Math.floor((4 * l) / 146097);
    l = l - Math.floor((146097 * n + 3) / 4);
    var i = Math.floor((4000 * (l + 1)) / 1461001);
    l = l - Math.floor((1461 * i) / 4) + 31;
    var j = Math.floor((80 * l) / 2447);
    var d = l - Math.floor((2447 * j) / 80);
    l = Math.floor(j / 11);
    var m = j + 2 - 12 * l;
    var y = 100 * (n - 49) + i + l;
    return { y: y, m: m, d: d };
  }

  /* ---------- gregorian → hijri ---------- */
  function gToH(y, m, d) {
    var jd = Math.floor(gToJdn(y, m, d));
    var l = jd - 1948440 + 10632;
    var n = Math.floor((l - 1) / 10631);
    l = l - 10631 * n + 354;
    var j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719)
           + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
    l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50)
          - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
    var hm = Math.floor((24 * l) / 709);
    var hd = l - Math.floor((709 * hm) / 24);
    var hy = 30 * n + j - 30;
    return { y: hy, m: hm, d: hd };
  }

  /* ---------- hijri → gregorian ---------- */
  function hToG(hy, hm, hd) {
    var n = Math.floor((11 * hy + 3) / 30);
    var w = Math.floor((hm - 1) / 2);
    var q = Math.floor(hm / 32);
    var jd = hd + Math.ceil(29.5001 * hm - 29) + 354 * hy + n - w - q + 1948440 - 385;
    return jdnToG(jd);
  }

  /* ---------- nama bulan ---------- */
  function hijriMonthName(m) { return HIJRI_MONTHS[(m - 1) % 12] || ""; }
  function hijriStr(h) {
    return h.d + " " + hijriMonthName(h.m) + " " + h.y + " H";
  }
  function hijriShort(h) {
    return h.d + " " + hijriMonthName(h.m).substring(0, 3) + " " + h.y;
  }

  /* ----------------------------------------------------------------
     DATABASE HARI PENTING ISLAM (Hijriyah → label)
     Format: "HM-HD" (bulan-tanggal) → array label
     ---------------------------------------------------------------- */
  var ISLAMIC_EVENTS = {
    /* Muharram */
    "1-1":  ["Tahun Baru Hijriyah"],
    "1-10": ["Hari Asyura"],
    /* Rabi'ul Awal */
    "3-12": ["Maulid Nabi ﷺ"],
    /* Rajab */
    "7-1":  ["Awal Rajab"],
    "7-27": ["Isra' Mi'raj"],
    /* Sya'ban */
    "8-15": ["Nisfu Sya'ban"],
    /* Ramadan */
    "9-1":  ["Awal Ramadan"],
    "9-17": ["Nuzulul Qur'an"],
    "9-21": ["Lailatul Qadar (21)"],
    "9-23": ["Lailatul Qadar (23)"],
    "9-25": ["Lailatul Qadar (25)"],
    "9-27": ["Lailatul Qadar (27)"],
    "9-29": ["Lailatul Qadar (29)"],
    /* Syawal */
    "10-1": ["Idul Fitri 🎉"],
    "10-2": ["Lebaran H+1"],
    "10-3": ["Lebaran H+2"],
    "10-6": ["Puasa Syawal (mulai)"],
    /* Dzulhijjah */
    "12-1": ["Awal Dzulhijjah"],
    "12-9": ["Hari Arafah (Puasa sunnah)"],
    "12-10":["Idul Adha 🐑"],
    "12-11":["Hari Tasyrik 1"],
    "12-12":["Hari Tasyrik 2"],
    "12-13":["Hari Tasyrik 3"],
  };

  /* hari penting dalam format YYYY-MM-DD (Masehi) untuk range tertentu */
  function eventsForGregorianMonth(gy, gm) {
    var result = {};
    /* periksa setiap hari dalam bulan + beberapa hari sebelum-sesudah */
    var dim = new Date(gy, gm, 0).getDate(); // jumlah hari di bulan gm-1 (1-indexed)
    for (var d = 1; d <= dim; d++) {
      var h = gToH(gy, gm, d);
      var key = h.m + "-" + h.d;
      if (ISLAMIC_EVENTS[key]) {
        var pad = function(n){ return n < 10 ? "0"+n : ""+n; };
        var ds = gy + "-" + pad(gm) + "-" + pad(d);
        result[ds] = { hijri: h, events: ISLAMIC_EVENTS[key] };
      }
    }
    return result;
  }

  /* hari penting untuk tanggal spesifik */
  function eventsForDate(gy, gm, gd) {
    var h = gToH(gy, gm, gd);
    var key = h.m + "-" + h.d;
    return { hijri: h, events: ISLAMIC_EVENTS[key] || [] };
  }

  window.Hijri = {
    gToH: gToH,
    hToG: hToG,
    monthName: hijriMonthName,
    str: hijriStr,
    short: hijriShort,
    eventsForGregorianMonth: eventsForGregorianMonth,
    eventsForDate: eventsForDate,
    MONTHS: HIJRI_MONTHS,
  };
})();
