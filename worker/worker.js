// Cloudflare Worker: perantara aman ke SafelinkU.
// Variabel yang harus diisi di Cloudflare (Settings > Variables and Secrets):
//   SAFELINKU_TOKEN  (Secret)  token API SafelinkU
//   FIREBASE_API_KEY (Text)    apiKey dari firebase-config.js
//   ADMIN_UID        (Text)    UID akun admin Firebase
//   ALLOWED_ORIGINS  (Text)    daftar origin dipisah koma, mis.
//                              https://USERNAME.github.io,http://127.0.0.1:5500,http://localhost:5500

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "null",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin"
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
    if (!allowed.includes(origin)) return json({ error: "origin not allowed" }, 403);

    // Verifikasi login Firebase + pastikan itu akun admin
    const idToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!idToken) return json({ error: "unauthorized" }, 401);
    const who = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!who.ok) return json({ error: "unauthorized" }, 401);
    const user = (await who.json()).users?.[0];
    if (!user || user.localId !== env.ADMIN_UID) return json({ error: "forbidden" }, 403);

    // Validasi URL
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
