import { db, auth, safeUrl, safeImg } from "./firebase.js";
import { isConfigured, SHORTENER_URL } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const show = (id, on) => $(id).classList.toggle("hidden", !on);
const msg = (id, text, ok) => {
  const e = $(id);
  e.textContent = text;
  e.className = "msg " + (ok ? "ok" : "err");
};
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

// Deteksi nama negara dalam Bahasa Indonesia
const regionName = (() => {
  try {
    const d = new Intl.DisplayNames(["id"], { type: "region" });
    return (c) => (c === "XX" || !c ? "Tidak diketahui" : d.of(c) || c);
  } catch {
    return (c) => (c === "XX" || !c ? "Tidak diketahui" : c);
  }
})();

// Bendera negara emoji dari kode 2-huruf ISO
function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode === "XX" || countryCode.length !== 2) return "🌐";
  try {
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  } catch {
    return "🌐";
  }
}

if (!isConfigured) show("notconf", true);
else init();

async function init() {
  const A = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
  const F = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
  const col = F.collection(db, "videos");
  let items = [], clicks = [], editingId = null, thumbData = "";

  // Penyimpanan kategori kustom
  let customCats = new Set(["Anime", "Hiburan", "Musik", "Gaming", "Film", "Tutorial"]);
  try {
    const saved = JSON.parse(localStorage.getItem("ms_custom_cats") || "[]");
    saved.forEach((c) => {
      if (c && !c.startsWith("http://") && !c.startsWith("https://")) customCats.add(c);
    });
  } catch {}

  function saveCustomCats() {
    try {
      localStorage.setItem("ms_custom_cats", JSON.stringify([...customCats]));
    } catch {}
  }

  const cats = () => {
    const set = new Set([
      ...customCats,
      ...items.map((v) => v.category).filter((c) => c && !c.startsWith("http://") && !c.startsWith("https://"))
    ]);
    return [...set].sort((a, b) => a.localeCompare(b));
  };

  /* ---------- auth & navigasi tab ---------- */
  A.onAuthStateChanged(auth, (user) => {
    show("loginBox", !user);
    show("app", !!user);
    show("logout", !!user);
    show("userInfo", !!user);
    if (user) {
      if ($("userInfo")) $("userInfo").textContent = `${user.email} (UID: ${user.uid})`;
      loadAll();
      loadClicks();
    }
  });

  $("loginBtn").onclick = async () => {
    try {
      await A.signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
      $("loginMsg").textContent = "";
    } catch {
      msg("loginMsg", "Login gagal. Periksa email dan password.");
    }
  };

  $("logout").onclick = () => A.signOut(auth);

  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("active", x === b));
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("hidden", t.id !== "tab-" + b.dataset.tab));
    };
  });

  /* ---------- pemuatan data ---------- */
  async function loadAll() {
    try {
      const snap = await F.getDocs(col);
      items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      renderAll();
    } catch (e) {
      console.error(e);
      const uid = auth.currentUser?.uid || "";
      msg("formMsg", `Akses ditolak. Daftarkan UID akun Anda (${uid}) di koleksi 'admins' Firestore.`);
    }
  }

  async function loadClicks() {
    try {
      const s = await F.getDocs(F.query(F.collection(db, "clicks"), F.orderBy("createdAt", "desc"), F.limit(500)));
      clicks = s.docs.map((d) => d.data());
      renderOverview();
      renderStats();
    } catch (e) {
      console.error(e);
      const uid = auth.currentUser?.uid || "";
      $("statsNote").textContent = `Izin membaca log klik ditolak. Pastikan UID akun Anda (${uid}) sudah terdaftar sebagai dokumen di koleksi 'admins' Firestore.`;
    }
  }

  $("reloadClicks").onclick = () => {
    loadAll();
    loadClicks();
  };

  const renderAll = () => {
    renderOverview();
    renderList();
    renderCategorySelect();
    renderCategoryFilter();
    renderCategories();
    renderStats();
  };

  /* ---------- komponen visual grafis ---------- */
  function bars(container, rows, empty) {
    if (!rows.length) {
      return container.replaceChildren(el("p", { className: "msg", textContent: empty, style: "color:var(--muted)" }));
    }
    const max = Math.max(...rows.map((r) => r.value), 1);
    container.replaceChildren(...rows.map((r, idx) => {
      const fill = el("div", { className: "bar-fill" });
      fill.style.width = Math.max(2, (r.value / max) * 100) + "%";

      const labelWrap = el("div", { className: "bar-label", title: r.title || r.label });
      if (r.rank) {
        const rankClass = r.rank === 1 ? "rank-1" : r.rank === 2 ? "rank-2" : r.rank === 3 ? "rank-3" : "";
        labelWrap.append(el("span", { className: "rank-num " + rankClass, textContent: String(r.rank) }));
      }
      if (r.flag) {
        labelWrap.append(el("span", { className: "flag", textContent: r.flag }));
      }
      labelWrap.append(document.createTextNode(r.label));

      return el("div", { className: "bar-row" },
        labelWrap,
        el("div", { className: "bar-track" }, fill),
        el("div", { className: "bar-val", textContent: String(r.value) }),
        r.pct !== undefined ? el("div", { className: "bar-pct", textContent: r.pct + "%" }) : el("div", { style: "display:none" })
      );
    }));
  }

  const countBy = (arr, fn) => {
    const m = new Map();
    arr.forEach((x) => {
      const k = fn(x);
      m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  };

  /* ---------- ringkasan & statistik ---------- */
  function renderOverview() {
    const n = (s) => items.filter((v) => v.status === s).length;
    const totalClicks = items.reduce((t, v) => t + (v.clicks || 0), 0);
    const avgClicks = items.length ? (totalClicks / items.length).toFixed(1) : "0";

    // Video paling banyak diklik
    const sortedVideos = [...items].filter((v) => (v.clicks || 0) > 0).sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
    const topVideo = sortedVideos[0];

    // Negara teratas
    const countryCounts = [...countBy(clicks, (c) => c.country || "XX")].sort((a, b) => b[1] - a[1]);
    const topCountryCode = countryCounts[0]?.[0];

    // Kartu statistik ringkasan
    const stat = (label, val, sub = "") => {
      const box = el("div", { className: "stat" },
        el("div", { className: "stat-v", textContent: String(val) }),
        el("div", { className: "stat-l", textContent: label })
      );
      if (sub) box.append(el("div", { className: "stat-sub", textContent: sub }));
      return box;
    };

    $("stats").replaceChildren(
      stat("Total Video", items.length, `${n("published")} published · ${n("draft")} draft`),
      stat("Total Klik Video", totalClicks, `Rata-rata ${avgClicks} klik/video`),
      stat("Video Terpopuler", topVideo ? `${topVideo.clicks} klik` : "Belum ada", topVideo ? topVideo.title : "—"),
      stat("Negara Terbanyak", topCountryCode ? `${getFlagEmoji(topCountryCode)} ${regionName(topCountryCode)}` : "—", topCountryCode ? `${countryCounts[0][1]} klik tercatat` : ""),
      stat("Total Kategori", cats().length, "Kategori aktif"),
      stat("Klik Tersimpan di Log", clicks.length, "500 riwayat terbaru")
    );

    // Panel Top 5 Video
    const top5VideoRows = sortedVideos.slice(0, 5).map((v, i) => ({
      rank: i + 1,
      label: v.title || "Tanpa judul",
      title: v.title,
      value: v.clicks,
      pct: totalClicks > 0 ? ((v.clicks / totalClicks) * 100).toFixed(1) : 0
    }));
    bars($("topVideos"), top5VideoRows, "Belum ada klik pada video.");

    // Panel Top 5 Negara
    const totalRecordedClicks = clicks.length || 1;
    const top5CountryRows = countryCounts.slice(0, 5).map(([c, count], i) => ({
      rank: i + 1,
      flag: getFlagEmoji(c),
      label: `${regionName(c)} (${c})`,
      title: regionName(c),
      value: count,
      pct: ((count / totalRecordedClicks) * 100).toFixed(1)
    }));
    bars($("topCountries"), top5CountryRows, "Belum ada data geolokasi negara.");

    // Panel Performa Kategori
    const catClicks = new Map();
    items.forEach((v) => {
      const cat = v.category || "Tanpa kategori";
      catClicks.set(cat, (catClicks.get(cat) || 0) + (v.clicks || 0));
    });
    const catRows = [...catClicks.entries()]
      .filter(([_, val]) => val > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, val]) => ({
        label: cat,
        value: val,
        pct: totalClicks > 0 ? ((val / totalClicks) * 100).toFixed(1) : 0
      }));
    bars($("topCategories"), catRows, "Belum ada data klik per kategori.");

    // Panel Real-time Feed Klik Terbaru
    const videoMap = new Map(items.map((v) => [v.id, v.title]));
    const recent = clicks.slice(0, 5);
    if (!recent.length) {
      $("recentClicks").replaceChildren(el("p", { className: "msg", textContent: "Belum ada log klik.", style: "color:var(--muted)" }));
    } else {
      $("recentClicks").replaceChildren(...recent.map((c) => {
        const timeStr = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Baru saja";
        const dateStr = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "";
        const title = videoMap.get(c.videoId) || `Video ID: ${c.videoId.slice(0, 8)}...`;
        const country = c.country || "XX";

        return el("div", { className: "bar-row", style: "padding:8px 0" },
          el("div", { style: "width:110px; font-size:12px; color:var(--muted); flex-shrink:0" }, `${dateStr} ${timeStr}`),
          el("div", { style: "flex:1; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis" }, title),
          el("div", { style: "display:flex; align-items:center; gap:6px; font-size:12px; flex-shrink:0" },
            el("span", { className: "flag", textContent: getFlagEmoji(country) }),
            el("span", { textContent: regionName(country) })
          )
        );
      }));
    }
  }

  function renderStats() {
    $("statsNote").textContent = "Data lokasi negara pengunjung diperoleh melalui Cloudflare Worker / geo DNS. Sistem mendeteksi kode negara ISO secara langsung dan menyimpannya ke koleksi log klik Firebase.";

    const totalClicksRecorded = clicks.length;
    const countryMap = countBy(clicks, (c) => c.country || "XX");
    const uniqueCountries = countryMap.size;

    // Klik 24 jam terakhir
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const clicksToday = clicks.filter((c) => c.createdAt?.toDate && c.createdAt.toDate().getTime() >= oneDayAgo).length;

    const stat = (label, val, sub = "") => {
      const box = el("div", { className: "stat" },
        el("div", { className: "stat-v", textContent: String(val) }),
        el("div", { className: "stat-l", textContent: label })
      );
      if (sub) box.append(el("div", { className: "stat-sub", textContent: sub }));
      return box;
    };

    $("statsSummary").replaceChildren(
      stat("Total Log Klik", totalClicksRecorded, "Maksimal 500 klik terkini"),
      stat("Negara Terdeteksi", uniqueCountries, "Lokasi DNS asal pengunjung"),
      stat("Klik 24 Jam Terakhir", clicksToday, "Aktivitas satu hari terakhir")
    );

    // Tabel Lengkap Negara Pengunjung
    const sortedCountries = [...countryMap.entries()].sort((a, b) => b[1] - a[1]);
    const maxCountryClicks = sortedCountries[0]?.[1] || 1;

    $("countryTableRows").replaceChildren(...sortedCountries.map(([code, count], idx) => {
      const tr = document.createElement("tr");
      const td = (...k) => tr.appendChild(el("td", {}, ...k));
      const pct = totalClicksRecorded > 0 ? ((count / totalClicksRecorded) * 100).toFixed(1) : 0;

      td(el("span", { className: "rank-num " + (idx === 0 ? "rank-1" : idx === 1 ? "rank-2" : idx === 2 ? "rank-3" : ""), textContent: String(idx + 1) }));
      td(
        el("span", { className: "flag", textContent: getFlagEmoji(code), style: "margin-right:8px" }),
        el("strong", { textContent: regionName(code) })
      );
      td(el("code", { textContent: code, style: "background:var(--bg); padding:2px 6px; border-radius:4px" }));
      td(el("strong", { textContent: String(count) }));
      td(textContent = pct + "%");

      const fill = el("div", { className: "bar-fill" });
      fill.style.width = Math.max(2, (count / maxCountryClicks) * 100) + "%";
      td(el("div", { className: "bar-track", style: "height:10px" }, fill));

      return tr;
    }));

    if (!sortedCountries.length) {
      $("countryTableRows").replaceChildren(
        el("tr", {}, el("td", { colSpan: 6, className: "empty", textContent: "Belum ada log negara klik." }))
      );
    }

    // Grafik Klik 14 Hari Terakhir
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toLocaleDateString("sv-SE"));
    }
    const perDay = countBy(clicks.filter((c) => c.createdAt?.toDate), (c) => c.createdAt.toDate().toLocaleDateString("sv-SE"));
    bars($("byDay"), days.map((d) => ({ label: d.slice(5), value: perDay.get(d) || 0 })), "Belum ada data klik harian.");

    // Distribusi Kategori
    const catClicks = new Map();
    items.forEach((v) => {
      const cat = v.category || "Tanpa kategori";
      catClicks.set(cat, (catClicks.get(cat) || 0) + (v.clicks || 0));
    });
    const totalClicks = items.reduce((t, v) => t + (v.clicks || 0), 0);
    const catStatsRows = [...catClicks.entries()].map(([cat, val]) => ({
      label: cat,
      value: val,
      pct: totalClicks > 0 ? ((val / totalClicks) * 100).toFixed(1) : 0
    })).sort((a, b) => b.value - a.value);
    bars($("byCategoryStats"), catStatsRows, "Belum ada data klik per kategori.");

    // Tabel Peringkat Semua Video
    const sortedAllVideos = [...items].sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
    $("videoRankRows").replaceChildren(...sortedAllVideos.map((v, idx) => {
      const tr = document.createElement("tr");
      const td = (...k) => tr.appendChild(el("td", {}, ...k));
      const pct = totalClicks > 0 ? (((v.clicks || 0) / totalClicks) * 100).toFixed(1) : 0;

      td(el("span", { className: "rank-num " + (idx === 0 ? "rank-1" : idx === 1 ? "rank-2" : idx === 2 ? "rank-3" : ""), textContent: String(idx + 1) }));

      const img = el("img", { loading: "lazy" });
      const t = safeImg(v.thumbnailUrl);
      if (t) img.src = t;
      const titleWrap = el("div", { style: "display:flex; align-items:center; gap:10px" },
        img,
        el("span", { style: "font-weight:600" }, v.title || "Tanpa judul")
      );
      td(titleWrap);

      td(v.category || el("span", { style: "color:var(--muted)" }, "—"));
      td(el("span", { className: "badge " + v.status, textContent: v.status }));
      td(el("strong", { textContent: `🔥 ${v.clicks || 0}` }));
      td(`${pct}%`);

      return tr;
    }));

    if (!sortedAllVideos.length) {
      $("videoRankRows").replaceChildren(
        el("tr", {}, el("td", { colSpan: 6, className: "empty", textContent: "Belum ada video." }))
      );
    }

    // Riwayat Log Klik Pengunjung Terbaru (Tabel)
    const videoMap = new Map(items.map((v) => [v.id, v.title]));
    $("clickLogRows").replaceChildren(...clicks.slice(0, 100).map((c) => {
      const tr = document.createElement("tr");
      const td = (...k) => tr.appendChild(el("td", {}, ...k));

      const timeStr = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "medium" }) : "Waktu server";
      const title = videoMap.get(c.videoId) || `Video ID: ${c.videoId}`;
      const code = c.country || "XX";

      td(timeStr);
      td(el("span", { style: "font-weight:600" }, title));
      td(
        el("span", { className: "flag", textContent: getFlagEmoji(code), style: "margin-right:6px" }),
        document.createTextNode(`${regionName(code)} (${code})`)
      );

      return tr;
    }));

    if (!clicks.length) {
      $("clickLogRows").replaceChildren(
        el("tr", {}, el("td", { colSpan: 3, className: "empty", textContent: "Belum ada aktivitas klik pengunjung." }))
      );
    }
  }

  /* ---------- daftar video & filter ---------- */
  function renderCategoryFilter() {
    const cf = $("categoryFilter");
    const cur = cf.value;
    cf.replaceChildren(
      el("option", { value: "", textContent: "Semua kategori" }),
      ...cats().map((c) => el("option", { value: c, textContent: c }))
    );
    cf.value = [...cf.options].some((o) => o.value === cur) ? cur : "";
  }
  $("categoryFilter").onchange = renderList;

  function renderList() {
    const q = $("filter").value.trim().toLowerCase();
    const st = $("statusFilter").value;
    const cat = $("categoryFilter").value;

    const filtered = items.filter((v) =>
      (!st || v.status === st) &&
      (!cat || v.category === cat) &&
      (!q || (v.title || "").toLowerCase().includes(q))
    );

    // Cari ambang batas untuk video populer
    const topClicks = Math.max(...items.map((v) => v.clicks || 0), 0);

    $("rows").replaceChildren(...filtered.map((v) => row(v, topClicks)));
  }

  function row(v, maxClicks) {
    const tr = document.createElement("tr");
    const td = (...k) => tr.appendChild(el("td", {}, ...k));

    const img = el("img", { loading: "lazy" });
    const t = safeImg(v.thumbnailUrl);
    if (t) img.src = t;
    td(img);

    td(v.title || "Tanpa judul");
    td(v.category || "—");

    const isTop = (v.clicks || 0) > 0 && v.clicks >= maxClicks * 0.7;
    const clickBadge = el("span", {
      className: isTop ? "badge popular" : "",
      textContent: `${v.clicks || 0} klik`
    });
    td(clickBadge);

    td(el("span", { className: "badge " + v.status, textContent: v.status }));

    const actions = td();
    actions.className = "row";
    const btn = (label, fn) => actions.append(el("button", { className: "btn ghost sm", textContent: label, onclick: fn }), " ");
    btn("✏️ Edit", () => startEdit(v));
    if (v.status !== "published") btn("Publish", () => setStatus(v, "published"));
    if (v.status !== "archived") btn("Arsipkan", () => setStatus(v, "archived"));
    btn("Hapus", () => remove(v));

    return tr;
  }

  async function setStatus(v, status) {
    const data = { status, updatedAt: F.serverTimestamp() };
    if (status === "published") data.publishedAt = F.serverTimestamp();
    await F.updateDoc(F.doc(db, "videos", v.id), data);
    loadAll();
  }

  async function remove(v) {
    if (!confirm(`Hapus permanen video "${v.title}"? Anda juga bisa memilih status Arsipkan.`)) return;
    await F.deleteDoc(F.doc(db, "videos", v.id));
    loadAll();
  }

  /* ---------- kategori (dropdown + tambah baru) ---------- */
  function renderCategorySelect(keep) {
    const sel = $("categorySel");
    const cur = keep ?? sel.value;
    sel.replaceChildren(
      el("option", { value: "", textContent: "— Tanpa kategori —" }),
      ...cats().map((c) => el("option", { value: c, textContent: c })),
      el("option", { value: "__new", textContent: "+ Kategori baru..." })
    );
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : "";
    toggleNew();
  }

  const toggleNew = () => {
    const isNew = $("categorySel").value === "__new";
    show("categoryNew", isNew);
    if (isNew) $("categoryNew").focus();
  };
  $("categorySel").onchange = toggleNew;

  const getCategory = () => {
    if ($("categorySel").value === "__new") {
      const newCat = $("categoryNew").value.trim().slice(0, 40);
      if (newCat) {
        customCats.add(newCat);
        saveCustomCats();
      }
      return newCat;
    }
    return $("categorySel").value;
  };

  // Tambah kategori dari tab kategori langsung
  $("newCatBtn").onclick = () => {
    const name = $("newCatInput").value.trim().slice(0, 40);
    if (!name) return msg("newCatMsg", "Ketik nama kategori yang ingin dibuat.");
    customCats.add(name);
    saveCustomCats();
    $("newCatInput").value = "";
    msg("newCatMsg", `Kategori "${name}" berhasil ditambahkan!`, true);
    renderCategorySelect();
    renderCategoryFilter();
    renderCategories();
  };

  function renderCategories() {
    const counts = countBy(items.filter((v) => v.category), (v) => v.category);
    const catClickSums = new Map();
    items.forEach((v) => {
      if (v.category) catClickSums.set(v.category, (catClickSums.get(v.category) || 0) + (v.clicks || 0));
    });

    $("catRows").replaceChildren(...cats().map((c) => {
      const tr = document.createElement("tr");
      tr.append(
        el("td", { textContent: c, style: "font-weight:600" }),
        el("td", { textContent: String(counts.get(c) || 0) + " video" }),
        el("td", { textContent: `🔥 ${catClickSums.get(c) || 0} klik` })
      );
      tr.append(el("td", {},
        el("button", { className: "btn ghost sm", textContent: "Ganti nama", onclick: () => renameCat(c) }), " ",
        el("button", { className: "btn ghost sm", textContent: "Hapus", onclick: () => renameCat(c, true) })
      ));
      return tr;
    }));

    if (!cats().length) {
      $("catRows").replaceChildren(
        el("tr", {}, el("td", { colSpan: 4, className: "empty", textContent: "Belum ada kategori." }))
      );
    }
  }

  async function renameCat(old, del) {
    let name = "";
    if (del) {
      if (!confirm(`Hapus kategori "${old}"? Video di dalamnya akan tetap tersimpan tanpa kategori.`)) return;
      customCats.delete(old);
      saveCustomCats();
    } else {
      const n = prompt(`Nama baru untuk kategori "${old}":`, old);
      if (n === null) return;
      name = n.trim().slice(0, 40);
      if (!name || name === old) return;
      customCats.delete(old);
      customCats.add(name);
      saveCustomCats();
    }
    try {
      const b = F.writeBatch(db);
      items.filter((v) => v.category === old).forEach((v) => {
        b.update(F.doc(db, "videos", v.id), { category: name, updatedAt: F.serverTimestamp() });
      });
      await b.commit();
      msg("catMsg", del ? `Kategori "${old}" dihapus.` : `Kategori diubah menjadi "${name}".`, true);
      loadAll();
    } catch (e) {
      console.error(e);
      msg("catMsg", "Gagal mengubah kategori.");
    }
  }

  /* ---------- thumbnail: unggah gambar atau URL ---------- */
  async function resize(file) {
    const bmp = await createImageBitmap(file);
    const W = 480, H = 270;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const s = Math.max(W / bmp.width, H / bmp.height);
    const w = bmp.width * s;
    const h = bmp.height * s;
    c.getContext("2d").drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);

    let out = c.toDataURL("image/webp", 0.8);
    if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/jpeg", 0.8);
    if (out.length > 140000) out = c.toDataURL("image/jpeg", 0.6);
    if (out.length > 140000) throw new Error("Ukuran gambar terlalu besar setelah dikompresi.");
    return out;
  }

  function preview(src) {
    const p = $("thumbPreview");
    const s = safeImg(src);
    if (s) {
      p.src = s;
      show("thumbPreviewWrap", true);
    } else {
      p.removeAttribute("src");
      show("thumbPreviewWrap", false);
    }
  }

  $("thumbFile").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return msg("formMsg", "File harus berupa gambar (JPG, PNG, WebP).");
    try {
      msg("formMsg", "Memproses gambar...", true);
      thumbData = await resize(f);
      $("thumbnailUrl").value = "";
      preview(thumbData);
      msg("formMsg", `Gambar siap diupload (${Math.round(thumbData.length / 1024)} KB, rasio 16:9).`, true);
    } catch (err) {
      console.error(err);
      msg("formMsg", "Gagal memproses gambar: " + err.message);
    }
  };

  $("thumbnailUrl").oninput = () => {
    thumbData = "";
    $("thumbFile").value = "";
    preview($("thumbnailUrl").value.trim());
  };

  $("removeThumbBtn").onclick = () => {
    thumbData = "";
    $("thumbFile").value = "";
    $("thumbnailUrl").value = "";
    preview("");
    msg("formMsg", "Thumbnail dihapus.", true);
  };

  /* ---------- form video ---------- */
  const fields = ["title", "originalUrl", "shortUrl", "description", "status"];

  function startEdit(v) {
    editingId = v.id;
    fields.forEach((f) => { $(f).value = v[f] || (f === "status" ? "draft" : ""); });
    const t = v.thumbnailUrl || "";
    thumbData = t.startsWith("data:") ? t : "";
    $("thumbnailUrl").value = thumbData ? "" : t;
    $("thumbFile").value = "";
    preview(t);

    renderCategorySelect(v.category || "");
    $("formTitle").textContent = "Edit Video: " + (v.title || "");
    show("cancelBtn", true);
    document.querySelector('[data-tab="videos"]').click();
    scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    editingId = null;
    thumbData = "";
    fields.forEach((f) => { $(f).value = f === "status" ? "draft" : ""; });
    $("thumbnailUrl").value = "";
    $("thumbFile").value = "";
    $("categoryNew").value = "";
    preview("");
    renderCategorySelect("");
    $("formTitle").textContent = "Tambah Video";
    show("cancelBtn", false);
  }

  $("cancelBtn").onclick = reset;

  async function shorten(url) {
    if (SHORTENER_URL.startsWith("ISI_")) throw new Error("URL Worker belum diisi di js/firebase-config.js");
    const idToken = await auth.currentUser.getIdToken();
    const r = await fetch(SHORTENER_URL, {
      method: "POST",
      headers: { "Authorization": "Bearer " + idToken, "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "permintaan ditolak (" + r.status + ")");
    const short = j.url || j.shortenedUrl || j.shortUrl || j.short_url || j.data?.url;
    if (!safeUrl(short)) throw new Error("respons tidak berisi short link yang valid");
    return safeUrl(short);
  }

  $("saveBtn").onclick = async () => {
    const d = Object.fromEntries(fields.map((f) => [f, $(f).value.trim()]));
    if (!d.title) return msg("formMsg", "Judul video wajib diisi.");
    const orig = safeUrl(d.originalUrl);
    if (!orig) return msg("formMsg", "URL asli harus merupakan URL http:// atau https:// yang valid.");

    const urlThumb = $("thumbnailUrl").value.trim();
    if (urlThumb && !safeUrl(urlThumb)) return msg("formMsg", "URL thumbnail tidak valid.");

    d.thumbnailUrl = urlThumb || thumbData;
    d.category = getCategory();
    d.originalUrl = orig;

    const prev = editingId ? items.find((x) => x.id === editingId) : null;
    if (!prev || prev.originalUrl !== orig || !prev.shortUrl) {
      msg("formMsg", "Membuat short link via SafelinkU...", true);
      try {
        d.shortUrl = await shorten(orig);
      } catch (e) {
        return msg("formMsg", "Gagal membuat short link: " + e.message);
      }
    } else {
      d.shortUrl = prev.shortUrl;
    }

    try {
      const payload = { ...d, updatedAt: F.serverTimestamp() };
      if (editingId) {
        if (d.status === "published" && prev?.status !== "published") payload.publishedAt = F.serverTimestamp();
        await F.updateDoc(F.doc(db, "videos", editingId), payload);
      } else {
        payload.createdAt = F.serverTimestamp();
        payload.createdBy = auth.currentUser.uid;
        payload.clicks = 0;
        if (d.status === "published") payload.publishedAt = F.serverTimestamp();
        await F.addDoc(col, payload);
      }
      msg("formMsg", "Video berhasil disimpan!", true);
      reset();
      loadAll();
    } catch (e) {
      console.error(e);
      msg("formMsg", "Gagal menyimpan. Periksa akses admin dan Security Rules Firestore.");
    }
  };

  $("filter").oninput = renderList;
  $("statusFilter").onchange = renderList;
}
