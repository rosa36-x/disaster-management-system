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

const shelterSchema = {
  name: { type: 'string', max: 150, required: true },
  latitude: { type: 'number', min: -90, max: 90, required: true },
  longitude: { type: 'number', min: -180, max: 180, required: true },
  capacity: { type: 'int', min: 1, max: 1000000, required: true },
  occupancy: { type: 'int', min: 0, max: 1000000 },
};

// fn_shelter_free is the MySQL function from DML.sql (capacity - occupancy).
const COLUMNS = 'shelter_id, name, latitude, longitude, capacity, occupancy, fn_shelter_free(shelter_id) AS free_capacity';
const SORTS = {
  shelter_id: 'shelter_id',
  name: 'name',
  capacity: 'capacity',
  occupancy: 'occupancy',
  free_capacity: '(capacity - occupancy)',
};

async function findShelter(id) {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM shelter WHERE shelter_id = ?`, [id]);
  return rows[0];
}

// GET /api/shelters?search=&has_space=true&sort=&order=&page=&limit=
router.get('/', async (req, res) => {
  const search = queryText(req.query.search, 'search');
  const hasSpace = req.query.has_space;
  if (hasSpace !== undefined && hasSpace !== 'true' && hasSpace !== 'false') {
    throw new HttpError(400, 'has_space must be true or false');
  }
  const orderBy = parseSort(req.query, SORTS, 'shelter_id');
  const paging = parsePagination(req.query);

  const f = filters();
  if (search) f.add('name LIKE ?', `%${escapeLike(search)}%`);
  if (hasSpace === 'true') f.add('occupancy < capacity');
  if (hasSpace === 'false') f.add('occupancy >= capacity');

  const [[rows], [[count]]] = await Promise.all([
    pool.query(`SELECT ${COLUMNS} FROM shelter ${f.sql()} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [
      ...f.params,
      paging.limit,
      paging.offset,
    ]),
    pool.query(`SELECT COUNT(*) AS total FROM shelter ${f.sql()}`, f.params),
  ]);
  res.json(paginated(rows, count.total, paging));
});

// GET /api/shelters/:id  -> the shelter plus what it currently stocks
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const shelter = await findShelter(id);
  if (!shelter) throw new HttpError(404, 'Shelter not found');

  const [supplies] = await pool.query(
    'SELECT supply_id, resource_type, quantity FROM supply WHERE shelter_id = ? ORDER BY resource_type',
    [id]
  );
  res.json({ shelter: { ...shelter, supplies } });
});

// POST /api/shelters  (admin, logistics_manager)
router.post('/', requireRole(...MANAGERS), async (req, res) => {
  const data = validateBody(req.body, shelterSchema);
  if (data.occupancy !== undefined && data.occupancy > data.capacity) {
    throw new HttpError(400, 'occupancy cannot exceed capacity');
  }
  const id = await insertRow('shelter', data);
  res.status(201).json({ shelter: await findShelter(id) });
});

// PATCH /api/shelters/:id  (admin, logistics_manager). If the new values break
// occupancy <= capacity, the database CHECK rejects it (400).
router.patch('/:id', requireRole(...MANAGERS), async (req, res) => {
  const id = parseId(req.params.id);
  await updateRow('shelter', 'shelter_id', id, validateBody(req.body, shelterSchema, { partial: true }));
  const shelter = await findShelter(id);
  if (!shelter) throw new HttpError(404, 'Shelter not found');
  res.json({ shelter });
});

// DELETE /api/shelters/:id  (admin). 409 if routes or supplies still reference it.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const [result] = await pool.query('DELETE FROM shelter WHERE shelter_id = ?', [parseId(req.params.id)]);
  if (result.affectedRows === 0) throw new HttpError(404, 'Shelter not found');
  res.status(204).end();
});

module.exports = router;
