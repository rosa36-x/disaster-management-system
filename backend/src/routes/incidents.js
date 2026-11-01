const express = require('express');
const pool = require('../db/mysql');
const { getMongoDb } = require('../db/mongo');
const HttpError = require('../utils/httpError');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  parseId, parseObjectId, queryEnum, queryText, queryNumber, escapeRegex, validateBody,
} = require('../utils/validate');
const { parsePagination, paginated } = require('../utils/query');
const { toApi } = require('../utils/mongo');
const { SEVERITIES } = require('../db/mongoSchema');

const router = express.Router();
router.use(requireAuth);

const WRITERS = ['admin', 'field_worker'];

const incidents = () => getMongoDb().collection('incident_reports');
const fieldUpdates = () => getMongoDb().collection('field_updates');

const createSchema = {
  title: { type: 'string', minLength: 3, max: 200, required: true },
  disaster_type: { type: 'string', minLength: 2, max: 50, required: true },
  severity: { type: 'enum', values: SEVERITIES, required: true },
  // The API takes plain latitude/longitude and builds the GeoJSON [lng, lat] point,
  // so clients can't get the coordinate order wrong.
  latitude: { type: 'number', min: -90, max: 90, required: true },
  longitude: { type: 'number', min: -180, max: 180, required: true },
  description: { type: 'string', max: 5000, required: true },
  related_request_ids: { type: 'intArray', maxItems: 100 },
};
const updateSchema = {
  title: createSchema.title,
  disaster_type: createSchema.disaster_type,
  severity: createSchema.severity,
  description: createSchema.description,
  related_request_ids: createSchema.related_request_ids,
};

const updateNoteSchema = {
  situation: { type: 'string', max: 2000, required: true },
  damage_observed: { type: 'string', max: 2000 },
  additional_requirements: { type: 'stringArray', maxItems: 20, maxLength: 50 },
};

const sortDirection = (query) => {
  const order = query.order === undefined ? 'desc' : query.order;
  if (order !== 'asc' && order !== 'desc') throw new HttpError(400, 'order must be asc or desc');
  return order === 'asc' ? 1 : -1;
};

// MongoDB can't enforce foreign keys, so the API checks that every linked request
// really exists in MySQL before saving the incident.
async function assertRequestsExist(ids) {
  if (!ids || ids.length === 0) return;
  const [rows] = await pool.query('SELECT request_id FROM request WHERE request_id IN (?)', [ids]);
  const found = new Set(rows.map((r) => r.request_id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) throw new HttpError(400, `Unknown request_id(s): ${missing.join(', ')}`);
}

async function mustFindIncident(oid) {
  const incident = await incidents().findOne({ _id: oid });
  if (!incident) throw new HttpError(404, 'Incident not found');
  return incident;
}

// GET /api/incidents/stats -> counts by severity and by disaster type ($facet aggregation)
router.get('/stats', async (req, res) => {
  const [facet] = await incidents()
    .aggregate([
      {
        $facet: {
          by_severity: [{ $group: { _id: '$severity', count: { $sum: 1 } } }],
          by_type: [{ $group: { _id: '$disaster_type', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }],
          total: [{ $count: 'count' }],
        },
      },
    ])
    .toArray();

  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const row of facet.by_severity) bySeverity[row._id] = row.count;

  res.json({
    total: facet.total.length ? facet.total[0].count : 0,
    by_severity: bySeverity,
    by_type: facet.by_type.map((row) => ({ disaster_type: row._id, count: row.count })),
  });
});

// GET /api/incidents/nearby?lat=&lng=&radius_km=10&severity=&limit=20
// Nearest incidents first, using the 2dsphere index ($geoNear).
router.get('/nearby', async (req, res) => {
  const lat = queryNumber(req.query.lat, 'lat', { min: -90, max: 90, required: true });
  const lng = queryNumber(req.query.lng, 'lng', { min: -180, max: 180, required: true });
  const radiusKm = queryNumber(req.query.radius_km, 'radius_km', { min: 0.1, max: 500 }) ?? 10;
  const severity = queryEnum(req.query.severity, 'severity', SEVERITIES);
  const { limit } = parsePagination({ limit: req.query.limit }, { defaultLimit: 20, maxLimit: 100 });

  const geoNear = {
    near: { type: 'Point', coordinates: [lng, lat] }, // GeoJSON order: longitude first
    distanceField: 'distance_m',
    maxDistance: radiusKm * 1000,
    spherical: true,
  };
  if (severity) geoNear.query = { severity };

  const rows = await incidents().aggregate([{ $geoNear: geoNear }, { $limit: limit }]).toArray();
  res.json({
    data: rows.map((doc) => ({ ...toApi(doc), distance_km: Math.round(doc.distance_m / 10) / 100 })),
  });
});

// GET /api/incidents?severity=&disaster_type=&search=&request_id=&order=&page=&limit=
router.get('/', async (req, res) => {
  const severity = queryEnum(req.query.severity, 'severity', SEVERITIES);
  const type = queryText(req.query.disaster_type, 'disaster_type', 50);
  const search = queryText(req.query.search, 'search');
  const requestId = req.query.request_id === undefined ? undefined : parseId(req.query.request_id, 'request_id');
  const direction = sortDirection(req.query);
  const paging = parsePagination(req.query);

  const filter = {};
  if (severity) filter.severity = severity;
  if (type) filter.disaster_type = { $regex: `^${escapeRegex(type)}$`, $options: 'i' };
  if (requestId) filter.related_request_ids = requestId; // matches if the array contains it
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ title: rx }, { description: rx }];
  }

  const [rows, total] = await Promise.all([
    incidents()
      .find(filter)
      .sort({ created_at: direction, _id: direction })
      .skip(paging.offset)
      .limit(paging.limit)
      .toArray(),
    incidents().countDocuments(filter),
  ]);
  res.json(paginated(rows.map(toApi), total, paging));
});

