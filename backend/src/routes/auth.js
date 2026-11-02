const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/mysql');
const { jwt: cfg } = require('../config/env');
const HttpError = require('../utils/httpError');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ROLES = ['admin', 'logistics_manager', 'field_worker'];
const BCRYPT_COST = 10;

// Compared against when the username doesn't exist, so a missing user and a
// wrong password take about the same time (prevents username enumeration).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

function signToken(user) {
  return jwt.sign(
    { username: user.username, role: user.role },
    cfg.secret,
    { subject: String(user.user_id), expiresIn: cfg.expiresIn }
  );
}

// POST /api/auth/login  { username, password } -> { token, user }
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new HttpError(400, 'username and password are required');
  }

  const [rows] = await pool.query(
    'SELECT user_id, username, full_name, password_hash, role FROM users WHERE username = ?',
    [username]
  );
  const user = rows[0];

  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    throw new HttpError(401, 'Invalid username or password');
  }

  res.json({
    token: signToken(user),
    user: { id: user.user_id, username: user.username, full_name: user.full_name, role: user.role },
  });
});

// GET /api/auth/me -> the logged-in user (from the token)
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/register  { username, password, full_name?, role } -> admin only.
// Field workers and managers don't sign themselves up; an admin creates them.
router.post('/register', requireAuth, requireRole('admin'), async (req, res) => {
  const { username, password, full_name, role } = req.body || {};

  if (typeof username !== 'string' || username.length < 3 || username.length > 50) {
    throw new HttpError(400, 'username must be 3-50 characters');
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw new HttpError(400, 'password must be at least 8 characters');
  }
  if (!ROLES.includes(role)) {
    throw new HttpError(400, `role must be one of: ${ROLES.join(', ')}`);
  }
  if (full_name !== undefined && (typeof full_name !== 'string' || full_name.length > 150)) {
    throw new HttpError(400, 'full_name must be a string up to 150 characters');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    const [result] = await pool.query(
      'INSERT INTO users (username, full_name, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, full_name || null, passwordHash, role]
    );
    res.status(201).json({ user: { id: result.insertId, username, full_name: full_name || null, role } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'Username already exists');
    }
    throw err;
  }
});

module.exports = router;
