const express = require('express');
const pool = require('../db/mysql');
const HttpError = require('../utils/httpError');
const withMatchingLock = require('../utils/matchingLock');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parseId, queryEnum, queryText } = require('../utils/validate');
const { parsePagination, parseSort, paginated, filters } = require('../utils/query');

const router = express.Router();
router.use(requireAuth);

const MANAGERS = ['admin', 'logistics_manager'];

const SELECT = `
  SELECT m.match_id, m.request_id, r.resource_type, r.status AS request_status,
         v.name AS victim_name, v.priority AS victim_priority,
         m.supply_id, COALESCE(d.name, sh.name) AS supply_location,
         m.vehicle_id, m.assigned_qty, m.eta_minutes, m.matched_at
  FROM match_assignment m
  JOIN request r ON r.request_id = m.request_id
  JOIN victim v ON v.person_id = r.person_id
  JOIN supply s ON s.supply_id = m.supply_id
  LEFT JOIN depot d ON d.depot_id = s.depot_id
  LEFT JOIN shelter sh ON sh.shelter_id = s.shelter_id`;

const SORTS = {
  matched_at: 'm.matched_at',
  match_id: 'm.match_id',
  eta_minutes: 'm.eta_minutes',
  assigned_qty: 'm.assigned_qty',
};

async function findMatch(id, db = pool) {
  const [rows] = await db.query(`${SELECT} WHERE m.match_id = ?`, [id]);
  return rows[0];
}

// GET /api/matches?request_status=&resource_type=&request_id=&vehicle_id=&supply_id=&sort=&order=&page=&limit=
router.get('/', async (req, res) => {
  const requestStatus = queryEnum(req.query.request_status, 'request_status', ['matched', 'delivered']);
  const resourceType = queryText(req.query.resource_type, 'resource_type', 50);
  const ids = {};
  for (const key of ['request_id', 'vehicle_id', 'supply_id']) {
    if (req.query[key] !== undefined) ids[key] = parseId(req.query[key], key);
  }
  const orderBy = parseSort(req.query, SORTS, 'matched_at', 'desc');
  const paging = parsePagination(req.query);

  const f = filters();
  if (requestStatus) f.add('r.status = ?', requestStatus);
  if (resourceType) f.add('r.resource_type = ?', resourceType.toLowerCase());
  if (ids.request_id) f.add('m.request_id = ?', ids.request_id);
  if (ids.vehicle_id) f.add('m.vehicle_id = ?', ids.vehicle_id);
  if (ids.supply_id) f.add('m.supply_id = ?', ids.supply_id);

  const [[rows], [[count]]] = await Promise.all([
    pool.query(`${SELECT} ${f.sql()} ORDER BY ${orderBy}, m.match_id DESC LIMIT ? OFFSET ?`, [
      ...f.params,
      paging.limit,
      paging.offset,
    ]),
    pool.query(
      `SELECT COUNT(*) AS total FROM match_assignment m JOIN request r ON r.request_id = m.request_id ${f.sql()}`,
      f.params
    ),
  ]);
  res.json(paginated(rows, count.total, paging));
});

// POST /api/matches/run  (admin, logistics_manager)
// Runs sp_match_all_pending: critical/large-group requests first, nearest supply and
// vehicle. Requests that can't be matched (no stock or vehicle) simply stay pending.
router.post('/run', requireRole(...MANAGERS), async (req, res) => {
  const result = await withMatchingLock(async (conn) => {
    const [[before]] = await conn.query(
      `SELECT COUNT(*) AS pending,
              (SELECT COALESCE(MAX(match_id), 0) FROM match_assignment) AS last_match
       FROM request WHERE status = 'pending'`
    );

    await conn.query('CALL sp_match_all_pending()');

    const [assignments] = await conn.query(`${SELECT} WHERE m.match_id > ? ORDER BY m.match_id`, [before.last_match]);
    return {
      pending_before: before.pending,
      matched: assignments.length,
      still_pending: before.pending - assignments.length,
      assignments,
    };
  });
  res.json(result);
});

// GET /api/matches/:id
router.get('/:id', async (req, res) => {
  const match = await findMatch(parseId(req.params.id));
  if (!match) throw new HttpError(404, 'Match not found');
  res.json({ match });
});

// POST /api/matches/:id/complete  (admin, logistics_manager)
// Marks the delivery done via sp_complete_delivery: request -> delivered, vehicle -> available.
router.post('/:id/complete', requireRole(...MANAGERS), async (req, res) => {
  const id = parseId(req.params.id);

  const match = await withMatchingLock(async (conn) => {
    const existing = await findMatch(id, conn);
    if (!existing) throw new HttpError(404, 'Match not found');
    // Guard: completing twice could free a vehicle that has since been given another delivery.
    if (existing.request_status !== 'matched') {
      throw new HttpError(409, `Delivery cannot be completed (request status: ${existing.request_status})`);
    }
    await conn.query('CALL sp_complete_delivery(?)', [id]);
    return findMatch(id, conn);
  });
  res.json({ match });
});

module.exports = router;
