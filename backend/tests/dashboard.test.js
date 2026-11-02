const h = require('./helpers/harness');
const { T } = h;
h.start(4105, async (call, check) => {
  check('overview no token 401', (await call('GET', '/api/dashboard/overview')).status === 401);

  h.handler = (sql) => {
    if (sql.includes('FROM request GROUP BY status')) return [[{ status: 'pending', count: 20 }, { status: 'matched', count: 5 }]];
    if (sql.includes("r.status = 'pending'") && sql.includes('GROUP BY v.priority')) return [[{ priority: 'critical', count: 4 }, { priority: 'low', count: 2 }]];
    if (sql.includes('FROM victim')) return [[{ records: 25, people: 98 }]];
    if (sql.includes('FROM vehicle')) return [[{ status: 'available', count: 20 }, { status: 'en_route', count: 8 }]];
    if (sql.includes('FROM shelter')) return [[{ count: 20, capacity: 2000, occupancy: 513 }]];
    if (sql.includes('FROM depot')) return [[{ count: 20 }]];
    return [[]];
  };
  let r = await call('GET', '/api/dashboard/overview', null, T.field);
  const b = r.body;
  check('overview 200', r.status === 200, JSON.stringify(b));
  check('requests zero-filled by status', JSON.stringify(b.requests.by_status) === JSON.stringify({ pending: 20, matched: 5, delivered: 0, cancelled: 0 }) && b.requests.total === 25, JSON.stringify(b.requests));
  check('pending_by_priority zero-filled', JSON.stringify(b.requests.pending_by_priority) === JSON.stringify({ critical: 4, high: 0, medium: 0, low: 2 }), JSON.stringify(b.requests));
  check('vehicles zero-filled + total', JSON.stringify(b.vehicles.by_status) === JSON.stringify({ available: 20, en_route: 8, maintenance: 0 }) && b.vehicles.total === 28);
  check('victims + people_affected', b.victims.records === 25 && b.victims.people_affected === 98);
  check('shelter occupancy pct (513/2000 = 25.7)', b.shelters.occupancy_pct === 25.7 && b.shelters.capacity === 2000, JSON.stringify(b.shelters));
  check('depots count', b.depots.count === 20);

  h.handler = (sql) => (sql.includes('FROM shelter') ? [[{ count: 0, capacity: 0, occupancy: 0 }]] : sql.includes('COUNT') || sql.includes('SUM') ? [[{ records: 0, people: 0, count: 0 }]] : [[]]);
  r = await call('GET', '/api/dashboard/overview', null, T.admin);
  check('empty DB: zeros, no divide-by-zero', r.status === 200 && r.body.shelters.occupancy_pct === 0 && r.body.requests.total === 0, JSON.stringify(r.body));

  h.handler = () => [[{ resource_type: 'water', stock: 160, pending_demand: 300, balance: -140, shortfall: 140 }]];
  r = await call('GET', '/api/dashboard/supply-demand', null, T.logistics);
  check('supply-demand 200', r.status === 200 && r.body.data[0].shortfall === 140);

  h.calls.length = 0; h.handler = () => [[{ shelter_id: 1 }]];
  r = await call('GET', '/api/dashboard/shelters?limit=3', null, T.field);
  check('shelters limit param', r.status === 200 && JSON.stringify(h.calls[0].params) === '[3]');
  h.calls.length = 0;
  await call('GET', '/api/dashboard/shelters?limit=999', null, T.field);
  check('shelters limit capped at 50', JSON.stringify(h.calls[0].params) === '[50]');
  check('shelters bad limit 400', (await call('GET', '/api/dashboard/shelters?limit=x', null, T.field)).status === 400);
  h.calls.length = 0;
  r = await call('GET', '/api/dashboard/priority-queue', null, T.field);
  check('priority queue default limit 10 + matching order', r.status === 200 && JSON.stringify(h.calls[0].params) === '[10]' && h.calls[0].sql.includes("FIELD(v.priority, 'critical', 'high', 'medium', 'low'), v.group_size DESC, r.requested_at"));
});
