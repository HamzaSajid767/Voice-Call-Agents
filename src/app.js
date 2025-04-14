import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { globalApiRateLimit } from './config/rateLimitConfig.js';
import corsMiddleware from './middleware/corsMiddleware.js';
import errorHandler from './middleware/errorHandler.js';

import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('trust proxy', 1);

app.use(corsMiddleware);

// Allow uploaded assets (e.g. cover images) to be embedded cross-origin
// (direct navigation works regardless; embedding can be blocked by CORP).
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
app.use(compression());

const limiter = rateLimit({
  windowMs: globalApiRateLimit.windowMs,
  max: globalApiRateLimit.max,
  // Preflight must not consume the limit or fail without CORS headers.
  skip: (req) =>
    req.method === 'OPTIONS' ||
    // Extension may call this many times per scrape; dedicated limiter on the route handles abuse.
    String(req.originalUrl || req.url || '').includes('/licenses/scrape-consume'),
});

app.use('/api', limiter);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

if (process.env.NODE_ENV !== 'test') {
  const logFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
  app.use(morgan(logFormat));
}

// Multer stores uploads in `backend/uploads`; serve that directory at `/uploads`.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res, next) => {
  res.status(404).json({ message: 'Not found' });
});

app.use(errorHandler);

export default app;
