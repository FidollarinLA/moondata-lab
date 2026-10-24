import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalPlan, validateToolCall, AppError } from '../server/core.mjs';
import { DatasetStore } from '../server/datasets.mjs';
import { workbenchTools } from '../server/workbench-agent.mjs';
import { templates } from '../server/data.mjs';

test('canonical plan is stable across key order', () => {
  const a = {
    seed: 42,
    rows: 3,
    columns: [{ kind: 'number', name: 'x', min: 0, max: 1 }],
  };
  const b = {
    columns: [{ max: 1, min: 0, name: 'x', kind: 'number' }],
    rows: 3,
    seed: 42,
  };
  assert.equal(canonicalPlan(a), canonicalPlan(b));
  assert.equal(
    canonicalPlan(a),
    'moondata.generate/1|rows=3|seed=42|columns=[{name=x,kind=number,min=0,max=1}]',
  );
});

test('MoonBit allowlist blocks shell and accepts sales template proposal', () => {
  assert.throws(() => validateToolCall('run_shell', { cmd: 'ls' }), AppError);
  const plan = templates[0];
  assert.equal(validateToolCall('propose_generation', plan).allowed, true);
});

test('workbench execute refuses non-allowlisted tools', () => {
  const store = new DatasetStore();
  const toolkit = workbenchTools(store, null);
  assert.throws(() => toolkit.execute('run_shell', { cmd: 'echo' }), /ContractError|allowlist|Tool/i);
});
