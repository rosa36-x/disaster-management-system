// An Error that carries an HTTP status. The central error handler in app.js
// reads err.status, so routes can just `throw new HttpError(400, 'message')`.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = HttpError;
