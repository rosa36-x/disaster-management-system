const pool = require('../db/mysql');

// Small INSERT/UPDATE helpers. Table and column names must come from code
// (validated schemas), never from user input; only the values are user data.

async function insertRow(table, data) {
  const columns = Object.keys(data);
  const [result] = await pool.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((c) => data[c])
  );
  return result.insertId;
}

async function updateRow(table, idColumn, id, data) {
  const columns = Object.keys(data);
  const [result] = await pool.query(
    `UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE ${idColumn} = ?`,
    [...columns.map((c) => data[c]), id]
  );
  return result;
}

module.exports = { insertRow, updateRow };
