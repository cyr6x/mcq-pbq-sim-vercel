// Usage: PGHOST=... node tests/fakerest.js  (needs: npm i pg; a Postgres with supabase/schema.sql and roles anon/authenticated)
// Minimal stand-in for Supabase's PostgREST RPC endpoint, backed by a real
// Postgres running supabase/schema.sql. Every call runs as the `anon` role.
const http = require('http');
const { Pool } = require('pg');
const pool = new Pool({ host: process.env.PGHOST || '/var/lib/postgresql', port: +(process.env.PGPORT || 55432), user: process.env.PGUSER || 'postgres', database: process.env.PGDATABASE || 'postgres' });
const API_KEY = process.env.API_KEY || 'sb_publishable_testkey_0123456789';
const FNS = {
  sim_push: { sql: 'select public.sim_push($1, $2::jsonb) as r', args: b => [b.p_key, JSON.stringify(b.p_rows)], scalar: true },
  sim_pull: { sql: 'select * from public.sim_pull($1)', args: b => [b.p_key], scalar: false },
  sim_forget: { sql: 'select public.sim_forget($1) as r', args: b => [b.p_key], scalar: true },
};
http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    if (req.headers.apikey !== API_KEY) return send(401, { message: 'Invalid API key' });
    const m = req.url.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
    const fn = m && FNS[m[1]];
    if (!fn) return send(404, { code: 'PGRST202', message: 'Could not find the function' });
    let b; try { b = JSON.parse(body || '{}'); } catch (e) { return send(400, { message: 'bad json' }); }
    const c = await pool.connect();
    try {
      await c.query('begin'); await c.query('set local role anon');
      const r = await c.query(fn.sql, fn.args(b));
      await c.query('commit');
      send(200, fn.scalar ? r.rows[0].r : r.rows);
    } catch (e) {
      await c.query('rollback').catch(() => {});
      send(400, { code: e.code, message: e.message, details: e.detail || null });
    } finally { c.release(); }
  });
}).listen(54321, () => console.log('fake rest on 54321'));
