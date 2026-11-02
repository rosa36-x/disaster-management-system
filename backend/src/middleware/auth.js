const jwt = require('jsonwebtoken');
const { jwt: cfg } = require('../config/env');
const HttpError = require('../utils/httpError');

// Requires a valid "Authorization: Bearer <token>" header.
// On success, attaches the decoded user to req.user.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Authentication required'));
  }

  try {
    const payload = jwt.verify(token, cfg.secret);
    req.user = { id: payload.sub, username: payload.username, role: payload.role };
    next();
  } catch (err) {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}

// Use after requireAuth: allows only the listed roles.
//   router.post('/match', requireAuth, requireRole('admin', 'logistics_manager'), handler)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'You do not have permission to do this'));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
