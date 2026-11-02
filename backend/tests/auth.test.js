const path = require('path');
const root = path.resolve(__dirname, '..');
process.env.MYSQL_HOST='x'; process.env.MYSQL_USER='x'; process.env.MYSQL_DATABASE='x';
process.env.MONGO_URI='mongodb://127.0.0.1:1'; process.env.MONGO_DB='x'; process.env.JWT_SECRET='test-secret';

const users = {
  admin: { user_id:1, username:'admin', full_name:'System Administrator', role:'admin', password_hash:'$2b$10$ZgHzW50/4sEyTDN/WtRvOO7mMv5rqbDQQBr2Jxj4TAoqgl/HTj9K.' },
  logistics: { user_id:2, username:'logistics', full_name:'Logistics Manager', role:'logistics_manager', password_hash:'$2b$10$zacEYkVoSbjUNt8lxqOk9.AqJjw3YxKHbwy5CjruzvsJxJBCzZOfS' },
  fieldworker: { user_id:3, username:'fieldworker', full_name:'Field Worker', role:'field_worker', password_hash:'$2b$10$33Y3T.9H9pUj7ny6RTfrcOXqHEu/2XAh2Tm/j.5hdk1tEt0qRZ7X.' },
};
const fakePool = { async query(sql, params) {
  if (sql.startsWith('SELECT')) return [users[params[0]] ? [users[params[0]]] : []];
  if (sql.startsWith('INSERT')) {
    if (users[params[0]]) { const e = new Error('dup'); e.code='ER_DUP_ENTRY'; throw e; }
    return [{ insertId: 4 }];
  }
}};
const p = path.join(root,'src/db/mysql.js');
require.cache[require.resolve(p)] = { id:p, filename:p, loaded:true, exports:fakePool };

const app = require(path.join(root,'src/app.js'));
const s = app.listen(4101, async () => {
  const call = async (method, url, body, token) => {
    const r = await fetch('http://localhost:4101'+url, { method, headers:{ 'Content-Type':'application/json', ...(token?{Authorization:'Bearer '+token}:{}) }, body: body?JSON.stringify(body):undefined });
    return { status:r.status, body: await r.json() };
  };
  let fails = 0;
  const check = (name, cond, extra='') => { if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(cond?'':'  '+extra)); };

  const a = await call('POST','/api/auth/login',{username:'admin',password:'Admin@123'});
  check('admin login 200 + token', a.status===200 && a.body.token && a.body.user.role==='admin', JSON.stringify(a));
  const l = await call('POST','/api/auth/login',{username:'logistics',password:'Logistics@123'});
  check('logistics login (seed hash)', l.status===200 && l.body.user.role==='logistics_manager');
  const f = await call('POST','/api/auth/login',{username:'fieldworker',password:'Field@123'});
  check('fieldworker login (seed hash)', f.status===200 && f.body.user.role==='field_worker');
  check('response has no password_hash', !JSON.stringify(a.body).includes('password_hash'));

  const bad = await call('POST','/api/auth/login',{username:'admin',password:'wrong'});
  const unk = await call('POST','/api/auth/login',{username:'nobody',password:'whatever1'});
  check('wrong password 401', bad.status===401);
  check('unknown user 401, same message', unk.status===401 && unk.body.error===bad.body.error);
  const nob = await call('POST','/api/auth/login',{});
  check('missing body 400', nob.status===400);

  check('/me no token 401', (await call('GET','/api/auth/me')).status===401);
  check('/me garbage token 401', (await call('GET','/api/auth/me',null,'abc.def.ghi')).status===401);
  const me = await call('GET','/api/auth/me',null,a.body.token);
  check('/me valid token', me.status===200 && me.body.user.username==='admin' && me.body.user.role==='admin' && me.body.user.id==='1', JSON.stringify(me));

  const nv = { username:'newworker', password:'Password123', full_name:'New Worker', role:'field_worker' };
  check('register as field_worker 403', (await call('POST','/api/auth/register',nv,f.body.token)).status===403);
  check('register as logistics 403', (await call('POST','/api/auth/register',nv,l.body.token)).status===403);
  check('register no token 401', (await call('POST','/api/auth/register',nv)).status===401);
  const ok = await call('POST','/api/auth/register',nv,a.body.token);
  check('register as admin 201', ok.status===201 && ok.body.user.id===4 && ok.body.user.role==='field_worker', JSON.stringify(ok));
  check('register duplicate 409', (await call('POST','/api/auth/register',{...nv,username:'admin'},a.body.token)).status===409);
  check('register bad role 400', (await call('POST','/api/auth/register',{...nv,role:'superuser'},a.body.token)).status===400);
  check('register short password 400', (await call('POST','/api/auth/register',{...nv,password:'short'},a.body.token)).status===400);
  check('register short username 400', (await call('POST','/api/auth/register',{...nv,username:'ab'},a.body.token)).status===400);

  console.log(fails? `\n${fails} FAILED` : '\nall passed');
  s.close(); process.exit(fails?1:0);
});
