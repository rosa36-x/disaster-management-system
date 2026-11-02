const express = require('express');
const pool = require('../db/mysql');
const HttpError = require('../utils/httpError');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parseId, queryEnum, queryText, validateBody } = require('../utils/validate');
const { parsePagination, parseSort, paginated, filters } = require('../utils/query');
const { insertRow } = require('../utils/sql');

const router = express.Router();
router.use(requireAuth);

const MANAGERS = ['admin', 'logistics_manager'];

// A supply row lives at exactly one place: a depot OR a shelter (DB CHECK enforces it too),
// and there is at most one row per location and resource_type (DB UNIQUE keys).
const supplySchema = {
  depot_id: { type: 'int', min: 1 },
  shelter_id: { type: 'int', min: 1 },
  resource_type: { type: 'string', max: 50, lowercase: true, required: true },
  quantity: { type: 'int', min: 0, max: 10000000, required: true },
};

const SELECT = `
  SELECT s.supply_id, s.resource_type, s.quantity, s.depot_id, s.shelter_id,
         CASE WHEN s.depot_id IS NOT NULL THEN 'depot' ELSE 'shelter' END AS location_type,
         COALESCE(d.name, sh.name) AS location_name
  FROM supply s
  LEFT JOIN depot d ON d.depot_id = s.depot_id
  LEFT JOIN shelter sh ON sh.shelter_id = s.shelter_id`;

const SORTS = {
  supply_id: 's.supply_id',
  resource_type: 's.resource_type',
  quantity: 's.quantity',
};

async function findSupply(id) {
  const [rows] = await pool.query(`${SELECT} WHERE s.supply_id = ?`, [id]);
  return rows[0];
}

// GET /api/supplies?resource_type=&location_type=&depot_id=&shelter_id=&in_stock=true&sort=&page=&limit=
router.get('/', async (req, res) => {
  const resourceType = queryText(req.query.resource_type, 'resource_type', 50);
  const locationType = queryEnum(req.query.location_type, 'location_type', ['depot', 'shelter']);
  const depotId = req.query.depot_id === undefined ? undefined : parseId(req.query.depot_id, 'depot_id');
  const shelterId = req.query.shelter_id === undefined ? undefined : parseId(req.query.shelter_id, 'shelter_id');
  const inStock = queryEnum(req.query.in_stock, 'in_stock', ['true', 'false']);
  const orderBy = parseSort(req.query, SORTS, 'supply_id');
  const paging = parsePagination(req.query);

  const f = filters();
  if (resourceType) f.add('s.resource_type = ?', resourceType.toLowerCase());
  if (locationType === 'depot') f.add('s.depot_id IS NOT NULL');
  if (locationType === 'shelter') f.add('s.shelter_id IS NOT NULL');
  if (depotId) f.add('s.depot_id = ?', depotId);
  if (shelterId) f.add('s.shelter_id = ?', shelterId);
  if (inStock === 'true') f.add('s.quantity > 0');
  if (inStock === 'false') f.add('s.quantity = 0');

  const [[rows], [[count]]] = await Promise.all([
    pool.query(`${SELECT} ${f.sql()} ORDER BY ${orderBy}, s.supply_id LIMIT ? OFFSET ?`, [
      ...f.params,
      paging.limit,
      paging.offset,
    ]),
    pool.query(`SELECT COUNT(*) AS total FROM supply s ${f.sql()}`, f.params),
  ]);
  res.json(paginated(rows, count.total, paging));
});

// GET /api/supplies/:id
router.get('/:id', async (req, res) => {
  const supply = await findSupply(parseId(req.params.id));
  if (!supply) throw new HttpError(404, 'Supply not found');
  res.json({ supply });
});

// POST /api/supplies  (admin, logistics_manager)
router.post('/', requireRole(...MANAGERS), async (req, res) => {
  const data = validateBody(req.body, supplySchema);
  if ((data.depot_id === undefined) === (data.shelter_id === undefined)) {
    throw new HttpError(400, 'Provide exactly one of depot_id or shelter_id');
  }
  let id;
  try {
    id = await insertRow('supply', data);
  } catch (err) {
    // UNIQUE (depot_id, resource_type) / (shelter_id, resource_type): one stock row per place and type.
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'This location already has a stock row for that resource; use POST /api/supplies/:id/restock');
    }
    throw err;
  }
  res.status(201).json({ supply: await findSupply(id) });
});

// POST /api/supplies/:id/restock  { amount }  (admin, logistics_manager)
// Adds to the stock inside one UPDATE (quantity = quantity + ?). Overwriting the
// quantity with an absolute number could erase a deduction the matching
// trigger made a moment earlier, so there is deliberately no "set quantity" route.
router.post('/:id/restock', requireRole(...MANAGERS), async (req, res) => {
  const id = parseId(req.params.id);
  const { amount } = validateBody(req.body, { amount: { type: 'int', min: 1, max: 10000000, required: true } });

  await pool.query('UPDATE supply SET quantity = quantity + ? WHERE supply_id = ?', [amount, id]);
  const supply = await findSupply(id);
  if (!supply) throw new HttpError(404, 'Supply not found');
  res.json({ supply });
});

// DELETE /api/supplies/:id  (admin). 409 if a match assignment used it.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const [result] = await pool.query('DELETE FROM supply WHERE supply_id = ?', [parseId(req.params.id)]);
  if (result.affectedRows === 0) throw new HttpError(404, 'Supply not found');
  res.status(204).end();
});

module.exports = router;
