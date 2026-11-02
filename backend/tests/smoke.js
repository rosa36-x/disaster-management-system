// Live end-to-end test against the RUNNING API and the REAL MySQL and MongoDB.
// Unlike `npm test` (fake databases), this proves the stored procedures, triggers,
// CHECK/foreign-key constraints and Mongo validators work through the API.
//
//   1. Start MySQL, MongoDB and the API (npm run dev)
//   2. SMOKE_ADMIN_PASSWORD=... SMOKE_LOGISTICS_PASSWORD=... SMOKE_FIELDWORKER_PASSWORD=... npm run smoke
//      add  -- --matching  to also run real matching + delivery completion (changes demo data)
//
// It cleans up after itself, except one cancelled request (there is no delete-request
// endpoint); the SQL to remove it is printed at the end.
require('dotenv').config({ quiet: true });
const { MongoClient } = require('mongodb');

const BASE = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
const PASSWORDS = {
  admin: process.env.SMOKE_ADMIN_PASSWORD,
  logistics: process.env.SMOKE_LOGISTICS_PASSWORD,
  fieldworker: process.env.SMOKE_FIELDWORKER_PASSWORD,
};
const withMatching = process.argv.includes('--matching');

if (!PASSWORDS.admin || !PASSWORDS.logistics || !PASSWORDS.fieldworker) {
  console.error('Set SMOKE_ADMIN_PASSWORD, SMOKE_LOGISTICS_PASSWORD and SMOKE_FIELDWORKER_PASSWORD (the demo accounts\' passwords).');
  process.exit(1);
}

let passed = 0;
let failed = 0;
let skipped = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log('PASS ' + name); }
  else { failed++; console.log('FAIL ' + name + (detail ? '  -> ' + String(detail).slice(0, 300) : '')); }
};
const skip = (name, why) => { skipped++; console.log('SKIP ' + name + ' (' + why + ')'); };

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, body: json, text };
}
const err = (r) => `${r.status} ${r.text}`;

async function login(username) {
  const r = await api('POST', '/api/auth/login', { username, password: PASSWORDS[username] });
  return { r, token: r.body && r.body.token };
}

