const h = require('./helpers/harness');
const { T } = h;
const matchRow = { match_id: 11, request_id: 5, resource_type: 'water', request_status: 'matched', victim_name: 'Asha', victim_priority: 'critical',
  supply_id: 2, supply_location: 'Central Depot', vehicle_id: 1, assigned_qty: 40, eta_minutes: 25, matched_at: 't' };
const order = () => h.calls.map((c) => c.sql.replace(/\s+/g, ' ').slice(0, 40));

h.start(4104, async (call, check) => {
  const find = (frag) => h.calls.find((c) => c.sql.includes(frag));

  // ===== list / get
  check('matches no token 401', (await call('GET', '/api/matches')).status === 401);
  h.handler = h.listHandler([matchRow], 12); h.calls.length = 0;
  let r = await call('GET', '/api/matches?request_status=delivered&resource_type=Water&vehicle_id=1&supply_id=2&request_id=5', null, T.field);
  check('matches list + filter params', r.status === 200 && JSON.stringify(find('LIMIT').params) === JSON.stringify(['delivered', 'water', 5, 1, 2, 20, 0]), JSON.stringify(find('LIMIT').params));
  check('matches default sort newest first', find('LIMIT').sql.includes('ORDER BY m.matched_at DESC'));
  check('matches bad request_status 400', (await call('GET', '/api/matches?request_status=pending', null, T.field)).status === 400);
  check('matches bad vehicle_id 400', (await call('GET', '/api/matches?vehicle_id=x', null, T.field)).status === 400);
  h.handler = () => [[matchRow]];
  check('match get one 200', (await call('GET', '/api/matches/11', null, T.field)).status === 200);
  h.handler = () => [[]];
  check('match missing 404', (await call('GET', '/api/matches/99', null, T.field)).status === 404);

  // ===== run all pending
  const runHandler = (sql) => {
    if (sql.includes('GET_LOCK')) return [[{ got: 1 }]];
    if (sql.includes('last_match')) return [[{ pending: 5, last_match: 10 }]];
    if (sql.startsWith('CALL')) return [[{}]];
    if (sql.includes('RELEASE_LOCK')) return [[{}]];
    return [[{ ...matchRow, match_id: 11 }, { ...matchRow, match_id: 12 }]];
  };
  h.handler = runHandler; h.calls.length = 0;
  check('run as field_worker 403', (await call('POST', '/api/matches/run', null, T.field)).status === 403);
  h.calls.length = 0;
  r = await call('POST', '/api/matches/run', null, T.logistics);
  check('run 200 summary', r.status === 200 && r.body.pending_before === 5 && r.body.matched === 2 && r.body.still_pending === 3 && r.body.assignments.length === 2, JSON.stringify(r.body));
  const o = order();
  check('lock taken first, procedure called, lock released last', o[0].includes('GET_LOCK') && o.some((x) => x.startsWith('CALL sp_match_all_pending')) && o[o.length - 1].includes('RELEASE_LOCK'), JSON.stringify(o));
  check('assignments query uses last_match id', JSON.stringify(h.calls[h.calls.length - 2].params) === '[10]', JSON.stringify(h.calls[h.calls.length - 2]));
  check('lock name + timeout', JSON.stringify(h.calls[0].params) === JSON.stringify(['disaster_matching']) || JSON.stringify(h.calls[0].params) === JSON.stringify(['disaster_matching', 5]), JSON.stringify(h.calls[0]));

  // lock busy
  h.handler = (sql) => (sql.includes('GET_LOCK') ? [[{ got: 0 }]] : [[{}]]); h.calls.length = 0;
  r = await call('POST', '/api/matches/run', null, T.admin);
  check('lock busy -> 409, procedure never called', r.status === 409 && !h.calls.some((c) => c.sql.startsWith('CALL')), JSON.stringify(r.body));
  check('lock busy: RELEASE_LOCK not needed/called', !h.calls.some((c) => c.sql.includes('RELEASE_LOCK')));

  // procedure error still releases the lock
  h.handler = (sql) => {
    if (sql.includes('GET_LOCK')) return [[{ got: 1 }]];
    if (sql.includes('last_match')) return [[{ pending: 1, last_match: 0 }]];
    if (sql.startsWith('CALL')) h.dbErr('ER_LOCK_DEADLOCK')();
    return [[{}]];
  };
  h.calls.length = 0;
  const origErr = console.error; console.error = () => {};
  r = await call('POST', '/api/matches/run', null, T.admin);
  console.error = origErr;
  check('unexpected error -> 500, lock still released', r.status === 500 && h.calls[h.calls.length - 1].sql.includes('RELEASE_LOCK'), JSON.stringify(h.calls.map((c) => c.sql.slice(0, 25))));

  // ===== match single request
  const reqRow = { request_id: 5, person_id: 7, victim_name: 'Asha', victim_priority: 'critical', resource_type: 'water', quantity: 40, status: 'pending', requested_at: 't', description: 'x', match_id: null };
  const single = (extra) => (sql, params) => {
    if (sql.includes('GET_LOCK')) return [[{ got: 1 }]];
    if (sql.includes('RELEASE_LOCK')) return [[{}]];
    if (sql.startsWith('CALL')) return extra ? extra(sql, params) : [[{}]];
    return [[reqRow]];
  };
  h.handler = single(); h.calls.length = 0;
  check('match request as field_worker 403', (await call('POST', '/api/requests/5/match', null, T.field)).status === 403);
  r = await call('POST', '/api/requests/5/match', null, T.logistics);
  check('match request 200', r.status === 200 && r.body.request.request_id === 5);
  check('calls sp_match_request(5)', JSON.stringify(h.calls.find((c) => c.sql.startsWith('CALL')).params) === '[5]' && h.calls.find((c) => c.sql.startsWith('CALL')).sql.includes('sp_match_request'));
  h.handler = single(h.dbErr('ER_SIGNAL_EXCEPTION', 'No supply available')); h.calls.length = 0;
  r = await call('POST', '/api/requests/5/match', null, T.admin);
  check('no supply -> 409 with message', r.status === 409 && r.body.error === 'No supply available', JSON.stringify(r.body));
  check('lock released after SIGNAL', h.calls[h.calls.length - 1].sql.includes('RELEASE_LOCK'));
  h.handler = single(h.dbErr('ER_SIGNAL_EXCEPTION', 'No vehicle available'));
  check('no vehicle -> 409', (await call('POST', '/api/requests/5/match', null, T.admin)).body.error === 'No vehicle available');
  h.handler = () => [[]];
  check('match missing request 404', (await call('POST', '/api/requests/99/match', null, T.admin)).status === 404);
  check('match bad id 400', (await call('POST', '/api/requests/abc/match', null, T.admin)).status === 400);

  // ===== match single request from a chosen depot
  const depotHandler = (extra) => (sql, params) => {
    if (sql.includes('GET_LOCK')) return [[{ got: 1 }]];
    if (sql.includes('RELEASE_LOCK')) return [[{}]];
    if (sql.includes('FROM depot WHERE')) return [[{ depot_id: 3 }]];
    if (sql.startsWith('CALL')) return extra ? extra(sql, params) : [[{}]];
    return [[reqRow]];
  };
  h.handler = depotHandler(); h.calls.length = 0;
  r = await call('POST', '/api/requests/5/match', { depot_id: 3 }, T.logistics);
  const dcall = h.calls.find((c) => c.sql.startsWith('CALL'));
  check('match with depot_id 200, calls sp_match_request_at_depot(5, 3)', r.status === 200 && dcall.sql.includes('sp_match_request_at_depot') && JSON.stringify(dcall.params) === '[5,3]', JSON.stringify(dcall));
  check('match with depot_id does not call sp_match_request', !h.calls.some((c) => /sp_match_request\(/.test(c.sql)));
  h.handler = depotHandler(h.dbErr('ER_SIGNAL_EXCEPTION', 'Insufficient supply at depot: requested 500, available 120')); h.calls.length = 0;
  r = await call('POST', '/api/requests/5/match', { depot_id: 3 }, T.admin);
  check('depot over-ask -> 409 with requested/available', r.status === 409 && r.body.error === 'Insufficient supply at depot: requested 500, available 120', JSON.stringify(r.body));
  check('lock released after depot over-ask', h.calls[h.calls.length - 1].sql.includes('RELEASE_LOCK'));
  h.handler = (sql) => (sql.includes('FROM depot WHERE') ? [[]] : depotHandler()(sql));
  check('match with unknown depot 404, nothing called', (await call('POST', '/api/requests/5/match', { depot_id: 99 }, T.admin)).status === 404 && !h.calls.some((c) => c.sql.includes('sp_match_request_at_depot(?, ?)') && c.params[1] === 99));
  check('match depot_id=0 400', (await call('POST', '/api/requests/5/match', { depot_id: 0 }, T.admin)).status === 400);
  check('match depot_id string 400', (await call('POST', '/api/requests/5/match', { depot_id: 'x' }, T.admin)).status === 400);
  check('match unknown body field 400', (await call('POST', '/api/requests/5/match', { supply_id: 1 }, T.admin)).status === 400);
  h.handler = depotHandler();
  check('match depot_id as field_worker 403', (await call('POST', '/api/requests/5/match', { depot_id: 3 }, T.field)).status === 403);

  // ===== history
  h.handler = (sql) => (sql.includes('request_history') ? [[{ history_id: 1, old_status: null, new_status: 'pending', changed_at: 't' }, { history_id: 2, old_status: 'pending', new_status: 'matched', changed_at: 't2' }]] : [[reqRow]]);
  r = await call('GET', '/api/requests/5/history', null, T.field);
  check('history 200', r.status === 200 && r.body.request_id === 5 && r.body.history.length === 2 && r.body.history[1].new_status === 'matched', JSON.stringify(r.body));
  h.handler = () => [[]];
  check('history missing request 404', (await call('GET', '/api/requests/99/history', null, T.field)).status === 404);

  // ===== complete delivery
  const complete = (status) => (sql) => {
    if (sql.includes('GET_LOCK')) return [[{ got: 1 }]];
    if (sql.includes('RELEASE_LOCK')) return [[{}]];
    if (sql.startsWith('CALL')) return [[{}]];
    return [[{ ...matchRow, request_status: status }]];
  };
  h.handler = complete('matched'); h.calls.length = 0;
  check('complete as field_worker 403', (await call('POST', '/api/matches/11/complete', null, T.field)).status === 403);
  r = await call('POST', '/api/matches/11/complete', null, T.logistics);
  check('complete 200', r.status === 200 && r.body.match.match_id === 11);
  check('calls sp_complete_delivery(11)', JSON.stringify(h.calls.find((c) => c.sql.startsWith('CALL')).params) === '[11]');
  h.handler = complete('delivered'); h.calls.length = 0;
  r = await call('POST', '/api/matches/11/complete', null, T.admin);
  check('complete twice -> 409, procedure not called', r.status === 409 && /delivered/.test(r.body.error) && !h.calls.some((c) => c.sql.startsWith('CALL')), JSON.stringify(r.body));
  check('lock released after 409', h.calls[h.calls.length - 1].sql.includes('RELEASE_LOCK'));
  h.handler = (sql) => (sql.includes('GET_LOCK') ? [[{ got: 1 }]] : [[]]);
  check('complete missing match 404', (await call('POST', '/api/matches/99/complete', null, T.admin)).status === 404);
});
