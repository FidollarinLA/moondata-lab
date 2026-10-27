#!/usr/bin/env node
/**
 * Jury smoke: start an ephemeral server and assert /api/status contracts.
 * Usage: node scripts/status-check.mjs
 */
import assert from 'node:assert/strict';
import { createServer } from '../server/index.mjs';

const server = createServer({ env: {} });
await new Promise(r => server.listen(0, '127.0.0.1', r));
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  const status = await (await fetch(`${base}/api/status`)).json();
  assert.equal(status.edition, 'synthetic-contract-workbench');
  assert.equal(status.positioning, 'not-a-dataframe-library');
  assert.equal(status.contracts?.generate, 'moondata.generate/1');
  assert.equal(status.contracts?.explore, 'moondata.explore/1');
  assert.match(String(status.contracts?.planCanonical || ''), /^moondata\.generate\/1\|/);
  assert.match(String(status.contracts?.queryCanonical || ''), /^moondata\.explore\/1\|/);
  assert.equal(status.contracts?.toolAllowlistValidator, 'moondata.contract/validate_tool_call');
  assert.ok(Array.isArray(status.contracts?.tools) && status.contracts.tools.includes('plan_chart'));
  assert.ok(status.jury?.demo && status.jury?.fingerprint && status.jury?.resubmit);
  console.log(JSON.stringify({
    ok: true,
    version: status.version,
    edition: status.edition,
    positioning: status.positioning,
    contracts: status.contracts,
    jury: status.jury,
  }, null, 2));
} finally {
  server.closeAllConnections?.();
  await new Promise(r => server.close(r));
}
