const express = require('express');
const pool = require('../db/mysql');
const HttpError = require('../utils/httpError');
const withMatchingLock = require('../utils/matchingLock');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parseId, queryEnum, queryText, escapeLike, validateBody } = require('../utils/validate');
const { parsePagination, parseSort, paginated } = require('../utils/query');
const { REQUEST_SELECT: SELECT, shapeRequest: shape } = require('../utils/requestQuery');
const { getMongoDb } = require('../db/mongo');
const { toApi } = require('../utils/mongo');

const router = express.Router();
router.use(requireAuth);

const STATUSES = ['pending', 'matched', 'delivered', 'cancelled'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];

// Only creation fields are accepted. status is never set by the client: it moves
// pending -> matched -> delivered through the matching procedures (step 5), and
// pending -> cancelled through the cancel endpoint below.
const requestSchema = {
  person_id: { type: 'int', min: 1, required: true },
  resource_type: { type: 'string', max: 50, lowercase: true, required: true },
  quantity: { type: 'int', min: 1, max: 1000000, required: true },
  description: { type: 'string', max: 5000, nullable: true },
};

// Optional body for POST /:id/match: serve the request from one chosen depot.
const matchSchema = {
  depot_id: { type: 'int', min: 1 },
};

const SORTS = {
  requested_at: 'r.requested_at',
  request_id: 'r.request_id',
  quantity: 'r.quantity',
  status: 'r.status',
  victim_priority: 'v.priority',
};

async function findRequest(id) {
  const [rows] = await pool.query(`${SELECT} WHERE r.request_id = ?`, [id]);
  return rows[0] ? shape(rows[0]) : undefined;
}

// Matching serves a request from ONE supply row (depot or shelter), so that is what we compare with.
// Returns a message when no single supply holds enough, otherwise undefined.
async function stockWarning(resourceType, quantity) {
  const [[row]] = await pool.query(
    'SELECT COALESCE(MAX(quantity), 0) AS largest FROM supply WHERE resource_type = ?',
    [resourceType]
  );
  if (row.largest >= quantity) return undefined;
  return `No single supply currently holds ${quantity} ${resourceType} (largest: ${row.largest}); the request stays pending until stock is added`;
}

