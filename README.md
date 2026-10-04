# MirrorStream

Katalog video (HTML/CSS/JS + Firebase Firestore), hosting GitHub Pages. Katalog 5 kolom di PC, 2 kolom di mobile, 20 video per halaman.

## Struktur
- `index.html` + `js/catalog.js` — katalog publik (pencarian, kategori, pagination)
- `ctl-9f3a7c1e/index.html` + `js/admin.js` — dashboard admin, dibuka di `/ctl-9f3a7c1e/` (tidak ada link ke sini dari halaman publik; ganti nama foldernya kapan saja, path `../` tetap jalan)
- `js/firebase-config.js` — config Firebase (isi sendiri)
- `firestore.rules` — Security Rules

Sebelum config diisi, katalog menampilkan data contoh.

## Setup Firebase
1. Buat proyek di Firebase Console, tambahkan Web app, salin config ke `js/firebase-config.js`.
2. Aktifkan Authentication > Email/Password, buat satu akun admin.
3. Buat Cloud Firestore, lalu tempel isi `firestore.rules` di tab Rules dan Publish.
4. Daftarkan admin: di Firestore buat koleksi `admins`, dokumen dengan ID = UID akun admin (UID ada di Authentication > Users), isi field bebas (mis. `role: "admin"`).
5. Authentication > Settings > Authorized domains: tambahkan domain `username.github.io`.
6. Jalankan lokal dengan server statis (mis. Live Server atau `npx serve`), karena ES modules tidak jalan lewat `file://`.

## Deploy
Push ke GitHub, aktifkan Settings > Pages (branch main, root).

## Short link (ShrinkMe)
Token API tidak boleh ada di frontend. Untuk sekarang, buat short link di ShrinkMe lalu tempel ke kolom "Short link" di dashboard. Otomatisasi lewat backend (Cloud Function) bisa jadi fase berikutnya. Token ShrinkMe yang sempat dibagikan di chat sebaiknya di-regenerate.
