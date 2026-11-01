const express = require('express');
const pool = require('../db/mysql');
const HttpError = require('../utils/httpError');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parseId, queryText, escapeLike, validateBody } = require('../utils/validate');
const { parsePagination, parseSort, paginated, filters } = require('../utils/query');
const { insertRow, updateRow } = require('../utils/sql');

const router = express.Router();
router.use(requireAuth);

const MANAGERS = ['admin', 'logistics_manager'];

const depotSchema = {
  name: { type: 'string', max: 150, required: true },
  latitude: { type: 'number', min: -90, max: 90, required: true },
  longitude: { type: 'number', min: -180, max: 180, required: true },
};

const COLUMNS = 'depot_id, name, latitude, longitude';
const SORTS = { depot_id: 'depot_id', name: 'name' };

async function findDepot(id) {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM depot WHERE depot_id = ?`, [id]);
  return rows[0];
}

// GET /api/depots?search=&sort=&order=&page=&limit=
router.get('/', async (req, res) => {
  const search = queryText(req.query.search, 'search');
  const orderBy = parseSort(req.query, SORTS, 'depot_id');
  const paging = parsePagination(req.query);

  const f = filters();
  if (search) f.add('name LIKE ?', `%${escapeLike(search)}%`);

  const [[rows], [[count]]] = await Promise.all([
    pool.query(`SELECT ${COLUMNS} FROM depot ${f.sql()} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [
      ...f.params,
      paging.limit,
      paging.offset,
    ]),
    pool.query(`SELECT COUNT(*) AS total FROM depot ${f.sql()}`, f.params),
  ]);
  res.json(paginated(rows, count.total, paging));
});

// GET /api/depots/:id  -> the depot plus what it currently stocks
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const depot = await findDepot(id);
  if (!depot) throw new HttpError(404, 'Depot not found');

  const [supplies] = await pool.query(
    'SELECT supply_id, resource_type, quantity FROM supply WHERE depot_id = ? ORDER BY resource_type',
    [id]
  );
  res.json({ depot: { ...depot, supplies } });
});

// POST /api/depots  (admin, logistics_manager)
router.post('/', requireRole(...MANAGERS), async (req, res) => {
  const id = await insertRow('depot', validateBody(req.body, depotSchema));
  res.status(201).json({ depot: await findDepot(id) });
});

// PATCH /api/depots/:id  (admin, logistics_manager)
router.patch('/:id', requireRole(...MANAGERS), async (req, res) => {
  const id = parseId(req.params.id);
  await updateRow('depot', 'depot_id', id, validateBody(req.body, depotSchema, { partial: true }));
  const depot = await findDepot(id);
  if (!depot) throw new HttpError(404, 'Depot not found');
  res.json({ depot });
});

// DELETE /api/depots/:id  (admin). 409 if routes or supplies still reference it.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const [result] = await pool.query('DELETE FROM depot WHERE depot_id = ?', [parseId(req.params.id)]);
  if (result.affectedRows === 0) throw new HttpError(404, 'Depot not found');
  res.status(204).end();
});

module.exports = router;
