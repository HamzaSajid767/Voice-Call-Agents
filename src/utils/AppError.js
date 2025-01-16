class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode]
   * @param {string} [code] Stable machine-readable code for clients (optional).
   */
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || undefined;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;

