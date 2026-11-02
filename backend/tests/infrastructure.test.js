const h = require('./helpers/harness');
const { T } = h;
h.start(4103, async (call, check) => {
  const last = () => h.calls[h.calls.length - 1];
  const find = (frag) => h.calls.find((c) => c.sql.includes(frag));

  // ===== depots
  check('depots no token 401', (await call('GET', '/api/depots')).status === 401);
  h.handler = h.listHandler([{ depot_id: 1 }], 20); h.calls.length = 0;
  let r = await call('GET', '/api/depots?search=cen_tral&sort=name&order=desc&page=2&limit=5', null, T.field);
  check('depots list + search escaped', r.status === 200 && JSON.stringify(find('LIMIT').params) === JSON.stringify(['%cen\\_tral%', 5, 5]) && find('LIMIT').sql.includes('ORDER BY name DESC'), JSON.stringify(find('LIMIT')));
  h.handler = (sql) => sql.includes('FROM depot WHERE') ? [[{ depot_id: 1, name: 'Central' }]] : [[{ supply_id: 1, resource_type: 'water', quantity: 100 }]];
  r = await call('GET', '/api/depots/1', null, T.field);
  check('depot detail includes supplies', r.status === 200 && r.body.depot.supplies.length === 1);
  h.handler = () => [[]];
  check('depot missing 404', (await call('GET', '/api/depots/9', null, T.field)).status === 404);
  const dep = { name: 'East Depot', latitude: 12.9, longitude: 77.6 };
  h.handler = (sql) => sql.startsWith('INSERT') ? [{ insertId: 21 }] : [[{ depot_id: 21, ...dep }]];
  check('depot create as field_worker 403', (await call('POST', '/api/depots', dep, T.field)).status === 403);
  check('depot create as logistics 201', (await call('POST', '/api/depots', dep, T.logistics)).status === 201);
  check('depot create missing name 400', (await call('POST', '/api/depots', { latitude: 1, longitude: 2 }, T.admin)).status === 400);
  check('depot create lat 91 400', (await call('POST', '/api/depots', { ...dep, latitude: 91 }, T.admin)).status === 400);
  check('depot patch empty 400', (await call('PATCH', '/api/depots/21', {}, T.admin)).status === 400);
  check('depot patch 200', (await call('PATCH', '/api/depots/21', { name: 'X' }, T.logistics)).status === 200);
  check('depot delete as logistics 403', (await call('DELETE', '/api/depots/21', null, T.logistics)).status === 403);
  h.handler = h.dbErr('ER_ROW_IS_REFERENCED_2');
  check('depot delete in use 409', (await call('DELETE', '/api/depots/1', null, T.admin)).status === 409);
  h.handler = () => [{ affectedRows: 1 }];
  check('depot delete 204', (await call('DELETE', '/api/depots/21', null, T.admin)).status === 204);

  // ===== shelters
  h.handler = h.listHandler([{ shelter_id: 1 }], 3); h.calls.length = 0;
  r = await call('GET', '/api/shelters?has_space=true&sort=free_capacity&order=desc', null, T.field);
  check('shelters has_space + free_capacity sort', r.status === 200 && find('LIMIT').sql.includes('occupancy < capacity') && find('LIMIT').sql.includes('ORDER BY (capacity - occupancy) DESC') && find('LIMIT').sql.includes('fn_shelter_free(shelter_id)'), find('LIMIT').sql);
  check('shelters has_space=maybe 400', (await call('GET', '/api/shelters?has_space=maybe', null, T.field)).status === 400);
  const sh = { name: 'School', latitude: 12.9, longitude: 77.6, capacity: 100, occupancy: 20 };
  h.handler = (sql) => sql.startsWith('INSERT') ? [{ insertId: 21 }] : [[{ shelter_id: 21, ...sh, free_capacity: 80 }]];
  check('shelter create 201', (await call('POST', '/api/shelters', sh, T.admin)).status === 201);
  check('shelter occupancy > capacity 400', (await call('POST', '/api/shelters', { ...sh, occupancy: 101 }, T.admin)).status === 400);
  check('shelter capacity 0 400', (await call('POST', '/api/shelters', { ...sh, capacity: 0 }, T.admin)).status === 400);
  check('shelter negative occupancy 400', (await call('POST', '/api/shelters', { ...sh, occupancy: -1 }, T.admin)).status === 400);
  h.handler = h.dbErr('ER_CHECK_CONSTRAINT_VIOLATED');
  r = await call('PATCH', '/api/shelters/1', { capacity: 5 }, T.admin);
  check('shelter patch breaking CHECK -> 400', r.status === 400, JSON.stringify(r.body));

  // ===== supplies
  h.handler = h.listHandler([{ supply_id: 1 }], 33); h.calls.length = 0;
  r = await call('GET', '/api/supplies?resource_type=Water&location_type=depot&depot_id=1&in_stock=true&sort=quantity&order=desc', null, T.field);
  check('supplies filter params', r.status === 200 && JSON.stringify(find('LIMIT').params) === JSON.stringify(['water', 1, 20, 0]), JSON.stringify(find('LIMIT').params));
  check('supplies location/in_stock SQL', find('LIMIT').sql.includes('s.depot_id IS NOT NULL') && find('LIMIT').sql.includes('s.quantity > 0') && find('LIMIT').sql.includes('ORDER BY s.quantity DESC'));
  check('supplies bad location_type 400', (await call('GET', '/api/supplies?location_type=moon', null, T.field)).status === 400);
  check('supplies bad in_stock 400', (await call('GET', '/api/supplies?in_stock=1', null, T.field)).status === 400);
  h.handler = (sql) => sql.startsWith('INSERT') ? [{ insertId: 34 }] : [[{ supply_id: 34, resource_type: 'water', quantity: 5, location_type: 'depot', location_name: 'Central Depot' }]];
  check('supply create (depot) as logistics 201', (await call('POST', '/api/supplies', { depot_id: 1, resource_type: 'Water', quantity: 5 }, T.logistics)).status === 201);
  h.calls.length = 0; await call('POST', '/api/supplies', { shelter_id: 2, resource_type: ' FOOD ', quantity: 5 }, T.admin);
  check('supply insert params lowercased', JSON.stringify(h.calls[0].params) === JSON.stringify([2, 'food', 5]), JSON.stringify(h.calls[0].params));
  h.handler = h.dbErr('ER_DUP_ENTRY');
  r = await call('POST', '/api/supplies', { depot_id: 1, resource_type: 'water', quantity: 5 }, T.admin);
  check('supply duplicate location+type -> 409 pointing to restock', r.status === 409 && /restock/.test(r.body.error), JSON.stringify(r.body));
  h.handler = (sql) => sql.startsWith('INSERT') ? [{ insertId: 34 }] : [[{ supply_id: 34, resource_type: 'water', quantity: 5, location_type: 'depot', location_name: 'Central Depot' }]];
  check('supply both depot+shelter 400', (await call('POST', '/api/supplies', { depot_id: 1, shelter_id: 1, resource_type: 'water', quantity: 5 }, T.admin)).status === 400);
  check('supply neither 400', (await call('POST', '/api/supplies', { resource_type: 'water', quantity: 5 }, T.admin)).status === 400);
  check('supply negative qty 400', (await call('POST', '/api/supplies', { depot_id: 1, resource_type: 'water', quantity: -1 }, T.admin)).status === 400);
  check('supply as field_worker 403', (await call('POST', '/api/supplies', { depot_id: 1, resource_type: 'water', quantity: 5 }, T.field)).status === 403);
  h.calls.length = 0;
  r = await call('POST', '/api/supplies/34/restock', { amount: 25 }, T.logistics);
  check('restock 200 + atomic SQL', r.status === 200 && h.calls[0].sql === 'UPDATE supply SET quantity = quantity + ? WHERE supply_id = ?' && JSON.stringify(h.calls[0].params) === '[25,34]', JSON.stringify(h.calls[0]));
  check('restock amount 0 400', (await call('POST', '/api/supplies/34/restock', { amount: 0 }, T.admin)).status === 400);
  check('restock missing amount 400', (await call('POST', '/api/supplies/34/restock', {}, T.admin)).status === 400);
  check('restock as field_worker 403', (await call('POST', '/api/supplies/34/restock', { amount: 5 }, T.field)).status === 403);
  h.handler = (sql) => sql.startsWith('UPDATE') ? [{}] : [[]];
  check('restock missing supply 404', (await call('POST', '/api/supplies/99/restock', { amount: 5 }, T.admin)).status === 404);
  h.handler = h.dbErr('ER_ROW_IS_REFERENCED_2');
  check('supply delete used by match 409', (await call('DELETE', '/api/supplies/1', null, T.admin)).status === 409);
  check('no PATCH route for supply (404)', (await call('PATCH', '/api/supplies/1', { quantity: 1 }, T.admin)).status === 404);

  // ===== vehicles
  h.handler = h.listHandler([{ vehicle_id: 1 }], 28); h.calls.length = 0;
  r = await call('GET', '/api/vehicles?status=available&min_capacity=100', null, T.field);
  check('vehicles filters', r.status === 200 && JSON.stringify(find('LIMIT').params) === JSON.stringify(['available', 100, 20, 0]), JSON.stringify(find('LIMIT').params));
  check('vehicles bad status 400', (await call('GET', '/api/vehicles?status=flying', null, T.field)).status === 400);
  h.handler = (sql) => sql.startsWith('INSERT') ? [{ insertId: 29 }] : [[{ vehicle_id: 29, status: 'available', capacity: 200 }]];
  check('vehicle create 201', (await call('POST', '/api/vehicles', { capacity: 200, latitude: 12.9, longitude: 77.5 }, T.logistics)).status === 201);
  check('vehicle create status en_route 400', (await call('POST', '/api/vehicles', { capacity: 200, status: 'en_route' }, T.admin)).status === 400);
  check('vehicle create capacity 0 400', (await call('POST', '/api/vehicles', { capacity: 0 }, T.admin)).status === 400);
  check('vehicle null lat allowed', (await call('POST', '/api/vehicles', { capacity: 5, latitude: null, longitude: null }, T.admin)).status === 201);
  h.handler = () => [[{ vehicle_id: 3, status: 'en_route', capacity: 200 }]];
  r = await call('PATCH', '/api/vehicles/3', { status: 'available' }, T.admin);
  check('vehicle patch status while en_route 409', r.status === 409, JSON.stringify(r.body));
  h.calls.length = 0;
  r = await call('PATCH', '/api/vehicles/3', { latitude: 12.5, longitude: 77.5 }, T.admin);
  check('vehicle location update while en_route OK', r.status === 200 && !h.calls.find((c) => c.sql.includes("status <> 'en_route'")));
  h.handler = () => [[{ vehicle_id: 4, status: 'available', capacity: 200 }]]; h.calls.length = 0;
  r = await call('PATCH', '/api/vehicles/4', { status: 'maintenance' }, T.logistics);
  check('vehicle status change guarded in SQL', r.status === 200 && h.calls[1].sql.includes("AND status <> 'en_route'"), JSON.stringify(h.calls.map(c => c.sql)));
  h.handler = () => [[]];
  check('vehicle patch missing 404', (await call('PATCH', '/api/vehicles/99', { capacity: 5 }, T.admin)).status === 404);

  // ===== routes
  h.handler = h.listHandler([{ route_id: 1 }], 29); h.calls.length = 0;
  r = await call('GET', '/api/routes?status=blocked&depot_id=2&shelter_id=3', null, T.field);
  check('routes filters', r.status === 200 && JSON.stringify(find('LIMIT').params) === JSON.stringify(['blocked', 2, 3, 20, 0]), JSON.stringify(find('LIMIT').params));
  h.handler = (sql) => sql.startsWith('INSERT') ? [{ insertId: 30 }] : [[{ route_id: 30, depot_name: 'a', shelter_name: 'b' }]];
  check('route create 201', (await call('POST', '/api/routes', { depot_id: 1, shelter_id: 2, distance_km: 12.5 }, T.logistics)).status === 201);
  check('route distance 10000 400', (await call('POST', '/api/routes', { depot_id: 1, shelter_id: 2, distance_km: 10000 }, T.admin)).status === 400);
  check('route negative distance 400', (await call('POST', '/api/routes', { depot_id: 1, shelter_id: 2, distance_km: -1 }, T.admin)).status === 400);
  check('route missing shelter 400', (await call('POST', '/api/routes', { depot_id: 1 }, T.admin)).status === 400);
  check('route patch cannot change depot_id', (await call('PATCH', '/api/routes/30', { depot_id: 2 }, T.admin)).status === 400);
  check('route patch status blocked 200', (await call('PATCH', '/api/routes/30', { status: 'blocked' }, T.logistics)).status === 200);
  check('route patch bad status 400', (await call('PATCH', '/api/routes/30', { status: 'closed' }, T.admin)).status === 400);
  h.handler = h.dbErr('ER_NO_REFERENCED_ROW_2');
  check('route unknown depot FK 400', (await call('POST', '/api/routes', { depot_id: 999, shelter_id: 2 }, T.admin)).status === 400);
  check('route delete as logistics 403', (await call('DELETE', '/api/routes/1', null, T.logistics)).status === 403);
});
