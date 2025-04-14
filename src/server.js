import 'dotenv/config';
import http from 'http';
import connectDB from './config/db.js';
import app from './app.js';

const PORT = process.env.PORT || 3010;

const start = async () => {
  await connectDB();
  const server = http.createServer(app);
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on port ${PORT}`);
  });

  process.on('unhandledRejection', (err) => {
    // eslint-disable-next-line no-console
    console.error('UNHANDLED REJECTION', err);
    server.close(() => {
      process.exit(1);
    });
  });

  process.on('SIGTERM', () => {
    // eslint-disable-next-line no-console
    console.log('SIGTERM RECEIVED. Shutting down gracefully.');
    server.close(() => {
      process.exit(0);
    });
  });
};

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Startup failed', err.message);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('UNCAUGHT EXCEPTION', err);
  process.exit(1);
});
