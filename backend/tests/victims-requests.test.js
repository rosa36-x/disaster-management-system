const path = require('path');
const root = path.resolve(__dirname, '..');
const { Parser } = require('node-sql-parser');
const jwt = require('jsonwebtoken');
Object.assign(process.env, { MYSQL_HOST:'x', MYSQL_USER:'x', MYSQL_DATABASE:'x', MONGO_URI:'mongodb://127.0.0.1:1', MONGO_DB:'x', JWT_SECRET:'test-secret' });

const calls = [];
const allCalls = [];
let handler = () => [[]];
const fakePool = { async query(sql, params) { calls.push({ sql, params }); allCalls.push({ sql, params }); return handler(sql, params); } };
const p = path.join(root, 'src/db/mysql.js');
require.cache[require.resolve(p)] = { id:p, filename:p, loaded:true, exports:fakePool };
const app = require(path.join(root, 'src/app.js'));

const tok = (role, id=1) => jwt.sign({ username: role, role }, 'test-secret', { subject: String(id), expiresIn: '1h' });
const T = { admin: tok('admin'), logistics: tok('logistics_manager', 2), field: tok('field_worker', 3) };

const victimRow = { person_id: 7, name: 'Asha', latitude: 12.9716, longitude: 77.5946, group_size: 4, priority: 'critical' };
const reqRow = { request_id: 5, person_id: 7, victim_name: 'Asha', victim_priority: 'critical', resource_type: 'water', quantity: 40,
  status: 'pending', requested_at: '2026-11-01T00:00:00Z', description: 'x', match_id: null, supply_id: null, vehicle_id: null, assigned_qty: null, eta_minutes: null, matched_at: null };

