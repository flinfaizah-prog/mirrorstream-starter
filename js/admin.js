import { db, auth, safeUrl } from "./firebase.js";
import { isConfigured, SHORTENER_URL } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const show = (id, on) => $(id).classList.toggle("hidden", !on);
const msg = (id, text, ok) => { const el = $(id); el.textContent = text; el.className = "msg " + (ok ? "ok" : "err"); };

if (!isConfigured) { show("notconf", true); }
else init();

async function init() {
  const A = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
  const F = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
  const col = F.collection(db, "videos");
  let items = [], editingId = null;

  A.onAuthStateChanged(auth, (user) => {
    show("loginBox", !user); show("app", !!user); show("logout", !!user);
    if (user) loadAll();
  });

  $("loginBtn").onclick = async () => {
    try { await A.signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value); $("loginMsg").textContent = ""; }
    catch { msg("loginMsg", "Login gagal. Periksa email dan password."); }
  };
  $("logout").onclick = () => A.signOut(auth);

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
    console.log("Respons SafelinkU:", j);
    const short = j.url || j.shortenedUrl || j.shortUrl || j.short_url || j.data?.url;
    if (!safeUrl(short)) throw new Error("respons tidak berisi short link");
    return safeUrl(short);
  }

  async function loadAll() {
    try {
      const snap = await F.getDocs(col);
      items = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      renderList();
    } catch (e) {
      console.error(e);
      msg("formMsg", "Tidak punya akses. Pastikan UID akun ini ada di koleksi 'admins' (lihat README).");
    }
  }

  function renderList() {
    const q = $("filter").value.trim().toLowerCase(), st = $("statusFilter").value;
    $("catlist").replaceChildren(...[...new Set(items.map((v) => v.category).filter(Boolean))].map((c) => Object.assign(document.createElement("option"), { value: c })));
    const list = items.filter((v) => (!st || v.status === st) && (!q || (v.title || "").toLowerCase().includes(q)));
    $("rows").replaceChildren(...list.map(row));
  }

  function row(v) {
    const tr = document.createElement("tr");
    const td = () => tr.appendChild(document.createElement("td"));
    const img = document.createElement("img"); img.loading = "lazy";
    const t = safeUrl(v.thumbnailUrl); if (t) img.src = t;
    td().append(img);
    td().textContent = v.title || "";
    td().textContent = v.category || "";
    const b = document.createElement("span"); b.className = "badge " + v.status; b.textContent = v.status;
    td().append(b);
    const actions = td();
    const btn = (label, fn) => { const x = document.createElement("button"); x.className = "btn ghost sm"; x.textContent = label; x.onclick = fn; actions.append(x, " "); };
    btn("Edit", () => startEdit(v));
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
    if (!confirm(`Hapus permanen "${v.title}"? Pertimbangkan Arsipkan saja.`)) return;
    await F.deleteDoc(F.doc(db, "videos", v.id));
    loadAll();
  }

  const fields = ["title", "originalUrl", "shortUrl", "thumbnailUrl", "category", "description", "status"];

  function startEdit(v) {
    editingId = v.id;
    fields.forEach((f) => { $(f).value = v[f] || (f === "status" ? "draft" : ""); });
    $("formTitle").textContent = "Edit Video";
    show("cancelBtn", true);
    scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    editingId = null;
    fields.forEach((f) => { $(f).value = f === "status" ? "draft" : ""; });
    $("formTitle").textContent = "Tambah Video";
    show("cancelBtn", false);
  }
  $("cancelBtn").onclick = reset;

  $("saveBtn").onclick = async () => {
    const d = Object.fromEntries(fields.map((f) => [f, $(f).value.trim()]));
    if (!d.title) return msg("formMsg", "Judul wajib diisi.");
    const orig = safeUrl(d.originalUrl);
    if (!orig) return msg("formMsg", "URL asli harus http:// atau https:// yang valid.");
    const prev = editingId ? items.find((x) => x.id === editingId) : null;
    if (!prev || prev.originalUrl !== orig || !prev.shortUrl) {
      msg("formMsg", "Membuat short link...", true);
      try { d.shortUrl = await shorten(orig); }
      catch (e) { return msg("formMsg", "Gagal membuat short link: " + e.message); }
    } else d.shortUrl = prev.shortUrl;
    if (d.thumbnailUrl && !safeUrl(d.thumbnailUrl)) return msg("formMsg", "URL thumbnail tidak valid.");
    d.originalUrl = orig;
    try {
      const payload = { ...d, updatedAt: F.serverTimestamp() };
      if (editingId) {
        const old = items.find((x) => x.id === editingId);
        if (d.status === "published" && old?.status !== "published") payload.publishedAt = F.serverTimestamp();
        await F.updateDoc(F.doc(db, "videos", editingId), payload);
      } else {
        payload.createdAt = F.serverTimestamp();
        payload.createdBy = auth.currentUser.uid;
        if (d.status === "published") payload.publishedAt = F.serverTimestamp();
        await F.addDoc(col, payload);
      }
      msg("formMsg", "Tersimpan.", true);
      reset(); loadAll();
    } catch (e) {
      console.error(e);
      msg("formMsg", "Gagal menyimpan. Periksa akses admin dan Security Rules.");
    }
  };

  $("filter").oninput = renderList;
  $("statusFilter").onchange = renderList;
}