async function main() {
  console.log(`Smoke test against ${BASE}${withMatching ? ' (with matching)' : ''}\n`);

  const health = await api('GET', '/api/health');
  check('health: MySQL and MongoDB both up', health.status === 200 && health.body.mysql === 'up' && health.body.mongo === 'up', err(health));
  if (health.status !== 200) throw new Error('API or a database is not reachable; fix this first.');

  // ---------- authentication
  const admin = await login('admin');
  const logistics = await login('logistics');
  const field = await login('fieldworker');
  check('login: admin', admin.r.status === 200 && admin.r.body.user.role === 'admin', err(admin.r));
  check('login: logistics_manager', logistics.r.status === 200 && logistics.r.body.user.role === 'logistics_manager', err(logistics.r));
  check('login: field_worker', field.r.status === 200 && field.r.body.user.role === 'field_worker', err(field.r));
  if (!admin.token || !logistics.token || !field.token) throw new Error('Cannot continue without all three logins (check the SMOKE_* passwords).');
  const A = admin.token, L = logistics.token, F = field.token;

  const bad = await api('POST', '/api/auth/login', { username: 'admin', password: 'definitely-wrong' });
  check('login: wrong password -> 401', bad.status === 401, err(bad));
  check('protected route without token -> 401', (await api('GET', '/api/victims')).status === 401);
  const me = await api('GET', '/api/auth/me', undefined, F);
  check('/me returns the logged-in role', me.status === 200 && me.body.user.role === 'field_worker', err(me));
  const dup = await api('POST', '/api/auth/register', { username: 'admin', password: 'smoke-test-pw1', role: 'field_worker' }, A);
  check('register duplicate username -> 409 (UNIQUE constraint)', dup.status === 409, err(dup));

  // ---------- role-based access
  check('field_worker cannot create a depot -> 403', (await api('POST', '/api/depots', { name: 'x', latitude: 1, longitude: 1 }, F)).status === 403);
  check('logistics cannot create a victim -> 403', (await api('POST', '/api/victims', { latitude: 1, longitude: 1 }, L)).status === 403);
  check('field_worker cannot run matching -> 403', (await api('POST', '/api/matches/run', undefined, F)).status === 403);
  check('field_worker cannot delete a victim -> 403', (await api('DELETE', '/api/victims/1', undefined, F)).status === 403);

  // ---------- input validation
  check('invalid latitude -> 400', (await api('POST', '/api/victims', { latitude: 100, longitude: 1 }, A)).status === 400);
  check('request quantity 0 -> 400', (await api('POST', '/api/requests', { person_id: 1, resource_type: 'water', quantity: 0 }, A)).status === 400);

  // ---------- database constraints
  const fk = await api('POST', '/api/requests', { person_id: 999999999, resource_type: 'water', quantity: 1, description: 'SMOKE TEST fk' }, F);
  check('foreign key: unknown victim -> 400', fk.status === 400, err(fk));

  const shelter = await api('POST', '/api/shelters', { name: 'SMOKE TEST shelter', latitude: 12.9, longitude: 77.6, capacity: 10, occupancy: 5 }, L);
  check('shelter created', shelter.status === 201, err(shelter));
  if (shelter.status === 201) {
    const id = shelter.body.shelter.shelter_id;
    const chk = await api('PATCH', `/api/shelters/${id}`, { capacity: 3 }, L);
    check('CHECK constraint: capacity below occupancy -> 400', chk.status === 400, err(chk));
    check('shelter deleted (cleanup)', (await api('DELETE', `/api/shelters/${id}`, undefined, A)).status === 204);
  } else skip('CHECK constraint test', 'shelter not created');

  // ---------- supply -> request lifecycle (triggers, procedure error path, history)
  const victims = await api('GET', '/api/victims?limit=1', undefined, A);
  const victimId = victims.body && victims.body.data && victims.body.data[0] && victims.body.data[0].person_id;
  let depotId, supplyId, requestId;
  if (!victimId) skip('request lifecycle', 'no victims in the database');
  else {
    const depot = await api('POST', '/api/depots', { name: 'SMOKE TEST depot', latitude: 12.96, longitude: 77.6 }, L);
    depotId = depot.body && depot.body.depot && depot.body.depot.depot_id;
    check('depot created', depot.status === 201, err(depot));
    const supply = await api('POST', '/api/supplies', { depot_id: depotId, resource_type: 'smoke-item', quantity: 1 }, L);
    supplyId = supply.body && supply.body.supply && supply.body.supply.supply_id;
    check('supply created', supply.status === 201, err(supply));

    check('foreign key: delete depot still holding supply -> 409', (await api('DELETE', `/api/depots/${depotId}`, undefined, A)).status === 409);
    const restock = await api('POST', `/api/supplies/${supplyId}/restock`, { amount: 4 }, L);
    check('restock adds to stock (1 + 4 = 5)', restock.status === 200 && restock.body.supply.quantity === 5, err(restock));

    const request = await api('POST', '/api/requests', { person_id: victimId, resource_type: 'smoke-item', quantity: 8, description: 'SMOKE TEST request' }, F);
    requestId = request.body && request.body.request && request.body.request.request_id;
    check('request created as pending', request.status === 201 && request.body.request.status === 'pending', err(request));

    const h1 = await api('GET', `/api/requests/${requestId}/history`, undefined, F);
    check('trigger logged the new request in request_history', h1.status === 200 && h1.body.history.length === 1 && h1.body.history[0].new_status === 'pending', err(h1));

    const match = await api('POST', `/api/requests/${requestId}/match`, undefined, L);
    check('sp_match_request: stock 5 < needed 8 -> 409 "No supply available"', match.status === 409 && /No supply available/.test(match.text), err(match));

    const c1 = await api('PATCH', `/api/requests/${requestId}/cancel`, undefined, F);
    check('cancel pending request -> cancelled', c1.status === 200 && c1.body.request.status === 'cancelled', err(c1));
    check('cancel again -> 409', (await api('PATCH', `/api/requests/${requestId}/cancel`, undefined, F)).status === 409);
    const h2 = await api('GET', `/api/requests/${requestId}/history`, undefined, F);
    check('trigger logged the cancellation (2 history rows)', h2.status === 200 && h2.body.history.length === 2, err(h2));
  }

  // ---------- MongoDB + cross-database
  const mongo = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 3000 });
  await mongo.connect();
  const mdb = mongo.db(process.env.MONGO_DB);
  let incidentId;
  try {
    // validator, bypassing the API entirely
    let code = null;
    try { await mdb.collection('incident_reports').insertOne({ title: 'SMOKE TEST invalid', severity: 'extreme' }); }
    catch (e) { code = e.code; }
    check('MongoDB validator rejects an invalid document directly (error 121)', code === 121, 'error code: ' + code);

    const unknown = await api('POST', '/api/incidents', { title: 'SMOKE TEST bad link', disaster_type: 'Flood', severity: 'low', latitude: 12.97, longitude: 77.59, description: 'x', related_request_ids: [999999999] }, F);
    check('incident linking a non-existent MySQL request -> 400', unknown.status === 400, err(unknown));

    if (!requestId) skip('cross-database tests', 'no request was created');
    else {
      const inc = await api('POST', '/api/incidents', { title: 'SMOKE TEST incident', disaster_type: 'Flood', severity: 'high', latitude: 12.97, longitude: 77.59, description: 'smoke test', related_request_ids: [requestId] }, F);
      incidentId = inc.body && inc.body.incident && inc.body.incident.id;
      check('incident created in MongoDB', inc.status === 201 && incidentId, err(inc));

      const linked = await api('GET', `/api/incidents/${incidentId}/requests`, undefined, A);
      check('incident -> its MySQL requests', linked.status === 200 && linked.body.requests.some((r) => r.request_id === requestId) && linked.body.missing_request_ids.length === 0, err(linked));
      const back = await api('GET', `/api/requests/${requestId}/incidents`, undefined, A);
      check('request -> its MongoDB incidents', back.status === 200 && back.body.incidents.some((i) => i.id === incidentId), err(back));

      const near = await api('GET', '/api/incidents/nearby?lat=12.97&lng=77.59&radius_km=1', undefined, A);
      check('$geoNear finds the incident within 1 km', near.status === 200 && near.body.data.some((i) => i.id === incidentId), err(near));
      const nd = await api('GET', `/api/incidents/${incidentId}/nearest-depots`, undefined, A);
      const dist = nd.body && nd.body.data ? nd.body.data.map((d) => d.distance_km) : [];
      check('nearest depots (Mongo location + MySQL fn_distance_km), nearest first', nd.status === 200 && dist.length > 0 && dist.every((d, i) => i === 0 || d >= dist[i - 1]), err(nd));

      const upd = await api('POST', `/api/incidents/${incidentId}/updates`, { situation: 'SMOKE TEST update', additional_requirements: ['smoke-item'] }, F);
      check('field update added', upd.status === 201, err(upd));
      check('incident with field updates cannot be deleted -> 409', (await api('DELETE', `/api/incidents/${incidentId}`, undefined, A)).status === 409);
      const reqs = await api('GET', '/api/field-updates/requirements?limit=50', undefined, A);
      check('aggregation: requirement counts include the new update', reqs.status === 200 && reqs.body.data.some((x) => x.requirement === 'smoke-item' && x.mentions >= 1), err(reqs));
      const stats = await api('GET', '/api/incidents/stats', undefined, A);
      check('incident stats ($facet)', stats.status === 200 && stats.body.total >= 1, err(stats));
    }
  } finally {
    await mdb.collection('field_updates').deleteMany({ situation: /^SMOKE TEST/ });
    await mdb.collection('incident_reports').deleteMany({ title: /^SMOKE TEST/ });
    await mongo.close();
  }

  // ---------- dashboard
  const ov = await api('GET', '/api/dashboard/overview', undefined, A);
  check('dashboard overview', ov.status === 200 && ov.body.requests && ov.body.vehicles && ov.body.shelters, err(ov));
  for (const p of ['supply-demand', 'shelters', 'priority-queue']) {
    const d = await api('GET', `/api/dashboard/${p}`, undefined, A);
    check(`dashboard ${p}`, d.status === 200 && Array.isArray(d.body.data), err(d));
  }

  // ---------- optional: real matching (changes demo data)
  if (withMatching) {
    const run = await api('POST', '/api/matches/run', undefined, L);
    check('matching run: matched + still_pending = pending_before', run.status === 200 && run.body.matched + run.body.still_pending === run.body.pending_before, err(run));
    const first = run.body && run.body.assignments && run.body.assignments[0];
    if (first) {
      const done = await api('POST', `/api/matches/${first.match_id}/complete`, undefined, L);
      check('complete delivery -> request delivered', done.status === 200 && done.body.match.request_status === 'delivered', err(done));
      check('complete twice -> 409', (await api('POST', `/api/matches/${first.match_id}/complete`, undefined, L)).status === 409);
    } else skip('complete delivery', 'matching produced no assignments (nothing pending or no stock)');
  } else skip('real matching + delivery completion', 'run with -- --matching');

  // ---------- cleanup
  if (supplyId) check('cleanup: supply deleted', (await api('DELETE', `/api/supplies/${supplyId}`, undefined, A)).status === 204);
  if (depotId) check('cleanup: depot deleted', (await api('DELETE', `/api/depots/${depotId}`, undefined, A)).status === 204);

  if (requestId) {
    console.log("\nOne cancelled request (description 'SMOKE TEST request') remains. To remove it:");
    console.log("  DELETE FROM request_history WHERE request_id IN (SELECT request_id FROM request WHERE description LIKE 'SMOKE TEST%');");
    console.log("  DELETE FROM request WHERE description LIKE 'SMOKE TEST%';");
  }
}

main()
  .catch((e) => { failed++; console.log('FAIL ' + e.message); })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
    process.exit(failed ? 1 : 0);
  });