const s = app.listen(4102, async () => {
  const call = async (method, url, body, token) => {
    const r = await fetch('http://localhost:4102' + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
  let fails = 0;
  const check = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); };
  const last = () => calls[calls.length - 1];
  const dbErr = (code, sqlMessage) => () => { const e = new Error(code); e.code = code; e.sqlMessage = sqlMessage; throw e; };
  const listHandler = (rows, total) => (sql) => sql.includes('COUNT(*)') ? [[{ total }]] : [rows];

  // ---- victims: auth + list
  check('victims no token 401', (await call('GET', '/api/victims')).status === 401);
  handler = listHandler([victimRow], 45);
  calls.length = 0;
  let r = await call('GET', '/api/victims', null, T.logistics);
  check('victims list 200 + shape', r.status === 200 && r.body.data.length === 1 && r.body.pagination.total === 45 && r.body.pagination.totalPages === 3, JSON.stringify(r.body));
  const listCall = calls.find((c) => c.sql.includes('LIMIT'));
  check('default paging params [20,0]', JSON.stringify(listCall.params) === '[20,0]', JSON.stringify(listCall.params));
  calls.length = 0;
  await call('GET', '/api/victims?priority=critical&search=a_b%25&page=2&limit=5&sort=name&order=desc', null, T.admin);
  const fc = calls.find((c) => c.sql.includes('LIMIT'));
  check('filters+search escaped+paging params', JSON.stringify(fc.params) === JSON.stringify(['critical', '%a\\_b\\%%', 5, 5]), JSON.stringify(fc.params));
  check('sort whitelisted into ORDER BY', fc.sql.includes('ORDER BY name DESC'), fc.sql);
  check('bad priority 400', (await call('GET', '/api/victims?priority=urgent', null, T.admin)).status === 400);
  check('bad limit 400', (await call('GET', '/api/victims?limit=abc', null, T.admin)).status === 400);
  check('bad page 0 400', (await call('GET', '/api/victims?page=0', null, T.admin)).status === 400);
  check('sort injection 400', (await call('GET', '/api/victims?sort=name;DROP TABLE victim', null, T.admin)).status === 400);
  check('order injection 400', (await call('GET', '/api/victims?order=asc;--', null, T.admin)).status === 400);
  calls.length = 0;
  r = await call('GET', '/api/victims?limit=1000', null, T.admin);
  check('limit clamped to 100', r.body.pagination.limit === 100);

  // ---- victims: get one
  check('get id=abc 400', (await call('GET', '/api/victims/abc', null, T.admin)).status === 400);
  handler = () => [[]];
  check('get missing 404', (await call('GET', '/api/victims/99', null, T.admin)).status === 404);
  handler = () => [[victimRow]];
  r = await call('GET', '/api/victims/7', null, T.admin);
  check('get one 200', r.status === 200 && r.body.victim.person_id === 7);

  // ---- victims: create
  const good = { name: 'Asha', latitude: 12.97, longitude: 77.59, group_size: 4, priority: 'critical' };
  handler = (sql) => sql.startsWith('INSERT') ? [{ insertId: 7 }] : [[victimRow]];
  check('create as logistics 403', (await call('POST', '/api/victims', good, T.logistics)).status === 403);
  calls.length = 0;
  r = await call('POST', '/api/victims', good, T.field);
  check('create as field_worker 201', r.status === 201 && r.body.victim.person_id === 7, JSON.stringify(r.body));
  check('insert columns/params', calls[0].sql.startsWith('INSERT INTO victim (name, latitude, longitude, group_size, priority) VALUES (?, ?, ?, ?, ?)') && JSON.stringify(calls[0].params) === JSON.stringify(['Asha', 12.97, 77.59, 4, 'critical']), calls[0].sql + JSON.stringify(calls[0].params));
  for (const [name, body] of [
    ['lat out of range', { ...good, latitude: 100 }], ['lng out of range', { ...good, longitude: -181 }],
    ['missing latitude', { longitude: 77 }], ['group_size 0', { ...good, group_size: 0 }],
    ['group_size string', { ...good, group_size: '3' }], ['group_size float', { ...good, group_size: 2.5 }],
    ['bad priority', { ...good, priority: 'urgent' }], ['unknown field', { ...good, person_id: 5 }],
    ['latitude string', { ...good, latitude: '12.9' }], ['name too long', { ...good, name: 'a'.repeat(151) }],
    ['name null ok? (should be allowed)', null],
  ]) {
    if (body === null) continue;
    check('create invalid: ' + name + ' 400', (await call('POST', '/api/victims', body, T.admin)).status === 400);
  }
  r = await call('POST', '/api/victims', { latitude: 1, longitude: 2, name: null }, T.admin);
  check('create minimal with name:null 201', r.status === 201, JSON.stringify(r.body));
  check('array body 400', (await call('POST', '/api/victims', [1], T.admin)).status === 400);

  // ---- victims: patch / delete
  handler = () => [[victimRow]];
  check('patch empty 400', (await call('PATCH', '/api/victims/7', {}, T.admin)).status === 400);
  calls.length = 0;
  r = await call('PATCH', '/api/victims/7', { priority: 'low', group_size: 2 }, T.field);
  check('patch 200', r.status === 200);
  check('patch SQL', calls[0].sql === 'UPDATE victim SET priority = ?, group_size = ? WHERE person_id = ?' || calls[0].sql === 'UPDATE victim SET group_size = ?, priority = ? WHERE person_id = ?', calls[0].sql);
  check('patch as logistics 403', (await call('PATCH', '/api/victims/7', { priority: 'low' }, T.logistics)).status === 403);
  handler = (sql) => sql.startsWith('UPDATE') ? [{}] : [[]];
  check('patch missing 404', (await call('PATCH', '/api/victims/99', { priority: 'low' }, T.admin)).status === 404);
  check('delete as field_worker 403', (await call('DELETE', '/api/victims/7', null, T.field)).status === 403);
  handler = () => [{ affectedRows: 1 }];
  check('delete 204', (await call('DELETE', '/api/victims/7', null, T.admin)).status === 204);
  handler = () => [{ affectedRows: 0 }];
  check('delete missing 404', (await call('DELETE', '/api/victims/99', null, T.admin)).status === 404);
  handler = dbErr('ER_ROW_IS_REFERENCED_2');
  r = await call('DELETE', '/api/victims/7', null, T.admin);
  check('delete referenced victim 409', r.status === 409, JSON.stringify(r.body));

  // ---- requests: list
  handler = listHandler([reqRow], 1);
  calls.length = 0;
  r = await call('GET', '/api/requests?status=pending&resource_type=WATER&priority=critical&person_id=7&search=fam', null, T.field);
  const rc = calls.find((c) => c.sql.includes('LIMIT'));
  check('requests list 200, match null', r.status === 200 && r.body.data[0].match === null && !('match_id' in r.body.data[0]), JSON.stringify(r.body));
  check('request filter params order', JSON.stringify(rc.params) === JSON.stringify(['pending', 'critical', 'water', 7, '%fam%', '%fam%', 20, 0]), JSON.stringify(rc.params));
  check('bad status 400', (await call('GET', '/api/requests?status=done', null, T.admin)).status === 400);
  check('bad person_id 400', (await call('GET', '/api/requests?person_id=x', null, T.admin)).status === 400);
  check('requests sort whitelist', (await call('GET', '/api/requests?sort=description', null, T.admin)).status === 400);

  // ---- requests: get one with match
  handler = () => [[{ ...reqRow, status: 'matched', match_id: 3, supply_id: 2, vehicle_id: 1, assigned_qty: 40, eta_minutes: 25, matched_at: 't' }]];
  r = await call('GET', '/api/requests/5', null, T.admin);
  check('request with nested match', r.status === 200 && r.body.request.match.match_id === 3 && r.body.request.match.eta_minutes === 25, JSON.stringify(r.body));
  handler = () => [[]];
  check('request missing 404', (await call('GET', '/api/requests/5', null, T.admin)).status === 404);

  // ---- requests: create
  const greq = { person_id: 7, resource_type: ' Water ', quantity: 40, description: 'need water' };
  handler = (sql) => sql.startsWith('INSERT') ? [{ insertId: 5 }] : sql.includes('MAX(quantity)') ? [[{ largest: 500 }]] : [[reqRow]];
  check('request create as logistics 403', (await call('POST', '/api/requests', greq, T.logistics)).status === 403);
  calls.length = 0;
  r = await call('POST', '/api/requests', greq, T.field);
  check('request create 201', r.status === 201 && r.body.request.request_id === 5, JSON.stringify(r.body));
  check('resource_type trimmed+lowercased', calls[0].params[1] === 'water', JSON.stringify(calls[0].params));
  // stock warning: accepted either way, but told when no single supply can serve it
  check('request create: enough stock -> no warning', r.body.warning === undefined, JSON.stringify(r.body));
  handler = (sql) => sql.startsWith('INSERT') ? [{ insertId: 5 }] : sql.includes('MAX(quantity)') ? [[{ largest: 25 }]] : [[reqRow]];
  r = await call('POST', '/api/requests', greq, T.field);
  check('request create: not enough stock -> 201 + warning with largest supply', r.status === 201 && /largest: 25/.test(r.body.warning) && /40 water/.test(r.body.warning), JSON.stringify(r.body));
  handler = (sql) => sql.startsWith('INSERT') ? [{ insertId: 5 }] : [[reqRow]];
  for (const [name, body] of [
    ['missing person_id', { ...greq, person_id: undefined }], ['quantity 0', { ...greq, quantity: 0 }], ['quantity negative', { ...greq, quantity: -5 }],
    ['empty resource_type', { ...greq, resource_type: '  ' }], ['status in body rejected', { ...greq, status: 'matched' }],
    ['quantity string', { ...greq, quantity: '40' }],
  ]) check('request create invalid: ' + name + ' 400', (await call('POST', '/api/requests', body, T.admin)).status === 400);
  handler = dbErr('ER_NO_REFERENCED_ROW_2');
  r = await call('POST', '/api/requests', { ...greq, person_id: 9999 }, T.admin);
  check('request unknown person FK -> 400', r.status === 400 && /does not exist/.test(r.body.error), JSON.stringify(r.body));
  handler = dbErr('ER_CHECK_CONSTRAINT_VIOLATED');
  check('CHECK violation -> 400', (await call('POST', '/api/requests', greq, T.admin)).status === 400);

  // ---- cancel
  calls.length = 0;
  handler = (sql) => sql.startsWith('UPDATE') ? [{ affectedRows: 1 }] : [[{ ...reqRow, status: 'cancelled' }]];
  r = await call('PATCH', '/api/requests/5/cancel', null, T.field);
  check('cancel pending 200', r.status === 200 && r.body.request.status === 'cancelled', JSON.stringify(r.body));
  check('cancel SQL guards on pending', calls[0].sql.includes("status = 'pending'"));
  handler = (sql) => sql.startsWith('UPDATE') ? [{ affectedRows: 0 }] : [[{ ...reqRow, status: 'matched' }]];
  r = await call('PATCH', '/api/requests/5/cancel', null, T.admin);
  check('cancel matched 409', r.status === 409 && /matched/.test(r.body.error), JSON.stringify(r.body));
  handler = (sql) => sql.startsWith('UPDATE') ? [{ affectedRows: 0 }] : [[]];
  check('cancel missing 404', (await call('PATCH', '/api/requests/5/cancel', null, T.admin)).status === 404);
  check('cancel as logistics 403', (await call('PATCH', '/api/requests/5/cancel', null, T.logistics)).status === 403);

  // ---- error mapping
  handler = dbErr('ER_SIGNAL_EXCEPTION', 'Insufficient supply');
  r = await call('POST', '/api/requests', greq, T.admin);
  check('trigger SIGNAL -> 409 with message', r.status === 409 && r.body.error === 'Insufficient supply', JSON.stringify(r.body));
  handler = () => { const e = new Error("Table 'disaster.secret' doesn't exist"); e.code = 'ER_NO_SUCH_TABLE'; throw e; };
  const origErr = console.error; console.error = () => {};
  r = await call('GET', '/api/victims/7', null, T.admin);
  console.error = origErr;
  check('unknown DB error -> 500, no leak', r.status === 500 && r.body.error === 'Internal server error' && !JSON.stringify(r.body).includes('secret'), JSON.stringify(r.body));

  // ---- SQL syntax check of every statement the routes produced
  const parser = new Parser();
  const seen = new Set();
  let syntaxFails = 0;
  for (const c of allCalls) { seen.add(c.sql); }
  console.log(`\n(syntax-checking ${seen.size} distinct SQL statements)`);
  for (const sql of seen) {
    try { parser.astify(sql.replace(/\?/g, '1'), { database: 'mysql' }); }
    catch (e) { syntaxFails++; console.log('FAIL syntax: ' + sql.replace(/\s+/g, ' ').slice(0, 160) + '\n   ' + e.message.split('\n')[0]); }
  }
  check('all emitted SQL parses as MySQL', syntaxFails === 0);

  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  s.close(); process.exit(fails ? 1 : 0);
});
