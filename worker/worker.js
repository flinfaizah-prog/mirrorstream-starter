// Cloudflare Worker: perantara aman ke SafelinkU + info negara pengunjung.
// Variabel (Settings > Variables and Secrets):
//   SAFELINKU_TOKEN  (Secret)  token API SafelinkU
//   FIREBASE_API_KEY (Secret)  key khusus Worker (hanya Identity Toolkit API)
//   ADMIN_UID        (Text)    UID akun admin Firebase
//   ALLOWED_ORIGINS  (Text)    origin dipisah koma, mis.
//                              https://flinfaizah-prog.github.io,http://localhost:8000
//
// Rute:
//   GET  /geo  -> {"country":"ID"}  (kode negara dari Cloudflare, tanpa menyimpan IP)
//   POST /     -> buat short link (khusus admin)

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "null",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Vary": "Origin"
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!allowed.includes(origin)) return json({ error: "origin not allowed" }, 403);

    const path = new URL(req.url).pathname;

    if (path === "/geo") {
      if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
      const c = req.cf && req.cf.country;
      return json({ country: /^[A-Z]{2}$/.test(c || "") ? c : "XX" });
    }

    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

    // Verifikasi login Firebase + pastikan itu akun admin
    const idToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!idToken) return json({ error: "unauthorized: header Authorization kosong" }, 401);
    if (!env.FIREBASE_API_KEY) return json({ error: "FIREBASE_API_KEY belum diisi di Settings > Variables Cloudflare Worker" }, 500);

    const who = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!who.ok) {
      const err = await who.json().catch(() => ({}));
      return json({ error: "Google Identity Toolkit menolak token / API Key: " + (err.error?.message || who.statusText) }, 401);
    }
    const user = (await who.json()).users?.[0];
    if (!user || user.localId !== env.ADMIN_UID) {
      return json({ error: `Akses ditolak: UID akun login (${user?.localId || "kosong"}) tidak cocok dengan ADMIN_UID (${env.ADMIN_UID || "belum diset"}) di Worker` }, 403);
    }

    let url;
    try {
      const body = await req.json();
      const u = new URL(body.url);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw 0;
      url = u.href;
    } catch { return json({ error: "invalid url" }, 400); }

    const r = await fetch("https://safelinku.com/api/v1/links", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.SAFELINKU_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    let data = {};
    try { data = await r.json(); } catch {}
    return json(r.ok ? data : { error: "safelinku " + r.status, detail: data }, r.ok ? 200 : r.status);
  }
};
