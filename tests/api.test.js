/**
 * API tests using Jest + supertest.
 * Requires: PostgreSQL, DATABASE_URL, JWT_SECRET, and (for admin tests) seeded admin in DB.
 */
import 'dotenv/config';
import request from 'supertest';
import connectDB from '../src/config/db.js';
import { prisma } from '../src/lib/prisma.js';
import app from '../src/app.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@aktivecycle.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminPass123!';

/** Assert status and show response body when it fails */
function expectStatus(res, status) {
  if (res.status !== status) {
    const bodyStr =
      typeof res.body === 'object' ? JSON.stringify(res.body, null, 2) : String(res.body);
    throw new Error(
      `Expected status ${status}, got ${res.status}.\nResponse body:\n${bodyStr}`,
    );
  }
}

beforeAll(async () => {
  await connectDB();
}, 15000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Register API', () => {
  const unique = `test-${Date.now()}@example.com`;

  test('POST /api/auth/register returns 201 and token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: `user-${Date.now()}`,
        email: unique,
        password: 'TestPass123!',
      })
      .expect('Content-Type', /json/);

    expectStatus(res, 201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe(unique);
  });

  test('POST /api/auth/register with invalid body returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'x',
        email: 'not-an-email',
        password: 'short',
      })
      .expect('Content-Type', /json/);

    expectStatus(res, 400);
    expect(res.body).toHaveProperty('message');
  });

  test('POST /api/auth/register with duplicate email returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'otheruser',
        email: unique,
        password: 'TestPass123!',
      })
      .expect('Content-Type', /json/);

    expectStatus(res, 400);
    expect(res.body.message).toMatch(/email|already/i);
  });
});

describe('Auth API', () => {
  const unique = `test-${Date.now()}@example.com`;
  let token = null;

  test('POST /api/auth/register', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: `user-${Date.now()}`,
        email: unique,
        password: 'TestPass123!',
      })
      .expect('Content-Type', /json/);

    expectStatus(res, 201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe(unique);
    if (res.body.token) token = res.body.token;
  });

  test('POST /api/auth/login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: unique, password: 'TestPass123!' })
      .expect('Content-Type', /json/);

    expectStatus(res, 200);
    expect(res.body).toHaveProperty('token');
    if (res.body.token) token = res.body.token;
  });

  test('GET /api/auth/profile', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /json/);

    expectStatus(res, 200);
    expect(res.body.email).toBe(unique);
  });

  test('PUT /api/auth/profile', async () => {
    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'updateduser' })
      .expect('Content-Type', /json/);

    expectStatus(res, 200);
  });

  test('GET /api/auth/profile with invalid token returns 401', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer invalid');

    expectStatus(res, 401);
  });
});

describe('Admin API (users)', () => {
  let adminToken = null;
  let adminLoginRes = null;

  beforeAll(async () => {
    adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    if (adminLoginRes.status === 200 && adminLoginRes.body?.token)
      adminToken = adminLoginRes.body.token;
  });

  test('POST /api/auth/login (admin)', () => {
    if (!adminToken && adminLoginRes) {
      const bodyStr =
        typeof adminLoginRes.body === 'object'
          ? JSON.stringify(adminLoginRes.body, null, 2)
          : String(adminLoginRes.body);
      throw new Error(
        `Expected admin login to succeed (seed an admin user in PostgreSQL). Status: ${adminLoginRes.status}. Body:\n${bodyStr}`,
      );
    }
    expect(adminToken).toBeTruthy();
  });

  test('GET /api/admin/users requires admin', async () => {
    if (!adminToken) return;
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect('Content-Type', /json/);

    expectStatus(res, 200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/admin/users as non-admin returns 403', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      username: `u-${Date.now()}`,
      email: `user-${Date.now()}@example.com`,
      password: 'TestPass123!',
    });
    const userToken = reg.body?.token;
    if (!userToken) return;
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${userToken}`);
    expectStatus(res, 403);
  });
});

describe('404', () => {
  test('GET /api/not-found returns 404', async () => {
    const res = await request(app).get('/api/not-found');

    expectStatus(res, 404);
    expect(res.body).toHaveProperty('message');
  });
});
