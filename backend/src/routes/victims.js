const express = require('express');
const pool = require('../db/mysql');
const HttpError = require('../utils/httpError');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parseId, queryEnum, queryText, escapeLike, validateBody } = require('../utils/validate');
const { parsePagination, parseSort, paginated } = require('../utils/query');

const router = express.Router();
router.use(requireAuth);

const PRIORITIES = ['critical', 'high', 'medium', 'low'];

// Mirrors the victim table. Ranges match what the columns can actually hold.
const victimSchema = {
  name: { type: 'string', max: 150, nullable: true },
  latitude: { type: 'number', min: -90, max: 90, required: true },
  longitude: { type: 'number', min: -180, max: 180, required: true },
  group_size: { type: 'int', min: 1, max: 100000 },
  priority: { type: 'enum', values: PRIORITIES },
};

const COLUMNS = 'person_id, name, latitude, longitude, group_size, priority';

const SORTS = {
  person_id: 'person_id',
  name: 'name',
  group_size: 'group_size',
  priority: 'priority', // ENUM sorts by declaration order: critical first
};

async function findVictim(id) {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM victim WHERE person_id = ?`, [id]);
  return rows[0];
}

// GET /api/victims?priority=&search=&sort=&order=&page=&limit=
router.get('/', async (req, res) => {
  const priority = queryEnum(req.query.priority, 'priority', PRIORITIES);
  const search = queryText(req.query.search, 'search');
  const orderBy = parseSort(req.query, SORTS, 'person_id');
  const paging = parsePagination(req.query);

  const where = [];
  const params = [];
  if (priority) {
    where.push('priority = ?');
    params.push(priority);
  }
  if (search) {
    where.push('name LIKE ?');
    params.push(`%${escapeLike(search)}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[rows], [[count]]] = await Promise.all([
    pool.query(
      `SELECT ${COLUMNS} FROM victim ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, paging.limit, paging.offset]
    ),
    pool.query(`SELECT COUNT(*) AS total FROM victim ${whereSql}`, params),
  ]);

  res.json(paginated(rows, count.total, paging));
});

// GET /api/victims/:id
router.get('/:id', async (req, res) => {
  const victim = await findVictim(parseId(req.params.id));
  if (!victim) throw new HttpError(404, 'Victim not found');
  res.json({ victim });
});

// POST /api/victims  (admin, field_worker)
router.post('/', requireRole('admin', 'field_worker'), async (req, res) => {
  const data = validateBody(req.body, victimSchema);
  const columns = Object.keys(data);

  const [result] = await pool.query(
    `INSERT INTO victim (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((c) => data[c])
  );

  res.status(201).json({ victim: await findVictim(result.insertId) });
});

// PATCH /api/victims/:id  (admin, field_worker) - send only the fields to change
router.patch('/:id', requireRole('admin', 'field_worker'), async (req, res) => {
  const id = parseId(req.params.id);
  const data = validateBody(req.body, victimSchema, { partial: true });
  const columns = Object.keys(data);

  await pool.query(
    `UPDATE victim SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE person_id = ?`,
    [...columns.map((c) => data[c]), id]
  );

  const victim = await findVictim(id);
  if (!victim) throw new HttpError(404, 'Victim not found');
  res.json({ victim });
});

// DELETE /api/victims/:id  (admin). Fails with 409 if the victim has requests.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const [result] = await pool.query('DELETE FROM victim WHERE person_id = ?', [parseId(req.params.id)]);
  if (result.affectedRows === 0) throw new HttpError(404, 'Victim not found');
  res.status(204).end();
});

module.exports = router;
