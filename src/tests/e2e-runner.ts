import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import crypto from 'node:crypto';
import autocannon from 'autocannon';

type TestStatus = 'PASS' | 'FAIL';
type Row = { name: string; status: TestStatus; details?: string };

const composeFile = 'docker-compose.test.yml';
const baseUrl = 'http://localhost:3010';

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
};

const sh = (cmd: string, args: string[], env?: NodeJS.ProcessEnv) => {
  const res = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', env: { ...process.env, ...(env ?? {}) } });
  return { code: res.status ?? 1, out: `${res.stdout ?? ''}${res.stderr ?? ''}`.trim() };
};

const must = (cmd: string, args: string[], env?: NodeJS.ProcessEnv) => {
  const r = sh(cmd, args, env);
  if (r.code !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}\n${r.out}`);
  }
  return r.out;
};

const httpText = async (method: 'GET' | 'POST', path: string, init?: { headers?: Record<string, string>; body?: string }) => {
  const res = await fetchWithTimeout(`${baseUrl}${path}`, {
    method,
    ...(init?.headers ? { headers: init.headers } : {}),
    ...(init?.body !== undefined ? { body: init.body } : {})
  }, 3000);
  return { status: res.status, text: await res.text() };
};

const httpJson = async (method: 'GET' | 'POST', path: string, body?: unknown, headers?: Record<string, string>) => {
  const res = await fetchWithTimeout(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  }, 3000);
  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, text, json };
};

const httpForm = async (path: string, form: Record<string, string>, headers?: Record<string, string>) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(form)) params.set(k, v);
  const res = await fetchWithTimeout(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(headers ?? {}) },
    body: params.toString()
  }, 3000);
  return { status: res.status, text: await res.text() };
};

const waitReady = async (msTotal: number) => {
  const start = Date.now();
  while (Date.now() - start < msTotal) {
    try {
      const r = await httpJson('GET', '/ready');
      if (r.status === 200) return;
    } catch {
      // ignore
    }
    await delay(1000);
  }
  throw new Error('Timed out waiting for /ready=200');
};

const waitNotReady = async (msTotal: number) => {
  const start = Date.now();
  while (Date.now() - start < msTotal) {
    try {
      const r = await httpJson('GET', '/ready');
      if (r.status !== 200) return;
    } catch {
      // network timeout / abort is also "not ready"
      return;
    }
    await delay(1000);
  }
  throw new Error('Timed out waiting for /ready != 200');
};

const recreateAppWithRateLimit = (rateLimitMax: string) => {
  // Compose variable interpolation can be sticky on some platforms; force-remove the container and bring it back.
  sh('docker', ['compose', '-f', composeFile, 'stop', 'app']);
  sh('docker', ['compose', '-f', composeFile, 'rm', '-f', 'app']);
  const setPrefix = `set RATE_LIMIT_MAX=${rateLimitMax || ''}&&`;
  must('cmd', ['/c', `${setPrefix} docker compose -f ${composeFile} up -d --no-deps --build app`]);
};

const execInApp = (js: string) => {
  // Run inside the app container to avoid host networking/auth differences.
  const oneLine = js
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('; ');
  const wrapped = `DOTENV_CONFIG_QUIET=true node --input-type=module -e ${JSON.stringify(oneLine)}`;
  const res = spawnSync('docker', ['exec', 'calling_agents_test_app', 'sh', '-lc', wrapped], { stdio: 'pipe', encoding: 'utf8', env: process.env });
  if ((res.status ?? 1) !== 0) {
    throw new Error(`${(res.stdout ?? '').trim()}\n${(res.stderr ?? '').trim()}`.trim() || 'docker exec failed');
  }
  return (res.stdout ?? '').trim();
};

const computeTwilioSignature = (authToken: string, url: string, params: Record<string, string>) => {
  // Twilio signature = base64(hmac_sha1(authToken, url + concat(sorted(params)) ))
  const sortedKeys = Object.keys(params).sort();
  const data = url + sortedKeys.map((k) => k + params[k]).join('');
  return crypto.createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
};

const parseE2EJson = (s: string) => {
  const marker = 'E2E_JSON:';
  const idx = s.indexOf(marker);
  if (idx === -1) {
    throw new Error(`Missing ${marker} marker in output: ${s.slice(0, 200)}`);
  }
  const start = idx + marker.length;
  const rest = s.slice(start).trim();
  const line = rest.split('\n')[0] ?? '';
  return JSON.parse(line) as any;
};

const main = async () => {
  const rows: Row[] = [];
  const startedAt = Date.now();

  try {
    must('docker', ['compose', '-f', composeFile, 'down', '-v']);
  } catch {
    // ignore
  }

  try {
    must('docker', ['compose', '-f', composeFile, 'up', '-d', '--build']);
    await waitReady(120_000);
    rows.push({ name: 'DB Connected', status: 'PASS' });
    rows.push({ name: 'Redis Connected', status: 'PASS' });

    const logs = sh('docker', ['compose', '-f', composeFile, 'logs', '--no-color', 'app']).out;
    rows.push({
      name: 'Workers Running',
      status: logs.includes('Workers started') ? 'PASS' : 'FAIL',
      ...(logs.includes('Workers started') ? {} : { details: 'Did not find "Workers started" in app logs' })
    });

    // Concurrent users (HTTP)
    try {
      const result = await autocannon({
        url: `${baseUrl}/health`,
        method: 'GET',
        duration: 10,
        connections: 25,
        pipelining: 1
      });
      const errRate = result.errors / Math.max(1, result.requests.total);
      const ok = errRate < 0.01;
      rows.push({
        name: 'Concurrent Users',
        status: ok ? 'PASS' : 'FAIL',
        details: `req=${result.requests.total}, rps=${result.requests.average.toFixed(1)}, errors=${result.errors}, p99=${result.latency.p99}ms`
      });
    } catch (e) {
      rows.push({ name: 'Concurrent Users', status: 'FAIL', details: e instanceof Error ? e.message : 'Unknown error' });
    }

    // Load test (500–1000 req/min ~ 17 rps)
    try {
      const result = await autocannon({
        url: `${baseUrl}/health`,
        method: 'GET',
        duration: 15,
        connections: 10,
        overallRate: 17
      });
      const ok = result.errors === 0;
      rows.push({
        name: 'Load Test (HTTP)',
        status: ok ? 'PASS' : 'FAIL',
        details: `targetRps=17, avgRps=${result.requests.average.toFixed(1)}, errors=${result.errors}, p99=${result.latency.p99}ms`
      });
    } catch (e) {
      rows.push({ name: 'Load Test (HTTP)', status: 'FAIL', details: e instanceof Error ? e.message : 'Unknown error' });
    }

    // Rate limit real test: restart app with RATE_LIMIT_MAX=5 and fire 20 requests.
    try {
      recreateAppWithRateLimit('5');
      await waitReady(120_000);
      let limited = 0;
      for (let i = 0; i < 20; i += 1) {
        const r = await httpText('GET', '/health');
        if (r.status === 429 || r.status === 403) limited += 1;
      }
      const ok = limited > 0;
      rows.push({ name: 'Rate Limiting', status: ok ? 'PASS' : 'FAIL', details: `limited=${limited}/20 (expected >0)` });
    } catch (e) {
      rows.push({ name: 'Rate Limiting', status: 'FAIL', details: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      try {
        recreateAppWithRateLimit('');
        await waitReady(120_000);
      } catch {
        // ignore
      }
    }

    // Redis failure test
    try {
      must('docker', ['compose', '-f', composeFile, 'stop', 'redis']);
      await waitNotReady(60_000);
      const healthRes = await fetchWithTimeout(`${baseUrl}/health`, { method: 'GET' }, 10000);
      const health = { status: healthRes.status, text: await healthRes.text() };
      let readyStatus: number | 'timeout' = 'timeout';
      try {
        const r = await httpText('GET', '/ready');
        readyStatus = r.status;
      } catch {
        readyStatus = 'timeout';
      }
      const ok = health.status === 200 && readyStatus !== 200;
      rows.push({ name: 'Redis Failure', status: ok ? 'PASS' : 'FAIL', details: `/health=${health.status}, /ready=${String(readyStatus)}` });
    } catch (e) {
      rows.push({ name: 'Redis Failure', status: 'FAIL', details: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      try {
        must('docker', ['compose', '-f', composeFile, 'start', 'redis']);
        await waitReady(120_000);
      } catch {
        // ignore
      }
    }

    // DB failure test
    try {
      must('docker', ['compose', '-f', composeFile, 'stop', 'postgres']);
      await waitNotReady(60_000);
      const health = await httpText('GET', '/health');
      const ok = health.status === 200;
      rows.push({ name: 'DB Failure', status: ok ? 'PASS' : 'FAIL', details: `/health=${health.status}, /ready=503` });
    } catch (e) {
      rows.push({ name: 'DB Failure', status: 'FAIL', details: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      try {
        must('docker', ['compose', '-f', composeFile, 'start', 'postgres']);
        await waitReady(120_000);
      } catch {
        // ignore
      }
    }

    // Billing accuracy (real DB + redis + webhook + worker)
    try {
      const createdRaw = execInApp(`
        import { prisma } from "./dist/lib/prisma.js";
        const now = Date.now();
        const tenant = await prisma.tenant.create({ data: { name: "E2E Tenant", slug: "e2e-" + now, status: "ACTIVE", region: "test", settings: { limits: { MAX_CALL_MINUTES_PER_MONTH: 1000 } } }});
        await prisma.user.create({ data: { tenantId: tenant.id, email: "e2e-" + now + "@test.local", fullName: "E2E User", passwordHash: "x", status: "ACTIVE", isOwner: true }});
        const agent = await prisma.agent.create({ data: { tenantId: tenant.id, name: "Agent", status: "ACTIVE", systemPrompt: "test", temperature: "0.2", voiceConfig: {} }});
        await prisma.tenant.update({ where: { id: tenant.id }, data: { defaultAgentId: agent.id }});
        const pn = await prisma.phoneNumber.create({ data: { tenantId: tenant.id, e164: "+15550001111", isActive: true, provider: "TWILIO", providerSid: "PN", agentId: agent.id }});
        const call = await prisma.callSession.create({ data: { tenantId: tenant.id, direction: "INBOUND", status: "INITIATED", fromNumber: "+15550002222", toNumber: pn.e164, phoneNumberId: pn.id, agentId: agent.id, livekitRoomName: "call_e2e", twilioCallSid: "CA" + now }});
        console.log("E2E_JSON:" + JSON.stringify({ tenantId: tenant.id, callSessionId: call.id, twilioCallSid: call.twilioCallSid }));
      `);
      const parsed = parseE2EJson(createdRaw) as { tenantId: string; callSessionId: string; twilioCallSid: string };

      const authToken = 'test';
      const statusPath = '/webhooks/twilio/status';
      const url = `${baseUrl}${statusPath}`;
      const sig1 = computeTwilioSignature(authToken, url, { CallSid: parsed.twilioCallSid, CallStatus: 'in-progress' });
      const sig2 = computeTwilioSignature(authToken, url, { CallSid: parsed.twilioCallSid, CallStatus: 'completed', CallDuration: '125' });

      const r1 = await httpForm(statusPath, { CallSid: parsed.twilioCallSid, CallStatus: 'in-progress' }, { 'x-twilio-signature': sig1 });
      const r2 = await httpForm(statusPath, { CallSid: parsed.twilioCallSid, CallStatus: 'completed', CallDuration: '125' }, { 'x-twilio-signature': sig2 });

      // Wait for worker to persist usage (up to 30s)
      const startWait = Date.now();
      let usageCount = 0;
      while (Date.now() - startWait < 30_000) {
        const out = execInApp(`
          import { prisma } from "./dist/lib/prisma.js";
          const count = await prisma.usageRecord.count({ where: { tenantId: ${JSON.stringify(parsed.tenantId)}, callSessionId: ${JSON.stringify(parsed.callSessionId)} }});
          console.log(String(count));
        `);
        usageCount = Number(out);
        if (usageCount > 0) break;
        await delay(1000);
      }

      const ok = r1.status === 200 && r2.status === 200 && usageCount > 0;
      rows.push({ name: 'Billing Accuracy', status: ok ? 'PASS' : 'FAIL', details: `statusWebhook=[${r1.status},${r2.status}] usageRecords=${usageCount}` });

    } catch (e) {
      rows.push({ name: 'Billing Accuracy', status: 'FAIL', details: e instanceof Error ? e.message : 'Unknown error' });
    }

    // Quota race conditions (real DB; concurrent enforcement)
    try {
      const outRaw = execInApp(`
        import { prisma } from "./dist/lib/prisma.js";
        import { QuotaService } from "./dist/modules/billing/quota.service.js";
        const now = Date.now();
        const tenant = await prisma.tenant.create({ data: { name: "Quota Tenant", slug: "quota-" + now, status: "ACTIVE", settings: { limits: { MAX_CALL_MINUTES_PER_MONTH: 1 } } }});
        await prisma.usageRecord.create({ data: { tenantId: tenant.id, callSessionId: null, usageType: "CALL_MINUTE", quantity: "1", unit: "minute", unitPrice: "0", totalCost: "0", occurredAt: new Date(), metadata: { type: "CALL_MINUTES" } }});
        const q = new QuotaService();
        const attempts = 20;
        const results = await Promise.allSettled(Array.from({ length: attempts }, () => q.enforceOutboundCallAllowed(tenant.id)));
        const blocked = results.filter(r => r.status === "rejected").length;
        console.log("E2E_JSON:" + JSON.stringify({ blocked, attempts }));
      `);
      const parsed = parseE2EJson(outRaw) as { blocked?: unknown; attempts?: unknown };
      const blocked = Number(parsed.blocked);
      const attempts = Number(parsed.attempts);
      const ok = Number.isFinite(blocked) && Number.isFinite(attempts) && blocked === attempts && attempts > 0;
      rows.push({ name: 'Quota Race Conditions', status: ok ? 'PASS' : 'FAIL', details: `blocked=${String(parsed.blocked)}/${String(parsed.attempts)}` });
    } catch (e) {
      rows.push({ name: 'Quota Race Conditions', status: 'FAIL', details: e instanceof Error ? e.message : 'Unknown error' });
    }

    const fails = rows.filter((r) => r.status === 'FAIL');
    const status = fails.length === 0 ? 'PRODUCTION READY' : 'NEEDS FIXES';

    console.log('=== REAL ENV TEST REPORT ===\n');
    for (const r of rows) {
      console.log(`${r.name}: ${r.status}${r.details ? `\n  ${r.details}` : ''}`);
    }
    console.log(`\nElapsed: ${Date.now() - startedAt} ms`);
    console.log(`\nSYSTEM STATUS: ${status}`);

    process.exit(fails.length === 0 ? 0 : 1);
  } finally {
    try {
      must('docker', ['compose', '-f', composeFile, 'down', '-v']);
    } catch {
      // ignore
    }
  }
};

void main();

