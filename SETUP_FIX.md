# MAXIMUM THE ULTIMATE — Fix koneksi Data Input

## Penyebab utama

1. Workbook Data Input menggunakan sheet `EVENTS` dan `ITEMS`.
2. Backend lama mencari `sheets events` dan `sheets item`, sehingga Apps Script membuat sheet baru dan menulis ke sana.
3. Backend lama juga menjalankan `ensureSheets_()` untuk membuat `ITEM_DICTIONARY` dan `VENDOR_DICTIONARY` setiap kali endpoint dipanggil.
4. Frontend lama tidak memeriksa `ok:false` dari response backend, sehingga error backend dapat terlihat sebagai submit sukses.

## Perbaikan di paket ini

- Backend menulis langsung ke `EVENTS` dan `ITEMS`.
- Backend tidak membuat `ITEM_DICTIONARY` atau `VENDOR_DICTIONARY` lagi.
- Search item/vendor memakai dictionary yang sudah dibundel dari file referensi yang diberikan.
- Frontend sekarang membaca `ok:false` dari backend dan menampilkan error sehingga kegagalan penyimpanan tidak disamarkan.
- Kolom `KETERANGAN` tetap masuk ke `ITEMS`.
- Event ID tetap dibuat dengan pola `MM-ke-NN-ke-YYYY`.

## Yang perlu dilakukan sebelum deploy

1. Pastikan `Data Input` sudah berupa Google Spreadsheet, karena Google Apps Script `SpreadsheetApp.openById()` tidak menulis langsung ke file Excel `.xlsx` lokal.
2. Di `Code.gs`, isi `SPREADSHEET_ID` dengan ID Google Spreadsheet Data Input Anda.
3. Pastikan spreadsheet tersebut memiliki sheet `EVENTS` dan `ITEMS` dengan header yang sesuai workbook Data Input.
4. Jalankan `setup()` satu kali. Fungsi ini hanya memeriksa sheet tujuan; tidak membuat sheet dictionary.
5. Deploy ulang Web App dengan versi `Code.gs` ini.
6. Pastikan `CONFIG.API_URL` di `js/data.js` menunjuk ke URL `/exec` deployment terbaru.
7. Untuk dua sheet dictionary yang sudah terlanjur ada di Data Input, hapus manual satu kali. Setelah backend baru aktif, sheet tersebut tidak akan dibuat lagi oleh website.

## Catatan penting

File `Item_Dictionary.xlsx` dan `Vendor_Dictionary.xlsx` pada paket tetap menjadi sumber data referensi untuk dictionary yang dibundel ke website. Bila isi file referensi berubah, array dictionary di `js/data.js` perlu dibuat ulang agar perubahan muncul di form.

---

# REVISI: Dropdown Kategori & Nama Vendor live dari spreadsheet

Sebelumnya daftar Kategori (dropdown tetap di HTML) dan Nama Vendor
(dictionary yang dibundel di `js/data.js`) hanya bisa diubah dengan
mengedit kode lalu redeploy. Sekarang keduanya dibaca LANGSUNG dari sheet
`ITEM_DICTIONARY` dan `VENDOR_DICTIONARY` di spreadsheet Data Input yang
sama — edit sheetnya, dropdown di form ikut berubah (paling lambat ~60
detik karena backend meng-cache, atau langsung kalau Anda reload halaman
setelah cache itu kedaluwarsa).

## Langkah setup (sekali saja)

1. Tempel ulang `Code.gs` versi ini ke Apps Script project Anda, lalu
   **Deploy → Manage deployments → Edit → Version: New version → Deploy**
   (jangan buat deployment baru, supaya URL `/exec` tetap sama).
2. Jalankan fungsi `setup` sekali dari editor Apps Script. Ini membuat dua
   sheet baru kalau belum ada: `ITEM_DICTIONARY` (kolom: `ITEM ID`,
   `KATEGORI`, `NAMA ITEM STANDAR`, `SATUAN STANDAR`) dan
   `VENDOR_DICTIONARY` (kolom: `VENDOR ID`, `NAMA VENDOR`,
   `KATEGORI LAYANAN`) — hanya header, tanpa data.
3. Isi kedua sheet itu. Cara tercepat: buka `Item_Dictionary.xlsx` /
   `Vendor_Dictionary.xlsx` yang sudah Anda punya, copy seluruh isinya
   (termasuk header), lalu paste ke sheet `ITEM_DICTIONARY` /
   `VENDOR_DICTIONARY` di spreadsheet Data Input — pastikan urutan kolom
   sama persis dengan yang disebut di langkah 2.
4. Buka `input.html` — Kategori & Nama vendor sekarang mengikuti isi dua
   sheet itu. Menambah/menghapus/mengubah baris di sheet langsung berlaku
   untuk laporan berikutnya, tanpa redeploy.

## Catatan

- Kalau kedua sheet itu masih kosong (baru dibuat, belum diisi), form
  otomatis jatuh ke data bundled lama di `js/data.js` sebagai cadangan —
  jadi form tidak akan pernah kosong sama sekali walau Anda lupa mengisi.
- Kolom `KATEGORI` di `ITEM_DICTIONARY` adalah satu-satunya sumber pilihan
  dropdown Kategori sekarang (bukan lagi daftar tetap di `input.html`).
  Kalau perlu kategori baru (mis. "Lainnya"), tambahkan barisnya di sheet
  ini.
