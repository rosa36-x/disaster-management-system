// The request query used by both the requests routes and the incident routes
// (an incident links to MySQL requests, so both sides need the same shape).
const REQUEST_SELECT = `
  SELECT r.request_id, r.person_id, v.name AS victim_name, v.priority AS victim_priority,
         r.resource_type, r.quantity, r.status, r.requested_at, r.description,
         m.match_id, m.supply_id, m.vehicle_id, m.assigned_qty, m.eta_minutes, m.matched_at
  FROM request r
  JOIN victim v ON v.person_id = r.person_id
  LEFT JOIN match_assignment m ON m.request_id = r.request_id`;

// Groups the joined match_* columns into a nested "match" object (or null).
function shapeRequest(row) {
  const { match_id, supply_id, vehicle_id, assigned_qty, eta_minutes, matched_at, ...request } = row;
  request.match = match_id
    ? { match_id, supply_id, vehicle_id, assigned_qty, eta_minutes, matched_at }
    : null;
  return request;
}

module.exports = { REQUEST_SELECT, shapeRequest };