// GET /api/incidents/:id -> the incident plus its field updates (newest first)
router.get('/:id', async (req, res) => {
  const oid = parseObjectId(req.params.id);
  const incident = await mustFindIncident(oid);
  const updates = await fieldUpdates().find({ incident_report_id: oid }).sort({ created_at: -1 }).toArray();
  res.json({ incident: { ...toApi(incident), field_updates: updates.map(toApi) } });
});

// POST /api/incidents  (admin, field_worker). reported_by comes from the login token.
router.post('/', requireRole(...WRITERS), async (req, res) => {
  const { latitude, longitude, ...data } = validateBody(req.body, createSchema);
  await assertRequestsExist(data.related_request_ids);

  const doc = {
    ...data,
    location: { type: 'Point', coordinates: [longitude, latitude] },
    related_request_ids: data.related_request_ids || [],
    reported_by: req.user.username,
    reported_by_user_id: Number(req.user.id),
    created_at: new Date(),
  };
  await incidents().insertOne(doc); // adds doc._id
  res.status(201).json({ incident: toApi(doc) });
});

// PATCH /api/incidents/:id  (admin, field_worker)
router.patch('/:id', requireRole(...WRITERS), async (req, res) => {
  const oid = parseObjectId(req.params.id);
  const data = validateBody(req.body, updateSchema, { partial: true });
  await assertRequestsExist(data.related_request_ids);

  const result = await incidents().updateOne({ _id: oid }, { $set: { ...data, updated_at: new Date() } });
  if (result.matchedCount === 0) throw new HttpError(404, 'Incident not found');
  res.json({ incident: toApi(await incidents().findOne({ _id: oid })) });
});

// DELETE /api/incidents/:id  (admin). Refused while field updates still point at it,
// the same way MySQL refuses to delete a row that other rows reference.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const oid = parseObjectId(req.params.id);
  if ((await fieldUpdates().countDocuments({ incident_report_id: oid })) > 0) {
    throw new HttpError(409, 'Incident still has field updates');
  }
  const result = await incidents().deleteOne({ _id: oid });
  if (result.deletedCount === 0) throw new HttpError(404, 'Incident not found');
  res.status(204).end();
});

// GET /api/incidents/:id/updates?page=&limit=
router.get('/:id/updates', async (req, res) => {
  const oid = parseObjectId(req.params.id);
  await mustFindIncident(oid);
  const paging = parsePagination(req.query);

  const [rows, total] = await Promise.all([
    fieldUpdates().find({ incident_report_id: oid }).sort({ created_at: -1, _id: -1 }).skip(paging.offset).limit(paging.limit).toArray(),
    fieldUpdates().countDocuments({ incident_report_id: oid }),
  ]);
  res.json(paginated(rows.map(toApi), total, paging));
});

// POST /api/incidents/:id/updates  (admin, field_worker). worker_name comes from the token.
router.post('/:id/updates', requireRole(...WRITERS), async (req, res) => {
  const oid = parseObjectId(req.params.id);
  const data = validateBody(req.body, updateNoteSchema);
  await mustFindIncident(oid);

  const doc = {
    incident_report_id: oid,
    worker_name: req.user.username,
    worker_user_id: Number(req.user.id),
    ...data,
    additional_requirements: data.additional_requirements || [],
    created_at: new Date(),
  };
  await fieldUpdates().insertOne(doc);
  res.status(201).json({ field_update: toApi(doc) });
});

module.exports = router;