- Mau paksa baca langsung tanpa menunggu cache 60 detik habis? Buka
  `<URL_/exec>?action=getDictionaries&nocache=1` di tab baru — ini hanya
  untuk mengecek data, tidak mempengaruhi tampilan form.

---

# REVISI: Fitur Edit Laporan + Perbaikan Login/Performa

## 1. Langkah WAJIB di spreadsheet — kolom baru di sheet `ITEMS`

Status pembayaran (Lunas/DP) sebelumnya **dikumpulkan oleh form tapi tidak
pernah disimpan** oleh backend lama (tidak ada kolomnya). Supaya bisa
disimpan dan nantinya diedit, tambahkan **2 kolom baru di akhir** sheet
`ITEMS` Anda (setelah kolom `KETERANGAN`), dengan header **persis**:

| Kolom I          | Kolom J      |
|-------------------|--------------|
| `PAYMENT STATUS`  | `NOMINAL DP` |

Kolom lain (`EVENT ID` s/d `KETERANGAN`) **tidak berubah posisi**, jadi
data lama tetap aman. Baris-baris lama yang belum punya nilai di 2 kolom
baru ini otomatis ditandai "Tidak Diketahui" oleh dashboard — bukan
ditebak jadi Lunas/DP.

## 2. WAJIB deploy ulang (New Deployment / versi baru)

Kode `Code.gs` dan `Login.gs` di paket ini sudah diperbarui, tapi Apps
Script **tidak otomatis memakai kode terbaru** di URL `/exec` yang sudah
ada. Untuk masing-masing project (Code.gs dan Login.gs, dua project Apps
Script yang terpisah):

1. Buka project Apps Script-nya → tempel ulang isi file `.gs` yang baru.
2. **Deploy → Manage deployments → Edit (ikon pensil) pada deployment yang
   aktif → Version: "New version" → Deploy.**
   (Jangan buat deployment baru dari nol — itu akan menghasilkan URL
   `/exec` baru, dan `CONFIG.API_URL` / `AUTH_CONFIG.LOGIN_API_URL` di
   `js/data.js` & `js/auth-config.js` tidak perlu diubah sama sekali
   selama Anda memakai "New version" pada deployment yang sama.)

## 3. Apa yang diperbaiki

- **Bug keamanan di Login**: `Login.gs` versi lama, fungsi `doGet()`
  (yang dipakai `js/login.js` untuk login) **tidak pernah memeriksa
  username/password** — selalu membalas sukses. Sudah diperbaiki: `doGet`
  sekarang benar-benar memvalidasi ke sheet `USERS`, sama seperti `doPost`.
- **Delay buatan 3 detik** setelah login sukses (`setTimeout(...,3000)`)
  dipangkas jadi 400ms — sebelumnya ini bikin login "terasa lambat" di
  atas waktu respons server yang sesungguhnya.
- **Request sia-sia di halaman Input Report**: sebelumnya setiap buka
  `input.html` selalu memanggil Apps Script `?action=getDictionaries`,
  padahal backend memang selalu membalasnya kosong (dictionary sengaja
  dibundel di frontend, lihat komentar di `Code.gs`). Sekarang
  `loadDictionaries()` langsung pakai data bundled tanpa round-trip
  jaringan sama sekali.
- **Caching di backend**: `Code.gs` sekarang menyimpan hasil baca sheet ke
  `CacheService` selama 2 menit (dan otomatis dihapus tiap ada
  submit/edit baru), supaya Analytics & Daftar Event tidak selalu membaca
  ulang seluruh spreadsheet dari nol.
- **Bug validasi**: form Input Report tidak pernah mengirim field
  `quantity` per barang, padahal backend mewajibkannya — sekarang
  dikirim otomatis dengan nilai 1 per baris barang.

Catatan: password di sheet `USERS` masih disimpan sebagai teks biasa
(tidak di-hash). Ini di luar cakupan revisi ini, tapi disarankan untuk
tidak memakai password yang sama dengan akun penting lain.

## 4. Fitur Edit Laporan (baru)

- Halaman baru **`events.html`** ("Daftar Event" di menu navigasi):
  menampilkan semua event (nama, client, tanggal event, tanggal submit,
  jumlah barang) dengan kolom pencarian, dan tombol **Edit** di tiap baris.
- Klik **Edit** membuka `input.html?edit=<eventId>` — form yang sama
  dengan Input Report, tapi otomatis terisi dari data event tsb (termasuk
  status pembayaran tiap barang). Judul halaman berubah jadi
  "Edit Laporan Event" dan tombol jadi "Update Report".
- Submit di mode ini **mengupdate** baris yang sudah ada di sheet `EVENTS`
  (tanggal submit asli dipertahankan) dan **mengganti seluruh baris**
  `ITEMS` milik event tsb dengan isi form yang baru — jadi menghapus
  barang di form lalu submit juga akan menghapusnya dari sheet.
- Endpoint backend baru: `?action=getEventsList` (daftar ringkas, cepat,
  tanpa detail barang) dan `?action=getEventById&eventId=...` (detail
  satu event untuk mengisi form edit).
