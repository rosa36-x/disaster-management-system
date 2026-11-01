const { parseId } = require('./validate');
const HttpError = require('./httpError');

// ?page=2&limit=20  ->  { page, limit, offset }. limit is capped so a client
// can't ask for the whole table in one request.
function parsePagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = query.page === undefined ? 1 : parseId(query.page, 'page');
  const requested = query.limit === undefined ? defaultLimit : parseId(query.limit, 'limit');
  const limit = Math.min(requested, maxLimit);
  return { page, limit, offset: (page - 1) * limit };
}

// ?sort=name&order=desc -> "name DESC". `allowed` maps public sort keys to SQL
// expressions, so user input never reaches the ORDER BY clause directly.
function parseSort(query, allowed, defaultSort) {
  const key = query.sort === undefined ? defaultSort : query.sort;
  if (typeof key !== 'string' || !Object.hasOwn(allowed, key)) {
    throw new HttpError(400, `sort must be one of: ${Object.keys(allowed).join(', ')}`);
  }
  const order = query.order === undefined ? 'asc' : query.order;
  if (order !== 'asc' && order !== 'desc') throw new HttpError(400, 'order must be asc or desc');
  return `${allowed[key]} ${order.toUpperCase()}`;
}

// Wraps rows with paging info so the frontend can render page controls.
function paginated(rows, total, { page, limit }) {
  return { data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

// Collects WHERE conditions and their parameters:
//   const f = filters(); f.add('status = ?', 'pending'); f.sql() -> "WHERE status = ?"; f.params -> ['pending']
// SQL fragments passed to add() must be written in code; only values come from users.
function filters() {
  const where = [];
  const params = [];
  return {
    params,
    add(sql, ...values) {
      where.push(sql);
      params.push(...values);
    },
    sql() {
      return where.length ? `WHERE ${where.join(' AND ')}` : '';
    },
  };
}

module.exports = { parsePagination, parseSort, paginated, filters };
