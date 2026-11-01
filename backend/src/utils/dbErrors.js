const HttpError = require('./httpError');

// Turns raw MySQL errors into clean HTTP errors. Anything not listed here is
// returned unchanged and ends up as a generic 500 (details only in the server log).
function mapDbError(err) {
  switch (err.code) {
    case 'ER_DUP_ENTRY':
      return new HttpError(409, 'A record with the same unique value already exists');
    case 'ER_NO_REFERENCED_ROW_2':
      return new HttpError(400, 'Referenced record does not exist');
    case 'ER_ROW_IS_REFERENCED_2':
      return new HttpError(409, 'Record is still referenced by other records');
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return new HttpError(400, 'Value violates a database constraint');
    case 'ER_SIGNAL_EXCEPTION':
      // Raised on purpose by our triggers/procedures (e.g. "Insufficient supply").
      return new HttpError(409, err.sqlMessage || 'Operation rejected by the database');
    case 'ER_DATA_TOO_LONG':
    case 'ER_BAD_NULL_ERROR':
    case 'ER_WARN_DATA_OUT_OF_RANGE':
    case 'ER_TRUNCATED_WRONG_VALUE':
    case 'WARN_DATA_TRUNCATED':
      return new HttpError(400, 'Invalid value for one of the fields');
    default:
      return err;
  }
}

module.exports = mapDbError;
