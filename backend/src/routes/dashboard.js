const express = require('express');
const pool = require('../db/mysql');
const { requireAuth } = require('../middleware/auth');
const { parsePagination } = require('../utils/query');

const router = express.Router();
router.use(requireAuth);

const REQUEST_STATUSES = ['pending', 'matched', 'delivered', 'cancelled'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const VEHICLE_STATUSES = ['available', 'en_route', 'maintenance'];

// GROUP BY only returns groups that exist. This fills in the missing ones with 0
// so the frontend always gets every key: { pending: 5, matched: 0, ... }.
function zeroFilled(keys, rows, keyColumn) {
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const row of rows) out[row[keyColumn]] = row.count;
  return out;
}

const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const pct = (part, whole) => (whole > 0 ? Math.round((1000 * part) / whole) / 10 : 0);

// GET /api/dashboard/overview -> headline numbers for the dashboard cards
router.get('/overview', async (req, res) => {
  const [[byStatus], [pendingByPriority], [[victims]], [byVehicle], [[shelters]], [[depots]]] = await Promise.all([
    pool.query('SELECT status, COUNT(*) AS count FROM request GROUP BY status'),
    pool.query(
      `SELECT v.priority, COUNT(*) AS count
       FROM request r JOIN victim v ON v.person_id = r.person_id
       WHERE r.status = 'pending'
       GROUP BY v.priority`
    ),
    pool.query('SELECT COUNT(*) AS records, COALESCE(SUM(group_size), 0) AS people FROM victim'),
    pool.query('SELECT status, COUNT(*) AS count FROM vehicle GROUP BY status'),
    pool.query(
      'SELECT COUNT(*) AS count, COALESCE(SUM(capacity), 0) AS capacity, COALESCE(SUM(occupancy), 0) AS occupancy FROM shelter'
    ),
    pool.query('SELECT COUNT(*) AS count FROM depot'),
  ]);

  const requestsByStatus = zeroFilled(REQUEST_STATUSES, byStatus, 'status');
  const vehiclesByStatus = zeroFilled(VEHICLE_STATUSES, byVehicle, 'status');

  res.json({
    victims: { records: victims.records, people_affected: victims.people },
    requests: {
      total: sum(requestsByStatus),
      by_status: requestsByStatus,
      pending_by_priority: zeroFilled(PRIORITIES, pendingByPriority, 'priority'),
    },
    vehicles: { total: sum(vehiclesByStatus), by_status: vehiclesByStatus },
    shelters: {
      count: shelters.count,
      capacity: shelters.capacity,
      occupancy: shelters.occupancy,
      occupancy_pct: pct(shelters.occupancy, shelters.capacity),
    },
    depots: { count: depots.count },
  });
});

// GET /api/dashboard/supply-demand
// Per resource type: total stock, quantity still wanted by pending requests, and the gap.
// A positive shortfall means pending requests need more than exists in all depots and shelters.
router.get('/supply-demand', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT t.resource_type,
            COALESCE(s.stock, 0) AS stock,
            COALESCE(p.pending_demand, 0) AS pending_demand,
            COALESCE(s.stock, 0) - COALESCE(p.pending_demand, 0) AS balance,
            GREATEST(COALESCE(p.pending_demand, 0) - COALESCE(s.stock, 0), 0) AS shortfall
     FROM (SELECT resource_type FROM supply UNION SELECT resource_type FROM request) t
     LEFT JOIN (SELECT resource_type, SUM(quantity) AS stock FROM supply GROUP BY resource_type) s
            ON s.resource_type = t.resource_type
     LEFT JOIN (SELECT resource_type, SUM(quantity) AS pending_demand FROM request
                WHERE status = 'pending' GROUP BY resource_type) p
            ON p.resource_type = t.resource_type
     ORDER BY t.resource_type`
  );
  res.json({ data: rows });
});

// GET /api/dashboard/shelters?limit=10 -> most crowded shelters first
router.get('/shelters', async (req, res) => {
  const { limit } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 50 });
  const [rows] = await pool.query(
    `SELECT shelter_id, name, capacity, occupancy,
            fn_shelter_free(shelter_id) AS free_capacity,
            ROUND(100 * occupancy / capacity, 1) AS occupancy_pct
     FROM shelter
     ORDER BY occupancy / capacity DESC, shelter_id
     LIMIT ?`,
    [limit]
  );
  res.json({ data: rows });
});

// GET /api/dashboard/priority-queue?limit=10
// Pending requests in the same order sp_match_all_pending serves them:
// critical first, then larger groups, then oldest. Shows what gets matched next.
router.get('/priority-queue', async (req, res) => {
  const { limit } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 50 });
  const [rows] = await pool.query(
    `SELECT r.request_id, v.name AS victim_name, v.priority AS victim_priority, v.group_size,
            r.resource_type, r.quantity, r.requested_at
     FROM request r
     JOIN victim v ON v.person_id = r.person_id
     WHERE r.status = 'pending'
     ORDER BY FIELD(v.priority, 'critical', 'high', 'medium', 'low'), v.group_size DESC, r.requested_at
     LIMIT ?`,
    [limit]
  );
  res.json({ data: rows });
});

module.exports = router;
