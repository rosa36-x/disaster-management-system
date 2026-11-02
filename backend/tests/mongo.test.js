const path = require('path');
const h = require('./helpers/harness');
const { ObjectId } = require('mongodb');
const m = h.mongo;
const { T } = h;
const { incidentValidator, fieldUpdateValidator } = require(path.join(__dirname, '..', 'src/db/mongoSchema.js'));

// ---------- minimal evaluator for the $jsonSchema subset we use (approximates MongoDB's semantics)
function typesOf(v) {
  if (v instanceof Date) return ['date'];
  if (v instanceof ObjectId) return ['objectId'];
  if (typeof v === 'string') return ['string'];
  if (typeof v === 'boolean') return ['bool'];
  if (v === null) return ['null'];
  if (typeof v === 'number') return Number.isInteger(v) ? ['int', 'long', 'double', 'number'] : ['double', 'number'];
  if (Array.isArray(v)) return ['array'];
  return ['object'];
}
function validate(schema, v, at = '$') {
  const errs = [];
  if (schema.bsonType) {
    const want = [].concat(schema.bsonType);
    if (!typesOf(v).some((t) => want.includes(t))) return [`${at}: expected ${want} got ${typesOf(v)[0]}`];
  }
  if (schema.enum && !schema.enum.includes(v)) errs.push(`${at}: not in enum`);
  if (typeof v === 'string') {
    if (schema.minLength !== undefined && v.length < schema.minLength) errs.push(`${at}: too short`);
    if (schema.maxLength !== undefined && v.length > schema.maxLength) errs.push(`${at}: too long`);
  }
  if (typeof v === 'number') {
    if (schema.minimum !== undefined && v < schema.minimum) errs.push(`${at}: below minimum`);
    if (schema.maximum !== undefined && v > schema.maximum) errs.push(`${at}: above maximum`);
  }
  if (Array.isArray(v)) {
    if (schema.minItems !== undefined && v.length < schema.minItems) errs.push(`${at}: too few items`);
    if (schema.maxItems !== undefined && v.length > schema.maxItems) errs.push(`${at}: too many items`);
    if (schema.uniqueItems && new Set(v).size !== v.length) errs.push(`${at}: duplicates`);
    if (schema.items) v.forEach((x, i) => errs.push(...validate(Array.isArray(schema.items) ? schema.items[i] || {} : schema.items, x, `${at}[${i}]`)));
  }
  if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof ObjectId)) {
    for (const k of schema.required || []) if (!(k in v)) errs.push(`${at}.${k}: required`);
    for (const [k, sub] of Object.entries(schema.properties || {})) if (k in v) errs.push(...validate(sub, v[k], `${at}.${k}`));
  }
  return errs;
}
const inc = (doc) => validate(incidentValidator.$jsonSchema, doc);
const upd = (doc) => validate(fieldUpdateValidator.$jsonSchema, doc);

