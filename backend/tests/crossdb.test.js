// Cross-database endpoints: MongoDB incidents <-> MySQL requests and depots.
const h = require('./helpers/harness');
const { T, ObjectId } = h;
const m = h.mongo;

h.start(4107, async (call, check) => {
  const reset = () => { m.ops.length = 0; m.results = {}; h.calls.length = 0; };
  const iid = new ObjectId();
  const reqRow = (id, status, match = {}) => ({
    request_id: id, person_id: 7, victim_name: 'Asha', victim_priority: 'critical', resource_type: 'water', quantity: 10,
    status, requested_at: 't', description: 'x', match_id: null, supply_id: null, vehicle_id: null, assigned_qty: null, eta_minutes: null, matched_at: null, ...match,
  });
  const incident = (ids) => ({ _id: iid, title: 'Flood', disaster_type: 'Flood', severity: 'critical', location: { type: 'Point', coordinates: [77.6, 12.96] }, related_request_ids: ids });

  // ===== incident -> its MySQL requests
  check('incident requests: no token 401', (await call('GET', `/api/incidents/${iid}/requests`)).status === 401);
  reset();
  m.results['incident_reports.findOne'] = incident([1, 2, 99]);
  h.handler = () => [[reqRow(1, 'pending'), reqRow(2, 'matched', { match_id: 3, supply_id: 1, vehicle_id: 1, assigned_qty: 10, eta_minutes: 20, matched_at: 't' })]];
  let r = await call('GET', `/api/incidents/${iid}/requests`, null, T.field);
  check('incident requests 200', r.status === 200 && r.body.requests.length === 2, JSON.stringify(r.body));
  check('summary counts by status (zero-filled)', JSON.stringify(r.body.summary) === JSON.stringify({ total: 2, by_status: { pending: 1, matched: 1, delivered: 0, cancelled: 0 } }), JSON.stringify(r.body.summary));
  check('reports ids that no longer exist in MySQL', JSON.stringify(r.body.missing_request_ids) === '[99]', JSON.stringify(r.body));
  check('matched request has nested match', r.body.requests[1].match.match_id === 3 && r.body.requests[0].match === null);
  check('MySQL queried with the Mongo ids', h.calls[0].sql.includes('IN (?)') && JSON.stringify(h.calls[0].params) === '[[1,2,99]]', JSON.stringify(h.calls[0]));
  reset();
  m.results['incident_reports.findOne'] = incident([]);
  r = await call('GET', `/api/incidents/${iid}/requests`, null, T.field);
  check('incident with no links: empty result, MySQL not queried', r.status === 200 && r.body.requests.length === 0 && r.body.missing_request_ids.length === 0 && h.calls.length === 0, JSON.stringify(r.body));
  reset();
  check('incident requests: missing incident 404', (await call('GET', `/api/incidents/${iid}/requests`, null, T.field)).status === 404);
  check('incident requests: bad id 400', (await call('GET', '/api/incidents/abc/requests', null, T.field)).status === 400);

  // ===== incident -> nearest MySQL depots
  const depots = [{ depot_id: 1, name: 'Central', distance_km: 1.2 }, { depot_id: 4, name: 'East', distance_km: 3.4 }];
  reset();
  m.results['incident_reports.findOne'] = incident([]);
  h.handler = () => [depots];
  r = await call('GET', `/api/incidents/${iid}/nearest-depots`, null, T.logistics);
  check('nearest-depots 200', r.status === 200 && r.body.data.length === 2 && r.body.incident.latitude === 12.96 && r.body.incident.longitude === 77.6, JSON.stringify(r.body));
  check('Mongo [lng,lat] converted to (lat,lng) for MySQL, default limit 3', JSON.stringify(h.calls[0].params) === JSON.stringify([12.96, 77.6, 3]), JSON.stringify(h.calls[0].params));
  check('uses fn_distance_km, no stock join without resource_type', h.calls[0].sql.includes('fn_distance_km(?, ?, d.latitude, d.longitude)') && !h.calls[0].sql.includes('HAVING'));
  reset();
  m.results['incident_reports.findOne'] = incident([]);
  h.handler = () => [depots];
  await call('GET', `/api/incidents/${iid}/nearest-depots?resource_type=Water&min_quantity=50&limit=2`, null, T.logistics);
  check('resource filter: stock join + params order', JSON.stringify(h.calls[0].params) === JSON.stringify([12.96, 77.6, 'water', 50, 2]) && h.calls[0].sql.includes('HAVING SUM(quantity) >= ?'), JSON.stringify(h.calls[0]));
  check('nearest-depots bad min_quantity 400', (await call('GET', `/api/incidents/${iid}/nearest-depots?min_quantity=0`, null, T.field)).status === 400);
  reset();
  check('nearest-depots missing incident 404', (await call('GET', `/api/incidents/${iid}/nearest-depots`, null, T.field)).status === 404);

  // ===== nearest depots from a plain point
  reset(); h.handler = () => [depots];
  r = await call('GET', '/api/depots/nearest?lat=12.9&lng=77.5', null, T.field);
  check('depots/nearest 200 (not read as an :id)', r.status === 200 && r.body.data.length === 2 && JSON.stringify(h.calls[0].params) === JSON.stringify([12.9, 77.5, 3]), JSON.stringify(r.body));
  reset(); h.handler = () => [depots];
  await call('GET', '/api/depots/nearest?lat=12.9&lng=77.5&resource_type=medicine&min_quantity=5&limit=999', null, T.field);
  check('depots/nearest with stock filter, limit capped at 20', JSON.stringify(h.calls[0].params) === JSON.stringify([12.9, 77.5, 'medicine', 5, 20]), JSON.stringify(h.calls[0].params));
  check('depots/nearest missing lng 400', (await call('GET', '/api/depots/nearest?lat=12.9', null, T.field)).status === 400);
  check('depots/nearest lat 95 400', (await call('GET', '/api/depots/nearest?lat=95&lng=77', null, T.field)).status === 400);
  check('depots/nearest text lat 400', (await call('GET', '/api/depots/nearest?lat=north&lng=77', null, T.field)).status === 400);
  check('depots/nearest no token 401', (await call('GET', '/api/depots/nearest?lat=1&lng=1')).status === 401);

  // ===== request -> Mongo incidents that mention it
  reset();
  h.handler = () => [[reqRow(5, 'pending')]];
  m.results['incident_reports.find'] = [incident([5])];
  r = await call('GET', '/api/requests/5/incidents', null, T.field);
  const f = m.ops.find((o) => o.op === 'find' && o.coll === 'incident_reports');
  check('request incidents 200', r.status === 200 && r.body.request_id === 5 && r.body.incidents.length === 1 && r.body.incidents[0].latitude === 12.96, JSON.stringify(r.body));
  check('Mongo queried by related_request_ids, newest first', f.filter.related_request_ids === 5 && f.sort.created_at === -1, JSON.stringify(f));
  reset(); h.handler = () => [[]];
  check('request incidents: missing request 404', (await call('GET', '/api/requests/99/incidents', null, T.field)).status === 404);
  check('request incidents: bad id 400', (await call('GET', '/api/requests/abc/incidents', null, T.field)).status === 400);
});
