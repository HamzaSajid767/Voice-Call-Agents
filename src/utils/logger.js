import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dayjs from 'dayjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logsDir = path.join(__dirname, '..', '..', 'logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Log an error to the daily error log file.
 * @param {Error} err - Error to log
 * @param {object} [reqOrContext] - Express request (for request-scoped errors) or { context: string } for service-level errors (no PHI)
 */
const logErrorToFile = (err, reqOrContext) => {
  const now = dayjs();
  const dateStr = now.format('YYYY-MM-DD');
  const timeStr = now.toISOString();

  const logFilePath = path.join(logsDir, `error-${dateStr}.log`);

  const isContext =
    reqOrContext &&
    typeof reqOrContext === 'object' &&
    typeof reqOrContext.context === 'string' &&
    !reqOrContext.originalUrl;
  const method = isContext ? 'SERVICE' : (reqOrContext?.method ?? '');
  const pathInfo = isContext
    ? reqOrContext.context
    : reqOrContext?.originalUrl || reqOrContext?.url || '';

  const logEntry = {
    time: timeStr,
    method,
    path: pathInfo,
    statusCode: err.statusCode || 500,
    name: err.name,
    message: err.message,
    ...(err.code != null && { code: err.code }),
    stack: err.stack,
  };

  const line = `${JSON.stringify(logEntry)}\n`;

  fs.appendFile(logFilePath, line, (appendErr) => {
    if (appendErr) {
      // eslint-disable-next-line no-console
      console.error('Failed to write error log', appendErr.message);
    }
  });
};

export { logErrorToFile };
