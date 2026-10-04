import { db, safeUrl } from "./firebase.js";
import { PAGE_SIZE, isConfigured } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const grid = $("grid"), info = $("info"), pagEl = $("pagination"), catEl = $("categories");
let videos = [], category = "Semua", query = "", page = 1;

// Data contoh dipakai selama Firebase belum diisi
const DEMO = Array.from({ length: 47 }, (_, i) => ({
  id: "demo" + i, title: "Video contoh " + (i + 1),
  category: ["Hiburan", "Anime", "Musik"][i % 3],
  thumbnailUrl: "", shortUrl: "https://example.com/"
}));

function showSkeleton() {
  grid.replaceChildren(...Array.from({ length: 10 }, () => Object.assign(document.createElement("div"), { className: "skeleton" })));
}

async function load() {
  showSkeleton();
  if (!isConfigured) { videos = DEMO; return render(); }
  try {
    const { collection, query: q, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const snap = await getDocs(q(collection(db, "videos"), where("status", "==", "published")));
    videos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.publishedAt?.seconds || 0) - (a.publishedAt?.seconds || 0));
    render();
  } catch (e) {
    console.error(e);
    grid.replaceChildren(Object.assign(document.createElement("div"), { className: "empty", textContent: "Gagal memuat data. Coba muat ulang halaman." }));
  }
}

function renderCategories() {
  const cats = ["Semua", ...new Set(videos.map((v) => v.category).filter(Boolean))];
  catEl.replaceChildren(...cats.map((c) => {
    const b = document.createElement("button");
    b.className = "chip" + (c === category ? " active" : "");
    b.textContent = c;
    b.onclick = () => { category = c; page = 1; render(); };
    return b;
  }));
}

function card(v) {
  const href = safeUrl(v.shortUrl) || safeUrl(v.originalUrl);
  const a = document.createElement("a");
  a.className = "card";
  if (href) { a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; }
  const img = document.createElement("img");
  img.className = "thumb"; img.loading = "lazy"; img.alt = v.title || "";
  const t = safeUrl(v.thumbnailUrl);
  if (t) img.src = t;
  img.onerror = () => { img.removeAttribute("src"); };
  const body = document.createElement("div");
  body.className = "card-body";
  const title = Object.assign(document.createElement("div"), { className: "card-title", textContent: v.title || "" });
  const cat = Object.assign(document.createElement("div"), { className: "card-cat", textContent: v.category || "" });
  body.append(title, cat);
  a.append(img, body);
  return a;
}

function render() {
  renderCategories();
  const q = query.trim().toLowerCase();
  const list = videos.filter((v) =>
    (category === "Semua" || v.category === category) &&
    (!q || (v.title || "").toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (page > pages) page = pages;
  const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  info.textContent = list.length + " video ditemukan" + (isConfigured ? "" : " (data contoh, Firebase belum dikonfigurasi)");
  if (!slice.length) {
    grid.replaceChildren(Object.assign(document.createElement("div"), { className: "empty", textContent: "Belum ada video." }));
  } else grid.replaceChildren(...slice.map(card));
  renderPagination(pages);
}

function renderPagination(pages) {
  pagEl.replaceChildren();
  if (pages <= 1) return;
  const mk = (label, p, { disabled = false, active = false } = {}) => {
    const b = document.createElement("button");
    b.textContent = label; b.disabled = disabled;
    if (active) b.className = "active";
    b.onclick = () => { page = p; render(); scrollTo({ top: 0, behavior: "smooth" }); };
    pagEl.append(b);
  };
  mk("‹", page - 1, { disabled: page === 1 });
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  for (let p = start; p <= Math.min(pages, start + 4); p++) mk(String(p), p, { active: p === page });
  mk("›", page + 1, { disabled: page === pages });
}

let timer;
$("search").addEventListener("input", (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => { query = e.target.value; page = 1; render(); }, 200);
});

load();
