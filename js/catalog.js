import { db, safeUrl, safeImg } from "./firebase.js";
import { PAGE_SIZE, isConfigured, SHORTENER_URL } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const grid = $("grid"), info = $("info"), pagEl = $("pagination"), menu = $("menu"), menuBtn = $("menuBtn"), sortSel = $("sortSelect");
const SDK = "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
let F = null, videos = [], category = "Semua", sort = "new", query = "", page = 1;

const DEMO = Array.from({ length: 47 }, (_, i) => ({
  id: "demo" + i,
  title: "Video contoh " + (i + 1),
  category: ["Hiburan", "Anime", "Musik", "Gaming", "Film"][i % 5],
  clicks: ((47 - i) * 13) % 89,
  thumbnailUrl: "",
  shortUrl: "https://example.com/"
}));

function showSkeleton() {
  grid.replaceChildren(...Array.from({ length: 10 }, () => Object.assign(document.createElement("div"), { className: "skeleton" })));
}

async function load() {
  showSkeleton();
  if (!isConfigured) {
    videos = DEMO;
    return render();
  }
  try {
    F = await import(SDK);
    const snap = await F.getDocs(F.query(F.collection(db, "videos"), F.where("status", "==", "published")));
    videos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  } catch (e) {
    console.error(e);
    grid.replaceChildren(Object.assign(document.createElement("div"), {
      className: "empty",
      textContent: "Gagal memuat data. Coba muat ulang halaman."
    }));
  }
}

/* ---------- dropdown urutan ---------- */
if (sortSel) {
  sortSel.onchange = (e) => {
    sort = e.target.value;
    page = 1;
    render();
  };
}

/* ---------- menu hamburger kategori ---------- */
function closeMenu() {
  menu.classList.add("hidden");
  menuBtn.setAttribute("aria-expanded", "false");
}

menuBtn.onclick = (e) => {
  e.stopPropagation();
  const open = menu.classList.toggle("hidden") === false;
  menuBtn.setAttribute("aria-expanded", String(open));
};

