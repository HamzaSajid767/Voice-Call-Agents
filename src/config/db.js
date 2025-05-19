import { prisma } from '../lib/prisma.js';

const connectDB = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }

  try {
    await prisma.$connect();
    // eslint-disable-next-line no-console
    console.log('PostgreSQL connected');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('PostgreSQL connection error', err.message);
    if (process.env.NODE_ENV === 'test') {
      throw err;
    }
    process.exit(1);
  }
};

export default connectDB;
