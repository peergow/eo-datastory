# Penggabungan halaman "Pusat Data Vendor & Harga" ke website utama

Website kedua (file HTML tunggal yang menarik data langsung dari Google Sheets
API v4) sekarang menjadi **satu halaman di dalam repo ini**, bukan situs terpisah.

## File baru
| File | Isi |
|---|---|
| `vendor.html` | markup halaman, memakai topnav + login guard yang sama |
| `css/vendor.css` | seluruh CSS lama, di-scope ke `.vendor-page`, variabel diberi prefix `--v-*` |
| `js/vendor.js` | seluruh JS lama, dibungkus IIFE, blok theme lokal dihapus |

## Yang diubah supaya tidak bentrok
1. **CSS variable** — `--line`, `--muted`, `--text`, `--shadow`, `--radius`, dll.
   dipakai juga oleh `css/style.css`. Semua milik halaman vendor diganti jadi
   `--v-line`, `--v-muted`, dst.
2. **Selector** — setiap selector diberi prefix `.vendor-page`, dan `body{...}`
   lama menjadi `.vendor-page{...}`. Jadi `h1`, `table`, `.btn`, `.btn-primary`,
   `mark` halaman vendor tidak menimpa halaman lain.
3. **Global JS** — nama global seperti `data`, `CONFIG`, `render()` bentrok
   dengan `js/data.js`. Solusinya seluruh script dibungkus
   `(function(){ ... })();` sehingga tidak ada yang bocor ke `window`.
4. **Tema** — toggle 🌙/☀️ lama dihapus. Halaman ikut `js/theme.js`
   (key `maximum-theme`, atribut `data-theme` di `<html>`), sama dengan
   halaman lain. Palet gelap/terang vendor tetap dipakai lewat
   `html[data-theme="dark"|"light"]`.
5. **Login** — `<script src="js/auth-guard.js"></script>` ditambahkan di
   `<head>`, sama seperti `index.html` dan `analytics.html`.
6. **Navigasi** — link "Data Vendor" ditambahkan di topnav `index.html`,
   `input.html`, `analytics.html`, dan `vendor.html`.

## Yang TIDAK diubah
- Logika bisnis (parsing sheet, resolusi kombinasi hari+GR, optimizer,
  perbandingan vendor) sama persis.
- Backend: halaman vendor tetap membaca Google Sheets API v4 dengan
  `CONFIG.SPREADSHEET_ID` + `CONFIG.API_KEY`; halaman input/analytics tetap
  memakai `CONFIG.API_URL` (Apps Script) di `js/data.js`. Dua sumber data
  berbeda ini memang boleh hidup berdampingan dalam satu website.

## Catatan keamanan
`CONFIG.API_KEY` ada di kode client, jadi selalu terlihat publik. Di Google
Cloud Console batasi key itu: **Application restrictions → HTTP referrers**
(domain GitHub Pages kamu saja) dan **API restrictions → Google Sheets API**.

## Loader bersama
`css/loader.css` + `js/loader.js` berisi loader "grid fill" (lingkaran hitam,
9 kotak muncul berurutan, label besar). Dipakai di:

| Titik | Label |
|---|---|
| login, saat verifikasi | MEMERIKSA AKUN |
| login, splash 3 detik setelah sukses | HARAP TUNGGU |
| index.html, memuat angka ringkasan | HARAP TUNGGU |
| input.html, memuat data master item/vendor | MEMUAT DATA MASTER |
| input.html, saat submit laporan | MENYIMPAN LAPORAN |
| analytics.html, memuat data event | MEMUAT DATA EVENT |
| vendor.html, load pertama dari Google Sheets | MEMUAT DATA VENDOR |

Cara pakai di kode baru:
```js
MaximumLoader.show("Memuat Sesuatu");   // overlay layar penuh
MaximumLoader.setLabel("Hampir Selesai");
MaximumLoader.hide();
MaximumLoader.mount("#area", "Memuat…"); // loader di dalam elemen
```
Atau di HTML: `<div class="mx-inline" data-mx-loader="Memuat Data"></div>`.
Warna ikut tema otomatis lewat `--ink` / `--paper`.
