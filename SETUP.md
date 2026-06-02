# Panduan Setup Lengkap — Tracker Target Keluarga

Panduan ini memandu dari nol hingga aplikasi terpasang gratis di GitHub Pages,
terhubung ke Google Sheets, dan bisa di-_install_ di HP. Estimasi 20–30 menit.

Ada 3 bagian:
- **A. Backend** (Google Sheets + Apps Script) — tempat data & pengaman PIN.
- **B. Frontend** (GitHub Pages) — tampilan aplikasi.
- **C. Install di HP** + **D. Fase 2 (Telegram)**.

> Sebelum mulai, Anda bisa mencoba aplikasinya dulu dalam **mode demo** tanpa setup apa pun
> (lihat README → "Coba sekarang"). Setelah cocok, lanjut ke bawah untuk versi nyata.

---

## A. Backend — Google Sheets + Apps Script

1. **Buat spreadsheet.** Buka <https://sheets.new> (login dengan akun Google Anda).
   Beri nama, misalnya `Target Keluarga DB`.

2. **Buka editor skrip.** Di spreadsheet: menu **Extensions → Apps Script**.
   Akan terbuka tab editor baru.

3. **Tempel kode.** Hapus isi `Code.gs` bawaan, lalu **salin seluruh isi file
   [`apps-script/Code.gs`](apps-script/Code.gs)** dari proyek ini ke editor. Klik 💾 *Save*.

4. **Jalankan `setup()`.**
   - Di kotak pilihan fungsi (atas), pilih **`setup`**, klik **Run**.
   - Pertama kali, Google minta izin: **Review permissions → pilih akun → Advanced →
     Go to (nama proyek) → Allow**. (Wajar, karena skrip mengakses spreadsheet Anda sendiri.)
   - Setelah sukses, di spreadsheet akan muncul 4 tab: `Members`, `Targets`, `Logs`, `Notes`.

5. **Set PIN keluarga.**
   - Di editor, ganti fungsi terpilih menjadi **`setFamilyPin`**.
   - **Penting:** ubah dulu argumen di kode contoh, atau buka panel
     **Project Settings (⚙️) → Script properties → Add script property**:
     `FAMILY_PIN` = `pilih-PIN-kuat-anda`.
   - Cara termudah lewat kode: ubah sementara baris fungsi menjadi memanggil PIN Anda,
     atau jalankan dari editor **Apps Script → Run → ketik di Logs**. Praktisnya: tambahkan
     sementara fungsi kecil:
     ```js
     function isiPin() { setFamilyPin('837512'); }   // ganti dengan PIN Anda
     ```
     pilih `isiPin`, **Run**, lalu boleh hapus lagi. Pakai PIN **minimal 6 digit**.

6. **Deploy sebagai Web App.**
   - Klik **Deploy → New deployment**.
   - Klik ikon ⚙️ di samping "Select type" → pilih **Web app**.
   - Isi:
     - **Description**: bebas (mis. `v1`).
     - **Execute as**: **Me** (akun Anda).
     - **Who has access**: **Anyone**.
   - Klik **Deploy → Authorize** bila diminta → **Done**.
   - **Salin "Web app URL"** yang berakhiran `/exec`. Inilah `APPS_SCRIPT_URL`.

7. **Uji cepat.** Tempel URL `/exec` itu di browser. Harusnya muncul:
   `{"ok":true,"service":"target-tracker"}`. Berarti backend hidup. ✅

> Setiap kali Anda mengubah `Code.gs`, lakukan **Deploy → Manage deployments → Edit (pensil)
> → Version: New version → Deploy** agar perubahan aktif (URL tetap sama).

---

## B. Frontend — GitHub Pages

1. **Isi konfigurasi.** Buka [`js/config.js`](js/config.js), ubah dua baris:
   ```js
   APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfy...../exec",
   MOCK: false,
   ```

2. **Buat repo & unggah.** Buat repository **publik** baru di GitHub (Pages gratis butuh repo
   publik). Lalu unggah semua file proyek ini. Jika sudah pakai git lokal:
   ```bash
   git remote add origin https://github.com/USERNAME/target-tracker.git
   git add -A
   git commit -m "Aplikasi tracker target keluarga"
   git push -u origin main
   ```

3. **Aktifkan Pages.** Di GitHub repo → **Settings → Pages**:
   - **Source**: *Deploy from a branch*.
   - **Branch**: `main` / folder `/ (root)` → **Save**.
   - Tunggu ±1 menit; URL muncul, mis. `https://USERNAME.github.io/target-tracker/`.

