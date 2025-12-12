import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.ts';

describe('admin access control', () => {
  it('rejects /admin with invalid token', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/analytics/overview').set('authorization', 'Bearer invalid');
    expect(res.status).toBe(401);
  });
});

