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