// GET /api/requests?status=&resource_type=&priority=&person_id=&search=&sort=&order=&page=&limit=
router.get('/', async (req, res) => {
  const status = queryEnum(req.query.status, 'status', STATUSES);
  const priority = queryEnum(req.query.priority, 'priority', PRIORITIES);
  const resourceType = queryText(req.query.resource_type, 'resource_type', 50);
  const personId = req.query.person_id === undefined ? undefined : parseId(req.query.person_id, 'person_id');
  const search = queryText(req.query.search, 'search');
  const orderBy = parseSort(req.query, SORTS, 'requested_at');
  const paging = parsePagination(req.query);

  const where = [];
  const params = [];
  if (status) {
    where.push('r.status = ?');
    params.push(status);
  }
  if (priority) {
    where.push('v.priority = ?');
    params.push(priority);
  }
  if (resourceType) {
    where.push('r.resource_type = ?');
    params.push(resourceType.toLowerCase());
  }
  if (personId) {
    where.push('r.person_id = ?');
    params.push(personId);
  }
  if (search) {
    where.push('(r.description LIKE ? OR v.name LIKE ?)');
    const like = `%${escapeLike(search)}%`;
    params.push(like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[rows], [[count]]] = await Promise.all([
    pool.query(
      `${SELECT} ${whereSql} ORDER BY ${orderBy}, r.request_id DESC LIMIT ? OFFSET ?`,
      [...params, paging.limit, paging.offset]
    ),
    pool.query(
      `SELECT COUNT(*) AS total FROM request r JOIN victim v ON v.person_id = r.person_id ${whereSql}`,
      params
    ),
  ]);

  res.json(paginated(rows.map(shape), count.total, paging));
});

// GET /api/requests/:id
router.get('/:id', async (req, res) => {
  const request = await findRequest(parseId(req.params.id));
  if (!request) throw new HttpError(404, 'Request not found');
  res.json({ request });
});

// POST /api/requests  (admin, field_worker). The DB trigger logs it in request_history.
router.post('/', requireRole('admin', 'field_worker'), async (req, res) => {
  const data = validateBody(req.body, requestSchema);
  const columns = Object.keys(data);

  // A non-existent person_id is rejected by the foreign key and mapped to a 400.
  const [result] = await pool.query(
    `INSERT INTO request (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((c) => data[c])
  );

  // The request is still accepted (stock may arrive later), but the caller is told if it can't be served now.
  const warning = await stockWarning(data.resource_type, data.quantity);
  res.status(201).json({ request: await findRequest(result.insertId), ...(warning && { warning }) });
});

// PATCH /api/requests/:id/cancel  (admin, field_worker). Only pending requests:
// a matched request has already reserved supply and a vehicle.
router.patch('/:id/cancel', requireRole('admin', 'field_worker'), async (req, res) => {
  const id = parseId(req.params.id);

  // The status check is part of the UPDATE itself, so two clients racing
  // (e.g. cancel vs. match) can't both win.
  const [result] = await pool.query(
    "UPDATE request SET status = 'cancelled' WHERE request_id = ? AND status = 'pending'",
    [id]
  );

  const request = await findRequest(id);
  if (!request) throw new HttpError(404, 'Request not found');
  if (result.affectedRows === 0) {
    throw new HttpError(409, `Only pending requests can be cancelled (current status: ${request.status})`);
  }
  res.json({ request });
});

// GET /api/requests/:id/history -> status changes recorded by the request triggers
router.get('/:id/history', async (req, res) => {
  const id = parseId(req.params.id);
  if (!(await findRequest(id))) throw new HttpError(404, 'Request not found');

  const [history] = await pool.query(
    'SELECT history_id, old_status, new_status, changed_at FROM request_history WHERE request_id = ? ORDER BY changed_at, history_id',
    [id]
  );
  res.json({ request_id: id, history });
});

// POST /api/requests/:id/match  (admin, logistics_manager)  body (optional): { depot_id }
// Without depot_id: sp_match_request picks the nearest supply (depot or shelter) with enough
// stock and the nearest free vehicle. With depot_id: sp_match_request_at_depot serves it from
// that depot only. Either way the procedure's message comes back as a 409 and nothing changes,
// e.g. "No supply available" or "Insufficient supply at depot: requested 500, available 120".
router.post('/:id/match', requireRole('admin', 'logistics_manager'), async (req, res) => {
  const id = parseId(req.params.id);
  const { depot_id: depotId } = validateBody(req.body ?? {}, matchSchema);
  if (!(await findRequest(id))) throw new HttpError(404, 'Request not found');

  if (depotId === undefined) {
    await withMatchingLock((conn) => conn.query('CALL sp_match_request(?)', [id]));
  } else {
    const [depots] = await pool.query('SELECT depot_id FROM depot WHERE depot_id = ?', [depotId]);
    if (depots.length === 0) throw new HttpError(404, 'Depot not found');
    await withMatchingLock((conn) => conn.query('CALL sp_match_request_at_depot(?, ?)', [id, depotId]));
  }
  res.json({ request: await findRequest(id) });
});

// GET /api/requests/:id/incidents -> MongoDB incident reports that reference this request
router.get('/:id/incidents', async (req, res) => {
  const id = parseId(req.params.id);
  if (!(await findRequest(id))) throw new HttpError(404, 'Request not found');

  const incidents = await getMongoDb()
    .collection('incident_reports')
    .find({ related_request_ids: id })
    .sort({ created_at: -1 })
    .toArray();
  res.json({ request_id: id, incidents: incidents.map(toApi) });
});

module.exports = router;
