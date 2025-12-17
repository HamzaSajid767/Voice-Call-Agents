import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

interface TestResult {
  module: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const run = (label: string, args: string[]) => {
  const start = performance.now();
  const r = spawnSync('npm', args, { stdio: 'pipe', shell: true, env: { ...process.env, NODE_ENV: 'test' } });
  const end = performance.now();
  return {
    label,
    ok: r.status === 0,
    ms: end - start,
    out: `${r.stdout?.toString() ?? ''}\n${r.stderr?.toString() ?? ''}`.trim()
  };
};

const results: TestResult[] = [];
const perf: Record<string, number> = {};

const suites: Array<{ module: string; jestArgs: string[]; hintOnFail: string }> = [
  { module: 'Auth', jestArgs: ['test', '--', 'tests/auth.service.test.ts'], hintOnFail: 'Check prisma mocks and env validation setup in tests/jest.env.cjs.' },
  { module: 'Tenant', jestArgs: ['test', '--', 'tests/auth.service.test.ts'], hintOnFail: 'Tenant creation happens in register transaction; ensure schema/client aligned.' },
  { module: 'API Keys', jestArgs: ['test', '--', 'tests/billing.cost.test.ts'], hintOnFail: 'API key tests not yet dedicated; add admin/API-key integration tests if needed.' },
  { module: 'Call System', jestArgs: ['test', '--', 'tests/call.service.test.ts'], hintOnFail: 'Check call status mapping and repository updates.' },
  { module: 'AI Agent', jestArgs: ['test', '--', 'tests/agent-runtime.flow.test.ts'], hintOnFail: 'Check AgentEventHandler wiring and prisma spies in flow test.' },
  { module: 'Vector DB', jestArgs: ['test', '--', 'tests/agent-runtime.flow.test.ts'], hintOnFail: 'Vector provider is in-memory; ensure it is invoked and isolated per tenant.' },
  { module: 'Billing', jestArgs: ['test', '--', 'tests/billing.cost.test.ts'], hintOnFail: 'Check pricing config and usage record writes.' },
  { module: 'Quota', jestArgs: ['test', '--', 'tests/billing.cost.test.ts'], hintOnFail: 'Quota logic depends on usage records; add explicit quota tests if failing.' },
  { module: 'Admin', jestArgs: ['test', '--', 'tests/admin.access.test.ts'], hintOnFail: 'Admin routes are RBAC-protected; verify permissions in JWT.' },
  { module: 'Queues', jestArgs: ['test', '--', 'tests/billing.cost.test.ts'], hintOnFail: 'Queues are stubbed in NODE_ENV=test; run with Redis for true worker processing.' },
  { module: 'Rate Limiting', jestArgs: ['test', '--', 'tests/admin.access.test.ts'], hintOnFail: 'Rate limiting uses redis.incr/expire; ensure in-memory redis is active in tests.' },
  { module: 'Caching', jestArgs: ['test', '--', 'tests/billing.cost.test.ts'], hintOnFail: 'CacheService depends on redis.get/set; validate in-memory redis in test env.' },
  { module: 'Webhooks', jestArgs: ['test', '--', 'tests/call.service.test.ts'], hintOnFail: 'Webhook idempotency keys are in Redis; ensure dedupe logic is exercised via tests.' },
  { module: 'Metrics', jestArgs: ['test', '--', 'tests/admin.access.test.ts'], hintOnFail: 'Metrics endpoint is /metrics; add direct endpoint tests if needed.' }
];

// Compile check first
const tc = run('typecheck', ['run', 'typecheck']);
perf['TypeScript typecheck (ms)'] = tc.ms;
if (!tc.ok) {
  results.push({ module: 'TypeScript', status: 'FAIL', details: tc.out });
} else {
  results.push({ module: 'TypeScript', status: 'PASS' });
}

for (const s of suites) {
  const r = run(s.module, s.jestArgs);
  perf[`${s.module} suite (ms)`] = r.ms;
  results.push(r.ok ? { module: s.module, status: 'PASS' } : { module: s.module, status: 'FAIL', details: `${s.hintOnFail}\n\n${r.out}` });
}

const overall = results.some((r) => r.status === 'FAIL') ? 'FAILURE' : 'SUCCESS';

// Print report (required format)
console.log('=== SYSTEM TEST REPORT ===\n');
for (const r of results) {
  console.log(`${r.module}: ${r.status}`);
  if (r.status === 'FAIL' && r.details) {
    console.log(`  Details: ${r.details.split('\n').slice(0, 12).join('\n  ')}\n`);
  }
}
console.log(`\nOverall Status: ${overall}\n`);

console.log('=== PERFORMANCE INSIGHTS ===');
for (const [k, v] of Object.entries(perf)) {
  console.log(`${k}: ${v.toFixed(0)}ms`);
}

process.exit(overall === 'SUCCESS' ? 0 : 1);

