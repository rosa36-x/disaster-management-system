const express = require('express');
const pool = require('../db/mysql');
const HttpError = require('../utils/httpError');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parseId, queryEnum, validateBody } = require('../utils/validate');
const { parsePagination, parseSort, paginated, filters } = require('../utils/query');
const { insertRow } = require('../utils/sql');

const router = express.Router();
router.use(requireAuth);

const MANAGERS = ['admin', 'logistics_manager'];
const STATUSES = ['available', 'en_route', 'maintenance'];

// Clients may only set available/maintenance. en_route is set by the matching
// trigger when a delivery is assigned, and cleared by sp_complete_delivery.
const vehicleSchema = {
  status: { type: 'enum', values: ['available', 'maintenance'] },
  latitude: { type: 'number', min: -90, max: 90, nullable: true },
  longitude: { type: 'number', min: -180, max: 180, nullable: true },
  capacity: { type: 'int', min: 1, max: 1000000, required: true },
};

const COLUMNS = 'vehicle_id, status, latitude, longitude, capacity';
const SORTS = { vehicle_id: 'vehicle_id', capacity: 'capacity', status: 'status' };

async function findVehicle(id) {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM vehicle WHERE vehicle_id = ?`, [id]);
  return rows[0];
}

// GET /api/vehicles?status=&min_capacity=&sort=&order=&page=&limit=
router.get('/', async (req, res) => {
  const status = queryEnum(req.query.status, 'status', STATUSES);
  const minCapacity = req.query.min_capacity === undefined ? undefined : parseId(req.query.min_capacity, 'min_capacity');
  const orderBy = parseSort(req.query, SORTS, 'vehicle_id');
  const paging = parsePagination(req.query);

  const f = filters();
  if (status) f.add('status = ?', status);
  if (minCapacity) f.add('capacity >= ?', minCapacity);

  const [[rows], [[count]]] = await Promise.all([
    pool.query(`SELECT ${COLUMNS} FROM vehicle ${f.sql()} ORDER BY ${orderBy}, vehicle_id LIMIT ? OFFSET ?`, [
      ...f.params,
      paging.limit,
      paging.offset,
    ]),
    pool.query(`SELECT COUNT(*) AS total FROM vehicle ${f.sql()}`, f.params),
  ]);
  res.json(paginated(rows, count.total, paging));
});

// GET /api/vehicles/:id
router.get('/:id', async (req, res) => {
  const vehicle = await findVehicle(parseId(req.params.id));
  if (!vehicle) throw new HttpError(404, 'Vehicle not found');
  res.json({ vehicle });
});

// POST /api/vehicles  (admin, logistics_manager)
router.post('/', requireRole(...MANAGERS), async (req, res) => {
  const id = await insertRow('vehicle', validateBody(req.body, vehicleSchema));
  res.status(201).json({ vehicle: await findVehicle(id) });
});

// PATCH /api/vehicles/:id  (admin, logistics_manager)
// A vehicle on a delivery can't have its status changed; location updates are fine.
router.patch('/:id', requireRole(...MANAGERS), async (req, res) => {
  const id = parseId(req.params.id);
  const data = validateBody(req.body, vehicleSchema, { partial: true });

  const existing = await findVehicle(id);
  if (!existing) throw new HttpError(404, 'Vehicle not found');
  if (data.status !== undefined && existing.status === 'en_route') {
    throw new HttpError(409, 'Vehicle is on a delivery; complete the delivery before changing its status');
  }

  const columns = Object.keys(data);
  await pool.query(
    `UPDATE vehicle SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE vehicle_id = ?` +
      (data.status !== undefined ? " AND status <> 'en_route'" : ''),
    [...columns.map((c) => data[c]), id]
  );
  res.json({ vehicle: await findVehicle(id) });
});

// DELETE /api/vehicles/:id  (admin). 409 if a match assignment used it.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const [result] = await pool.query('DELETE FROM vehicle WHERE vehicle_id = ?', [parseId(req.params.id)]);
  if (result.affectedRows === 0) throw new HttpError(404, 'Vehicle not found');
  res.status(204).end();
});

module.exports = router;
