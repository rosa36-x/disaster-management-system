// Shared test harness. Starts the real Express app, but replaces both databases with
// recording fakes, so tests are fast and need no MySQL or MongoDB running.
//   - h.handler(sql, params): what the fake MySQL returns
//   - h.mongo: operations recorded by the fake MongoDB, and h.mongo.results to configure answers
// Every SQL statement the app sends is also run through a MySQL syntax parser.
const path = require('path');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { Parser } = require('node-sql-parser');

const root = path.resolve(__dirname, '..', '..');
Object.assign(process.env, {
  MYSQL_HOST: 'x', MYSQL_USER: 'x', MYSQL_DATABASE: 'x',
  MONGO_URI: 'mongodb://127.0.0.1:1', MONGO_DB: 'x', JWT_SECRET: 'test-secret',
});

// ---------- fake MySQL
const h = { calls: [], allCalls: [], handler: () => [[]], ObjectId };
const run = async (sql, params) => {
  h.calls.push({ sql, params });
  h.allCalls.push({ sql, params });
  return h.handler(sql, params);
};
const fakePool = { query: run, async getConnection() { return { query: run, release() {} }; } };
const mysqlPath = path.join(root, 'src/db/mysql.js');
require.cache[require.resolve(mysqlPath)] = { id: mysqlPath, filename: mysqlPath, loaded: true, exports: fakePool };

// ---------- fake MongoDB
const m = { ops: [], results: {} };
const R = (key, dflt) => {
  const v = m.results[key];
  return v === undefined ? dflt : typeof v === 'function' ? v() : v;
};
function collection(name) {
  return {
    find(filter) {
      const op = { coll: name, op: 'find', filter };
      m.ops.push(op);
      const cursor = {
        sort(s) { op.sort = s; return cursor; },
        skip(n) { op.skip = n; return cursor; },
        limit(n) { op.limit = n; return cursor; },
        async toArray() { return R(name + '.find', []); },
      };
      return cursor;
    },
    async countDocuments(filter) { m.ops.push({ coll: name, op: 'count', filter }); return R(name + '.count', 0); },
    async findOne(filter) { m.ops.push({ coll: name, op: 'findOne', filter }); return R(name + '.findOne', null); },
    async insertOne(doc) {
      m.ops.push({ coll: name, op: 'insertOne', doc });
      R(name + '.insertOne');
      doc._id = new ObjectId(); // the real driver also adds _id to the document
      return { insertedId: doc._id };
    },
    async updateOne(filter, update) { m.ops.push({ coll: name, op: 'updateOne', filter, update }); return R(name + '.updateOne', { matchedCount: 1 }); },
    async deleteOne(filter) { m.ops.push({ coll: name, op: 'deleteOne', filter }); return R(name + '.deleteOne', { deletedCount: 1 }); },
    aggregate(pipeline) { m.ops.push({ coll: name, op: 'aggregate', pipeline }); return { async toArray() { return R(name + '.aggregate', []); } }; },
  };
}
h.mongo = m;
const mongoPath = path.join(root, 'src/db/mongo.js');
require.cache[require.resolve(mongoPath)] = {
  id: mongoPath, filename: mongoPath, loaded: true,
  exports: { client: {}, async connectMongo() {}, getMongoDb: () => ({ collection }) },
};

const app = require(path.join(root, 'src/app.js'));

// ---------- helpers
const token = (role, id = 1) => jwt.sign({ username: role, role }, 'test-secret', { subject: String(id), expiresIn: '1h' });
h.T = { admin: token('admin'), logistics: token('logistics_manager', 2), field: token('field_worker', 3) };
h.dbErr = (code, sqlMessage) => () => { const e = new Error(code); e.code = code; e.sqlMessage = sqlMessage; throw e; };
h.listHandler = (rows, total) => (sql) => (sql.includes('COUNT(*)') ? [[{ total }]] : [rows]);

// Runs `body(call, check)` against the app, then syntax-checks every SQL statement used.
h.start = (port, body) => {
  const server = app.listen(port, async () => {
    const call = async (method, url, b, tok) => {
      const r = await fetch(`http://localhost:${port}` + url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
        body: b ? JSON.stringify(b) : undefined,
      });
      const text = await r.text();
      return { status: r.status, body: text ? JSON.parse(text) : null };
    };
    let fails = 0;
    const check = (name, cond, extra = '') => {
      if (!cond) fails++;
      console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
    };
    await body(call, check);

    const parser = new Parser();
    const seen = new Set(h.allCalls.map((c) => c.sql));
    let bad = 0;
    for (const sql of seen) {
      if (/^\s*CALL /i.test(sql) || /GET_LOCK|RELEASE_LOCK/i.test(sql)) continue;
      try { parser.astify(sql.replace(/\?/g, '1'), { database: 'mysql' }); }
      catch (e) { bad++; console.log('FAIL syntax: ' + sql.replace(/\s+/g, ' ').slice(0, 200) + '\n   ' + e.message.split('\n')[0]); }
    }
    check(`all ${seen.size} distinct SQL statements parse as MySQL`, bad === 0);
    console.log(fails ? `\n${fails} FAILED` : '\nall passed');
    server.close();
    process.exit(fails ? 1 : 0);
  });
};

module.exports = h;