4. **Buka & login.** Buka URL itu, masukkan **PIN** yang tadi di-set. Bila data contoh muncul
   dan bisa diubah, sambungan ke Sheets berhasil. Cek tab `Logs` di spreadsheet — perubahan
   Anda akan tercatat di sana.

---

## C. Install di HP (seperti aplikasi)

- **Android (Chrome):** buka URL Pages → menu ⋮ → **Add to Home screen / Install app**.
- **iPhone (Safari):** buka URL → tombol **Share** → **Add to Home Screen**.

Setelah itu ada ikon di layar HP, terbuka layar penuh tanpa address bar, dan shell-nya
tetap bisa dibuka walau sinyal lemah (data tetap perlu internet untuk sinkron).

---

## D. Bot Telegram (update tracker dari chat)

Fitur ini **sudah jadi** di `Code.gs`. Update Code.gs terbaru → **re-deploy (New version)** dulu, lalu:

1. **Buat bot.** Chat **@BotFather** → `/newbot` → ikuti → salin **token** (mis. `12345:ABC...`).
2. **Simpan token.** Di editor Apps Script, jalankan fungsi:
   `setTelegramToken('TOKEN-DARI-BOTFATHER')`
3. **Daftarkan suami & istri.** Buka bot kalian, kirim pesan apa saja (mis. `/start`). Bot membalas
   dengan **Chat ID** kamu. Lalu di editor jalankan (sesuai peran):
   `setTelegramUser('suami', '123456789')` dan `setTelegramUser('istri', '987654321')`
4. **Pasang webhook.** Jalankan (pakai URL `/exec` Web App Anda):
   `setupTelegramWebhook('https://script.google.com/macros/s/AKfy.../exec')`
   → balasan `{"ok":true,...}` berarti tersambung. (Otomatis menambah secret anti-spoof.)
5. **Coba!** Kirim ke bot:
   - `tilawah 4` atau `langkah 8500` → set nilai hari ini
   - `/done dhuha` → tandai selesai
   - `/tambah olahraga` → tambah 1
   - `/catat Alhamdulillah lancar` → catatan harian
   - `/hari` → lihat progres hari ini · `/bantuan` → daftar perintah

   Bot mencocokkan kata kunci dengan target milik **pengirim** + target **Bersama**. Bila ambigu
   (mis. `sholat`), bot minta lebih spesifik.

6. **(Opsional) Pengingat harian.** Apps Script → **Triggers** (ikon jam) → *Add Trigger* →
   fungsi `sendReminders`, *Time-driven → Day timer* (mis. 20.00–21.00). Set zona waktu proyek ke
   **Asia/Jakarta** (Project Settings → Time zone). Bot akan mengingatkan target harian yg belum tuntas.

> **Huawei Health / smartwatch:** tidak ada koneksi otomatis gratis. Praktiknya: lihat angka di
> Huawei Health, lalu kirim cepat ke bot — mis. `langkah 9000`, `tidur 7`, `olahraga 30`.

---

## Pemecahan masalah

| Gejala | Sebab & solusi |
|--------|----------------|
| Login selalu gagal padahal PIN benar | `FAMILY_PIN` belum ter-set, atau deployment belum di-update setelah ubah kode. Cek Script properties & re-deploy *New version*. |
| `{"ok":false,"error":"auth"}` | PIN tidak cocok. Pastikan tidak ada spasi. |
| `...Cannot read properties of null (reading 'getSheetByName')` | Skrip tidak menemukan spreadsheet (mis. Apps Script dibuat dari file yang salah / standalone). Di editor jalankan `setSpreadsheetId('ID-dari-URL-sheet')` lalu `setup()`, kemudian re-deploy *New version*. (Kode sudah otomatis pakai ID ini bila tersedia.) |
| Error CORS di Console browser | Pastikan **Who has access = Anyone** dan URL berakhiran `/exec` (bukan `/dev`). Kode sudah memakai *simple request* agar bebas preflight. |
| Perubahan kode `Code.gs` tak berefek | Wajib **Deploy → Manage deployments → New version**. |
| Tanggal kalender meleset | Jalankan `setup()` sekali (mengeset kolom tanggal jadi teks). |
| Mau mulai ulang data demo | Di app: ⚙️ → *Reset data demo* (hanya saat `MOCK:true`). |
