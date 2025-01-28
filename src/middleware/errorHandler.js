// Global error handling middleware
// Does not log or expose PHI.
import AppError from '../utils/AppError.js';
import { logErrorToFile } from '../utils/logger.js';

const errorHandler = (err, req, res, next) => {
  // Log technical details to file (no PHI from body is recorded)
  logErrorToFile(err, req);

  let error = err;
  error.statusCode = error.statusCode || 500;
  error.message = error.message || 'Internal Server Error';

  // Multer / busboy upload limits
  // Multer sets err.name === 'MulterError' with codes like LIMIT_FILE_SIZE / LIMIT_FIELD_VALUE.
  if (error?.name === 'MulterError') {
    const code = error.code;
    const message =
      code === 'LIMIT_FILE_SIZE'
        ? 'Uploaded file is too large'
        : code === 'LIMIT_FIELD_VALUE' || code === 'LIMIT_FIELD_KEY'
          ? 'Request fields are too large'
          : code === 'LIMIT_UNEXPECTED_FILE'
            ? 'Unexpected file field'
            : 'Upload failed';
    error = new AppError(message, 413);
  }

  // busboy may throw these codes for oversized multipart payloads
  if (error?.code === 'LIMIT_FIELD_SIZE' || error?.code === 'LIMIT_FILE_SIZE') {
    error = new AppError('Request entity too large', 413);
  }

  // Mongoose bad ObjectId
  if (error.name === 'CastError') {
    const message = `Resource not found. Invalid: ${error.path}`;
    error = new AppError(message, 400);
  }

  // Mongoose duplicate key
  if (error.code === 11000) {
    const message = `Duplicate ${Object.keys(error.keyValue)} entered`;
    error = new AppError(message, 400);
  }

  // Wrong JWT token
  if (error.name === 'JsonWebTokenError' || error.name === 'JSONWebTokenError') {
    const message = 'JSON Web Token is invalid, try again';
    error = new AppError(message, 400);
  }

  // JWT expired
  if (error.name === 'TokenExpiredError') {
    const message = 'JSON Web Token is expired, try again';
    error = new AppError(message, 400);
  }

  const payload = {
    success: false,
    message: error.message || 'Internal Server Error',
  };
  if (error.code) {
    payload.code = error.code;
  }
  res.status(error.statusCode).json(payload);
};

export default errorHandler;
