const express = require('express');
const pool = require('../db/mysql');
const HttpError = require('../utils/httpError');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parseId, queryEnum, validateBody } = require('../utils/validate');
const { parsePagination, parseSort, paginated, filters } = require('../utils/query');
const { insertRow, updateRow } = require('../utils/sql');

const router = express.Router();
router.use(requireAuth);

const MANAGERS = ['admin', 'logistics_manager'];
const STATUSES = ['open', 'blocked'];

// distance_km is DECIMAL(6,2): at most 9999.99.
const createSchema = {
  depot_id: { type: 'int', min: 1, required: true },
  shelter_id: { type: 'int', min: 1, required: true },
  distance_km: { type: 'number', min: 0, max: 9999.99 },
  status: { type: 'enum', values: STATUSES },
};
// After creation only distance and status change (e.g. a road gets blocked).
const updateSchema = { distance_km: createSchema.distance_km, status: createSchema.status };

const SELECT = `
  SELECT rt.route_id, rt.depot_id, d.name AS depot_name, rt.shelter_id, sh.name AS shelter_name,
         rt.distance_km, rt.status
  FROM route rt
  JOIN depot d ON d.depot_id = rt.depot_id
  JOIN shelter sh ON sh.shelter_id = rt.shelter_id`;

const SORTS = { route_id: 'rt.route_id', distance_km: 'rt.distance_km', status: 'rt.status' };

async function findRoute(id) {
  const [rows] = await pool.query(`${SELECT} WHERE rt.route_id = ?`, [id]);
  return rows[0];
}

// GET /api/routes?status=&depot_id=&shelter_id=&sort=&order=&page=&limit=
router.get('/', async (req, res) => {
  const status = queryEnum(req.query.status, 'status', STATUSES);
  const depotId = req.query.depot_id === undefined ? undefined : parseId(req.query.depot_id, 'depot_id');
  const shelterId = req.query.shelter_id === undefined ? undefined : parseId(req.query.shelter_id, 'shelter_id');
  const orderBy = parseSort(req.query, SORTS, 'route_id');
  const paging = parsePagination(req.query);

  const f = filters();
  if (status) f.add('rt.status = ?', status);
  if (depotId) f.add('rt.depot_id = ?', depotId);
  if (shelterId) f.add('rt.shelter_id = ?', shelterId);

  const [[rows], [[count]]] = await Promise.all([
    pool.query(`${SELECT} ${f.sql()} ORDER BY ${orderBy}, rt.route_id LIMIT ? OFFSET ?`, [
      ...f.params,
      paging.limit,
      paging.offset,
    ]),
    pool.query(`SELECT COUNT(*) AS total FROM route rt ${f.sql()}`, f.params),
  ]);
  res.json(paginated(rows, count.total, paging));
});

// GET /api/routes/:id
router.get('/:id', async (req, res) => {
  const route = await findRoute(parseId(req.params.id));
  if (!route) throw new HttpError(404, 'Route not found');
  res.json({ route });
});

// POST /api/routes  (admin, logistics_manager). Unknown depot/shelter -> 400 via the foreign keys.
router.post('/', requireRole(...MANAGERS), async (req, res) => {
  const id = await insertRow('route', validateBody(req.body, createSchema));
  res.status(201).json({ route: await findRoute(id) });
});

// PATCH /api/routes/:id  (admin, logistics_manager)
router.patch('/:id', requireRole(...MANAGERS), async (req, res) => {
  const id = parseId(req.params.id);
  await updateRow('route', 'route_id', id, validateBody(req.body, updateSchema, { partial: true }));
  const route = await findRoute(id);
  if (!route) throw new HttpError(404, 'Route not found');
  res.json({ route });
});

// DELETE /api/routes/:id  (admin)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const [result] = await pool.query('DELETE FROM route WHERE route_id = ?', [parseId(req.params.id)]);
  if (result.affectedRows === 0) throw new HttpError(404, 'Route not found');
  res.status(204).end();
});

module.exports = router;
