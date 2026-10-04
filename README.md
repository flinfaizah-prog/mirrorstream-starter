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

## Short link (SafelinkU)
Short link dibuat otomatis saat video disimpan di dashboard. Browser memanggil Worker Cloudflare (`worker/worker.js`) dengan token login Firebase; Worker memeriksa bahwa pemanggilnya adalah admin, lalu memanggil API SafelinkU. Token SafelinkU hanya ada di Worker sebagai Secret (tidak pernah di repo atau browser). Variabel Worker: `SAFELINKU_TOKEN` (Secret), `FIREBASE_API_KEY`, `ADMIN_UID`, `ALLOWED_ORIGINS`.