h.start(4106, async (call, check) => {
  const reset = () => { m.ops.length = 0; m.results = {}; };
  const lastOp = (op, coll) => [...m.ops].reverse().find((o) => o.op === op && (!coll || o.coll === coll));
  const oid = () => new ObjectId();

  // ===== A. validator schema vs. your real seed documents and API-built documents
  const now = new Date();
  const seedIncident = { title: 'Flood in residential area', disaster_type: 'Flood', severity: 'critical', location: { type: 'Point', coordinates: [77.602, 12.962] }, description: 'Several houses are submerged and residents need immediate assistance.', related_request_ids: [1, 2], reported_by: 'Admin', created_at: now };
  const seedUpdate = { incident_title: 'Flood in residential area', incident_report_index: 1, worker_name: 'Relief Worker 1', situation: 'Water levels are rising.', damage_observed: 'Multiple houses are submerged.', additional_requirements: ['Drinking water', 'Food', 'Medicine'], created_at: now, incident_report_id: oid() };
  check('seed incident passes validator', inc(seedIncident).length === 0, inc(seedIncident).join('; '));
  check('seed field update passes validator', upd(seedUpdate).length === 0, upd(seedUpdate).join('; '));
  check('validator rejects bad severity', inc({ ...seedIncident, severity: 'extreme' }).length > 0);
  check('validator rejects missing location', inc({ ...seedIncident, location: undefined, ...{} }) .length >= 0 && inc((({ location, ...r }) => r)(seedIncident)).length > 0);
  check('validator rejects lat 91 (coords [lng,lat])', inc({ ...seedIncident, location: { type: 'Point', coordinates: [77.6, 91] } }).length > 0);
  check('validator rejects swapped lng/lat out of range', inc({ ...seedIncident, location: { type: 'Point', coordinates: [12.9, 177.6] } }).length > 0);
  check('validator rejects duplicate request ids', inc({ ...seedIncident, related_request_ids: [1, 1] }).length > 0);
  check('validator rejects date as string', inc({ ...seedIncident, created_at: '2026-11-01' }).length > 0);
  check('validator rejects update without incident_report_id', upd((({ incident_report_id, ...r }) => r)(seedUpdate)).length > 0);
  check('validator rejects non-string requirement', upd({ ...seedUpdate, additional_requirements: [5] }).length > 0);

  // ===== B. incidents: create
  const good = { title: 'Bridge collapse', disaster_type: 'Flood', severity: 'high', latitude: 12.97, longitude: 77.59, description: 'Main bridge down', related_request_ids: [1, 2] };
  h.handler = (sql, params) => [[...(params[0] || [])].filter((id) => id !== 99).map((id) => ({ request_id: id }))];
  check('incidents no token 401', (await call('GET', '/api/incidents')).status === 401);
  check('create as logistics 403', (await call('POST', '/api/incidents', good, T.logistics)).status === 403);
  reset();
  let r = await call('POST', '/api/incidents', good, T.field);
  const doc = lastOp('insertOne', 'incident_reports')?.doc;
  check('create 201', r.status === 201 && r.body.incident.id && r.body.incident.latitude === 12.97, JSON.stringify(r.body));
  check('GeoJSON stored as [lng, lat]', JSON.stringify(doc.location) === JSON.stringify({ type: 'Point', coordinates: [77.59, 12.97] }), JSON.stringify(doc.location));
  check('reported_by from token, not client', doc.reported_by === 'field_worker' && doc.reported_by_user_id === 3);
  check('created_at is a Date', doc.created_at instanceof Date);
  check('API-built incident passes validator', inc(doc).length === 0, inc(doc).join('; '));
  reset();
  await call('POST', '/api/incidents', { ...good, related_request_ids: undefined }, T.admin);
  check('related_request_ids defaults to []', JSON.stringify(lastOp('insertOne').doc.related_request_ids) === '[]');
  r = await call('POST', '/api/incidents', { ...good, related_request_ids: [1, 99] }, T.admin);
  check('unknown MySQL request id -> 400', r.status === 400 && /99/.test(r.body.error), JSON.stringify(r.body));
  check('MySQL IN check params', JSON.stringify(h.calls[h.calls.length - 1].params) === '[[1,99]]');
  for (const [name, body] of [['lat 100', { ...good, latitude: 100 }], ['missing title', { ...good, title: undefined }], ['title 2 chars', { ...good, title: 'ab' }],
    ['bad severity', { ...good, severity: 'extreme' }], ['client sets reported_by', { ...good, reported_by: 'Mallory' }], ['request id 0', { ...good, related_request_ids: [0] }],
    ['request ids not array', { ...good, related_request_ids: 5 }], ['lng 181', { ...good, longitude: 181 }], ['latitude string', { ...good, latitude: '12' }]])
    check('create invalid: ' + name + ' 400', (await call('POST', '/api/incidents', body, T.admin)).status === 400);

  // ===== C. incidents: list / get / patch / delete
  reset(); m.results['incident_reports.find'] = [{ _id: oid(), title: 'x', location: { type: 'Point', coordinates: [77.5, 12.9] } }]; m.results['incident_reports.count'] = 45;
  r = await call('GET', '/api/incidents?severity=high&disaster_type=Fl.ood&search=a(b&request_id=4&page=2&limit=5&order=asc', null, T.field);
  const f = lastOp('find', 'incident_reports');
  check('list 200 + shape', r.status === 200 && r.body.pagination.total === 45 && r.body.data[0].latitude === 12.9 && r.body.data[0].id);
  check('list filter: severity + request_id array match', f.filter.severity === 'high' && f.filter.related_request_ids === 4, JSON.stringify(f.filter));
  check('list filter: type regex escaped, case-insensitive', f.filter.disaster_type.$regex === '^Fl\\.ood$' && f.filter.disaster_type.$options === 'i', JSON.stringify(f.filter.disaster_type));
  check('list filter: search escaped, in title/description', f.filter.$or.length === 2 && f.filter.$or[0].title.$regex === 'a\\(b', JSON.stringify(f.filter.$or));
  check('list paging + sort', f.skip === 5 && f.limit === 5 && f.sort.created_at === 1, JSON.stringify(f));
  check('list bad severity 400', (await call('GET', '/api/incidents?severity=urgent', null, T.field)).status === 400);
  check('list bad order 400', (await call('GET', '/api/incidents?order=up', null, T.field)).status === 400);
  reset();
  r = await call('GET', '/api/incidents?severity[$ne]=x', null, T.field);
  check('operator injection via severity[$ne] never reaches the query', r.status === 200 && !('severity' in lastOp('find', 'incident_reports').filter) && !JSON.stringify(lastOp('find', 'incident_reports').filter).includes('$ne'), JSON.stringify(lastOp('find', 'incident_reports').filter));
  check('repeated param (array) rejected 400', (await call('GET', '/api/incidents?severity=high&severity=low', null, T.field)).status === 400);
  check('get bad id 400', (await call('GET', '/api/incidents/abc', null, T.field)).status === 400);
  check('get 12-char string id 400', (await call('GET', '/api/incidents/abcdefghijkl', null, T.field)).status === 400);
  reset();
  check('get missing 404', (await call('GET', '/api/incidents/' + oid(), null, T.field)).status === 404);
  const iid = oid();
  m.results['incident_reports.findOne'] = { _id: iid, title: 'x', location: { type: 'Point', coordinates: [1, 2] } };
  m.results['field_updates.find'] = [{ _id: oid(), incident_report_id: iid, situation: 's' }];
  r = await call('GET', '/api/incidents/' + iid, null, T.field);
  check('get one includes field_updates', r.status === 200 && r.body.incident.field_updates.length === 1 && typeof r.body.incident.field_updates[0].incident_report_id === 'string', JSON.stringify(r.body));
  check('patch empty 400', (await call('PATCH', '/api/incidents/' + iid, {}, T.admin)).status === 400);
  check('patch location not allowed 400', (await call('PATCH', '/api/incidents/' + iid, { latitude: 1 }, T.admin)).status === 400);
  reset(); m.results['incident_reports.findOne'] = { _id: iid, title: 'x' };
  r = await call('PATCH', '/api/incidents/' + iid, { severity: 'low' }, T.field);
  const up = lastOp('updateOne');
  check('patch 200, $set + updated_at', r.status === 200 && up.update.$set.severity === 'low' && up.update.$set.updated_at instanceof Date, JSON.stringify(up));
  m.results['incident_reports.updateOne'] = { matchedCount: 0 };
  check('patch missing 404', (await call('PATCH', '/api/incidents/' + iid, { severity: 'low' }, T.admin)).status === 404);
  reset(); m.results['field_updates.count'] = 2;
  check('delete with updates 409', (await call('DELETE', '/api/incidents/' + iid, null, T.admin)).status === 409);
  check('delete as field_worker 403', (await call('DELETE', '/api/incidents/' + iid, null, T.field)).status === 403);
  reset(); check('delete 204', (await call('DELETE', '/api/incidents/' + iid, null, T.admin)).status === 204);
  m.results['incident_reports.deleteOne'] = { deletedCount: 0 };
  check('delete missing 404', (await call('DELETE', '/api/incidents/' + iid, null, T.admin)).status === 404);

  // ===== D. nearby ($geoNear) + stats ($facet)
  reset(); m.results['incident_reports.aggregate'] = [{ _id: oid(), title: 'x', location: { type: 'Point', coordinates: [77.6, 12.9] }, distance_m: 1234.5 }];
  r = await call('GET', '/api/incidents/nearby?lat=12.96&lng=77.6&radius_km=5&severity=critical&limit=3', null, T.field);
  const gn = lastOp('aggregate').pipeline;
  check('nearby 200 + distance_km', r.status === 200 && r.body.data[0].distance_km === 1.23, JSON.stringify(r.body));
  check('$geoNear is first stage, [lng,lat], meters, spherical', gn[0].$geoNear && JSON.stringify(gn[0].$geoNear.near.coordinates) === '[77.6,12.96]' && gn[0].$geoNear.maxDistance === 5000 && gn[0].$geoNear.spherical === true, JSON.stringify(gn[0]));
  check('nearby severity filter + limit', gn[0].$geoNear.query.severity === 'critical' && gn[1].$limit === 3);
  reset(); await call('GET', '/api/incidents/nearby?lat=12.96&lng=77.6', null, T.field);
  check('nearby default radius 10 km', lastOp('aggregate').pipeline[0].$geoNear.maxDistance === 10000);
  check('nearby missing lat 400', (await call('GET', '/api/incidents/nearby?lng=77.6', null, T.field)).status === 400);
  check('nearby lat 95 400', (await call('GET', '/api/incidents/nearby?lat=95&lng=77', null, T.field)).status === 400);
  check('nearby lat abc 400', (await call('GET', '/api/incidents/nearby?lat=abc&lng=77', null, T.field)).status === 400);
  check('nearby radius 9999 400', (await call('GET', '/api/incidents/nearby?lat=1&lng=1&radius_km=9999', null, T.field)).status === 400);
  reset(); m.results['incident_reports.aggregate'] = [{ by_severity: [{ _id: 'critical', count: 2 }, { _id: 'low', count: 1 }], by_type: [{ _id: 'Flood', count: 2 }, { _id: 'Drought', count: 1 }], total: [{ count: 3 }] }];
  r = await call('GET', '/api/incidents/stats', null, T.field);
  check('stats shape + zero-filled severities', r.status === 200 && JSON.stringify(r.body.by_severity) === JSON.stringify({ critical: 2, high: 0, medium: 0, low: 1 }) && r.body.total === 3 && r.body.by_type[0].disaster_type === 'Flood', JSON.stringify(r.body));
  m.results['incident_reports.aggregate'] = [{ by_severity: [], by_type: [], total: [] }];
  r = await call('GET', '/api/incidents/stats', null, T.field);
  check('stats on empty collection', r.status === 200 && r.body.total === 0);

  // ===== E. field updates
  const note = { situation: 'Water rising', damage_observed: 'Houses flooded', additional_requirements: [' Drinking water ', 'Food', 'food'] };
  reset(); m.results['incident_reports.findOne'] = { _id: iid };
  check('add update as logistics 403', (await call('POST', `/api/incidents/${iid}/updates`, note, T.logistics)).status === 403);
  r = await call('POST', `/api/incidents/${iid}/updates`, note, T.field);
  const nd = lastOp('insertOne', 'field_updates')?.doc;
  check('add update 201', r.status === 201 && r.body.field_update.incident_report_id === String(iid), JSON.stringify(r.body));
  check('update: worker from token, ObjectId link, trimmed unique requirements', nd.worker_name === 'field_worker' && nd.incident_report_id instanceof ObjectId && JSON.stringify(nd.additional_requirements) === JSON.stringify(['Drinking water', 'Food', 'food']), JSON.stringify(nd));
  check('API-built field update passes validator', upd(nd).length === 0, upd(nd).join('; '));
  reset(); m.results['incident_reports.findOne'] = { _id: iid }; await call('POST', `/api/incidents/${iid}/updates`, { situation: 'ok' }, T.admin);
  check('update without optional fields: requirements default []', JSON.stringify(lastOp('insertOne', 'field_updates').doc.additional_requirements) === '[]' && !('damage_observed' in lastOp('insertOne', 'field_updates').doc));
  reset();
  check('add update to missing incident 404', (await call('POST', `/api/incidents/${iid}/updates`, note, T.admin)).status === 404);
  m.results['incident_reports.findOne'] = { _id: iid };
  for (const [name, body] of [['no situation', {}], ['empty situation', { situation: ' ' }], ['requirements not array', { situation: 's', additional_requirements: 'water' }], ['requirement empty string', { situation: 's', additional_requirements: [''] }], ['21 requirements', { situation: 's', additional_requirements: Array.from({ length: 21 }, (_, i) => 'r' + i) }], ['unknown field worker_name', { situation: 's', worker_name: 'Mallory' }]])
    check('add update invalid: ' + name + ' 400', (await call('POST', `/api/incidents/${iid}/updates`, body, T.admin)).status === 400);
  reset(); m.results['incident_reports.findOne'] = { _id: iid }; m.results['field_updates.find'] = [{ _id: oid(), incident_report_id: iid }]; m.results['field_updates.count'] = 7;
  r = await call('GET', `/api/incidents/${iid}/updates?page=2&limit=3`, null, T.field);
  const lf = lastOp('find', 'field_updates');
  check('list updates paged', r.status === 200 && r.body.pagination.total === 7 && lf.skip === 3 && lf.limit === 3 && lf.sort.created_at === -1);

  // global field updates
  reset(); m.results['field_updates.find'] = [{ _id: oid(), incident_report_id: iid }]; m.results['field_updates.count'] = 1;
  r = await call('GET', `/api/field-updates?requirement=Drinking%20water&worker=field_worker&incident_id=${iid}`, null, T.field);
  const gf = lastOp('find', 'field_updates').filter;
  check('field-updates filters', r.status === 200 && gf.additional_requirements.$regex === '^Drinking water$' && gf.worker_name === 'field_worker' && gf.incident_report_id instanceof ObjectId, JSON.stringify(gf));
  check('field-updates bad incident_id 400', (await call('GET', '/api/field-updates?incident_id=zzz', null, T.field)).status === 400);
  reset(); m.results['field_updates.aggregate'] = [{ requirement: 'drinking water', mentions: 5, incidents: 3 }];
  r = await call('GET', '/api/field-updates/requirements?limit=4', null, T.field);
  const pl = lastOp('aggregate').pipeline;
  check('requirements aggregation', r.status === 200 && r.body.data[0].mentions === 5 && pl[0].$unwind === '$additional_requirements' && pl[1].$group._id.$toLower && pl[pl.length - 1].$limit === 4, JSON.stringify(pl));
  reset(); m.results['field_updates.findOne'] = { _id: iid, incident_report_id: iid };
  check('field-update get one', (await call('GET', '/api/field-updates/' + iid, null, T.field)).status === 200);
  m.results['field_updates.findOne'] = null;
  check('field-update missing 404', (await call('GET', '/api/field-updates/' + iid, null, T.field)).status === 404);

  // ===== F. Mongo error mapping
  reset(); m.results['incident_reports.insertOne'] = () => { const e = new Error('Document failed validation'); e.code = 121; throw e; };
  r = await call('POST', '/api/incidents', { ...good, related_request_ids: [1] }, T.admin);
  check('Mongo validation error (121) -> 400', r.status === 400 && /validation/.test(r.body.error), JSON.stringify(r.body));
  m.results['incident_reports.insertOne'] = () => { const e = new Error('dup key: secret_index'); e.code = 11000; throw e; };
  r = await call('POST', '/api/incidents', { ...good, related_request_ids: [1] }, T.admin);
  check('Mongo duplicate key (11000) -> 409, no leak', r.status === 409 && !JSON.stringify(r.body).includes('secret'), JSON.stringify(r.body));
});
