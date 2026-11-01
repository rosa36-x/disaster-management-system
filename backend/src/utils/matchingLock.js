const pool = require('../db/mysql');
const HttpError = require('./httpError');

const LOCK_NAME = 'disaster_matching';

// Matching, delivery completion and the stored procedures behind them read and
// then change shared stock and vehicle state. Two of them running at once could
// give the same supply or vehicle to two requests. A MySQL named lock makes them
// take turns. The lock belongs to one connection, so everything runs on `conn`.
async function withMatchingLock(work) {
  const conn = await pool.getConnection();
  let released = false;
  try {
    const [[row]] = await conn.query('SELECT GET_LOCK(?, 5) AS got', [LOCK_NAME]);
    if (row.got !== 1) {
      throw new HttpError(409, 'Another matching operation is in progress, please try again');
    }
    try {
      return await work(conn);
    } finally {
      try {
        await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
        released = true;
      } catch (err) {
        console.error('Failed to release matching lock', err);
      }
    }
  } finally {
    // If the lock couldn't be released, close the connection so MySQL drops it.
    if (released || !conn.destroy) conn.release();
    else conn.destroy();
  }
}

module.exports = withMatchingLock;
