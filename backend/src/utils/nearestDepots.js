const pool = require('../db/mysql');

// Depots ordered by distance from a point, using the fn_distance_km MySQL function.
// With resourceType, only depots holding at least minQuantity of it are returned,
// together with how much they have.
async function nearestDepots(lat, lng, { resourceType, minQuantity = 1, limit = 3 } = {}) {
  const params = [lat, lng];
  let stockColumn = '';
  let stockJoin = '';

  if (resourceType) {
    stockColumn = ', s.available_quantity';
    stockJoin = `
     JOIN (SELECT depot_id, SUM(quantity) AS available_quantity
           FROM supply
           WHERE resource_type = ? AND depot_id IS NOT NULL
           GROUP BY depot_id
           HAVING SUM(quantity) >= ?) s ON s.depot_id = d.depot_id`;
    params.push(resourceType, minQuantity);
  }
  params.push(limit);

  const [rows] = await pool.query(
    `SELECT d.depot_id, d.name, d.latitude, d.longitude,
            ROUND(fn_distance_km(?, ?, d.latitude, d.longitude), 2) AS distance_km${stockColumn}
     FROM depot d${stockJoin}
     ORDER BY distance_km, d.depot_id
     LIMIT ?`,
    params
  );
  return rows;
}

module.exports = nearestDepots;
