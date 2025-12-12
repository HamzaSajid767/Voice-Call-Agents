import { describe, expect, it } from '@jest/globals';
import request from 'supertest';

describe('rate limiting under load (test env)', () => {
  it('blocks after threshold', async () => {
    process.env.RATE_LIMIT_GLOBAL_PER_MINUTE = '3';
    const { createApp } = await import('../src/app.ts');
    const app = createApp();

    const r1 = await request(app).get('/health');
    const r2 = await request(app).get('/health');
    const r3 = await request(app).get('/health');
    const r4 = await request(app).get('/health');

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
    expect(r4.status).toBe(403);
  });
});