document.addEventListener("click", (e) => {
  if (!menu.contains(e.target)) closeMenu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

function renderMenu() {
  const hasFilter = category !== "Semua";
  menuBtn.classList.toggle("has-filter", hasFilter);

  const mkLabel = (t) => Object.assign(document.createElement("div"), { className: "menu-label", textContent: t });

  const mkItem = (title, active, badgeText, fn) => {
    const b = document.createElement("button");
    b.className = "menu-item" + (active ? " active" : "");
    b.setAttribute("role", "menuitem");

    const span = document.createElement("span");
    span.textContent = title;
    b.appendChild(span);

    if (badgeText) {
      const badge = document.createElement("span");
      badge.className = "menu-badge";
      badge.textContent = badgeText;
      b.appendChild(badge);
    }

    b.onclick = () => {
      fn();
      page = 1;
      closeMenu();
      render();
    };
    return b;
  };

  const catCounts = new Map();
  videos.forEach((v) => {
    if (v.category) catCounts.set(v.category, (catCounts.get(v.category) || 0) + 1);
  });
  const cats = [...catCounts.keys()].sort((a, b) => a.localeCompare(b));

  const items = [
    mkLabel("Kategori"),
    mkItem("Semua Kategori", category === "Semua", String(videos.length), () => { category = "Semua"; }),
    ...cats.map((c) => mkItem(c, c === category, String(catCounts.get(c) || 0), () => { category = c; }))
  ];

  menu.replaceChildren(...items);
}

/* ---------- pencatat klik ---------- */
let clicked = new Set();
try { clicked = new Set(JSON.parse(sessionStorage.getItem("ms_clicked") || "[]")); } catch {}

let countryP = null;
function getCountry() {
  countryP ||= fetch(SHORTENER_URL.replace(/\/$/, "") + "/geo")
    .then((r) => r.json())
    .then((j) => (/^[A-Z]{2}$/.test(j.country) ? j.country : "XX"))
    .catch(() => "XX");
  return countryP;
}

async function track(v, clicksEl) {
  if (clicked.has(v.id)) return;
  clicked.add(v.id);
  try { sessionStorage.setItem("ms_clicked", JSON.stringify([...clicked])); } catch {}

  v.clicks = (v.clicks || 0) + 1;
  if (clicksEl) clicksEl.textContent = v.clicks + " klik";

  if (!F || !isConfigured) return;

  try {
    const country = await getCountry();
    await Promise.all([
      F.updateDoc(F.doc(db, "videos", v.id), { clicks: F.increment(1) }),
      F.addDoc(F.collection(db, "clicks"), {
        videoId: v.id,
        country,
        createdAt: F.serverTimestamp()
      })
    ]);
  } catch (e) {
    console.warn("klik tidak tercatat di server", e);
  }
}

/* ---------- kartu & daftar ---------- */
function getTopVideoIds() {
  const sorted = [...videos].filter((v) => (v.clicks || 0) > 0).sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
  return sorted.slice(0, 3).map((v) => v.id);
}

function card(v, topIds) {
  const href = safeUrl(v.shortUrl) || safeUrl(v.originalUrl);
  const a = document.createElement("a");
  a.className = "card";
  if (href) {
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }

  const thumbWrap = document.createElement("div");
  thumbWrap.className = "thumb-wrap";

  const img = document.createElement("img");
  img.className = "thumb";
  img.loading = "lazy";
  img.alt = v.title || "";
  const t = safeImg(v.thumbnailUrl);
  if (t) img.src = t;
  img.onerror = () => { img.removeAttribute("src"); };
  thumbWrap.appendChild(img);

  if (topIds.includes(v.id)) {
    const badge = document.createElement("div");
    badge.className = "popular-badge";
    badge.textContent = "Populer";
    thumbWrap.appendChild(badge);
  }

  const body = document.createElement("div");
  body.className = "card-body";

  const title = Object.assign(document.createElement("div"), {
    className: "card-title",
    textContent: v.title || "Tanpa judul"
  });

  const meta = document.createElement("div");
  meta.className = "card-meta";

  const cat = Object.assign(document.createElement("span"), {
    className: "card-cat",
    textContent: v.category || "Umum"
  });

  const clicksEl = document.createElement("span");
  clicksEl.className = "card-clicks";
  if ((v.clicks || 0) > 0) {
    clicksEl.textContent = `${v.clicks} klik`;
  }
  meta.append(cat, clicksEl);
  body.append(title, meta);

  a.append(thumbWrap, body);

  a.addEventListener("click", () => track(v, clicksEl));
  a.addEventListener("auxclick", () => track(v, clicksEl));

  return a;
}

function render() {
  if (sortSel && sortSel.value !== sort) sortSel.value = sort;
  renderMenu();
  const q = query.trim().toLowerCase();
  const list = videos.filter((v) =>
    (category === "Semua" || v.category === category) &&
    (!q || (v.title || "").toLowerCase().includes(q))
  );

  const byDate = (a, b) => (b.publishedAt?.seconds || 0) - (a.publishedAt?.seconds || 0);
  list.sort(sort === "popular" ? (a, b) => (b.clicks || 0) - (a.clicks || 0) || byDate(a, b) : byDate);

  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (page > pages) page = pages;
  const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  info.replaceChildren();
  const infoMain = document.createElement("span");
  infoMain.textContent = list.length + " video";
  info.appendChild(infoMain);

  if (category !== "Semua") {
    const catTag = document.createElement("span");
    catTag.className = "info-tag";
    catTag.textContent = "Kategori: " + category;
    info.appendChild(catTag);
  }

  if (sort === "popular") {
    const popTag = document.createElement("span");
    popTag.className = "info-tag";
    popTag.textContent = "Urutan: Paling Populer";
    info.appendChild(popTag);
  }

  if (!isConfigured) {
    const demoTag = document.createElement("span");
    demoTag.className = "info-tag";
    demoTag.style.color = "var(--muted)";
    demoTag.textContent = "(mode demo)";
    info.appendChild(demoTag);
  }

  const topIds = getTopVideoIds();

  if (!slice.length) {
    grid.replaceChildren(Object.assign(document.createElement("div"), {
      className: "empty",
      textContent: "Tidak ada video yang sesuai kriteria pencarian."
    }));
  } else {
    grid.replaceChildren(...slice.map((v) => card(v, topIds)));
  }

  renderPagination(pages);
}

function renderPagination(pages) {
  pagEl.replaceChildren();
  if (pages <= 1) return;

  const mk = (label, p, { disabled = false, active = false } = {}) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.disabled = disabled;
    if (active) b.className = "active";
    b.onclick = () => {
      page = p;
      render();
      scrollTo({ top: 0, behavior: "smooth" });
    };
    pagEl.append(b);
  };

  mk("‹", page - 1, { disabled: page === 1 });
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  for (let p = start; p <= Math.min(pages, start + 4); p++) {
    mk(String(p), p, { active: p === page });
  }
  mk("›", page + 1, { disabled: page === pages });
}

let timer;
$("search").addEventListener("input", (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    query = e.target.value;
    page = 1;
    render();
  }, 200);
});

load();
