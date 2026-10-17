import test from 'node:test';
import assert from 'node:assert/strict';
import { DatasetStore } from '../server/datasets.mjs';
import { modelConfig, modelStatus, runAgent } from '../server/agent.mjs';

function fixture() {
  const store = new DatasetStore(); const d = store.add({ name: 'test.csv', csv: 't,x,private_note\n0,0,UNIQUE_RAW_SECRET_ROW\n1,5,SECRET\n2,10,SECRET\n3,10,SECRET' });
  const selection = { datasetId: d.id, timeColumn: 't', valueColumn: 'x', timeUnit: 's', valueUnit: 'rpm', target: 10, initial: 0, stepTime: 0, bandPercent: 2, tailPercent: 20 };
  return { store, selections: [selection], message: '分析这次响应' };
}
const config = { endpoint: 'https://model.example/v1/chat/completions', model: 'test-model', apiKey: 'DO_NOT_LEAK_KEY' };
const response = message => new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

test('model configuration is opt-in and restricts insecure remote endpoints', () => {
  assert.equal(modelConfig({}), null); assert.equal(modelStatus({}).mode, 'builtin');
  assert.throws(() => modelConfig({ LAB_MODEL_URL: 'http://example.com/v1', LAB_MODEL_NAME: 'x' }));
  assert.throws(() => modelConfig({ LAB_MODEL_URL: 'https://user:pass@example.com/v1', LAB_MODEL_NAME: 'x' }));
  assert.equal(modelConfig({ LAB_MODEL_URL: 'http://127.0.0.1:8000/v1/', LAB_MODEL_NAME: 'x' }).endpoint, 'http://127.0.0.1:8000/v1/chat/completions');
  assert.ok(!JSON.stringify(modelStatus({ LAB_MODEL_URL: 'https://example.com/v1', LAB_MODEL_NAME: 'x', LAB_MODEL_KEY: 'SECRET' })).includes('SECRET'));
});
test('builtin analysis is explicitly labeled and performs no network call', async () => {
  const r = await runAgent({ ...fixture(), config: null, fetchImpl: () => { throw new Error('unexpected network'); } });
  assert.equal(r.mode, 'builtin'); assert.equal(r.artifacts[0].metrics.iae, 10); assert.match(r.answer, /未连接大模型/);
});
test('builtin mode does not pretend to provide training or FFT', async () => {
  const r = await runAgent({ ...fixture(), message: '训练深度学习模型并完成FFT', config: null });
  assert.equal(r.trace.length, 0); assert.match(r.answer, /超出了内置能力/);
});
test('real protocol loop executes tools and sends compact evidence without raw CSV or key leakage', async () => {
  const f = fixture(); let turns = 0; const bodies = [];
  const r = await runAgent({ ...f, config, fetchImpl: async (url, options) => {
    assert.equal(url, config.endpoint); assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, `Bearer ${config.apiKey}`);
    const body = JSON.parse(options.body); bodies.push(body); turns++;
    if (turns === 1) return response({ role: 'assistant', content: null, tool_calls: [call('one', 'inspect_experiments', {})] });
    if (turns === 2) return response({ role: 'assistant', content: null, tool_calls: [call('two', 'analyze_experiment', { dataset_id: f.selections[0].datasetId })] });
    assert.ok(body.messages.some(m => m.role === 'tool' && m.content.includes('"iae":10')));
    assert.ok(!options.body.includes('"points":'));
    return response({ role: 'assistant', content: '已根据工具结果完成分析。' });
  } });
  assert.equal(turns, 3); assert.equal(r.trace.length, 2); assert.equal(r.mode, 'model');
  assert.ok(!JSON.stringify(bodies).includes('UNIQUE_RAW_SECRET_ROW'));
  assert.ok(!JSON.stringify(r).includes(config.apiKey)); assert.equal(r.artifacts[1].metrics.iae, 10);
});
test('tool errors are returned to model and never grant arbitrary execution', async () => {
  const f = fixture(); let turn = 0;
  const r = await runAgent({ ...f, config, fetchImpl: async (_url, options) => {
    if (!turn++) return response({ content: null, tool_calls: [call('one', 'execute_command', { command: 'bad' })] });
    assert.match(options.body, /不支持的工具/); return response({ content: '该操作不受支持。' });
  } });
  assert.equal(r.trace[0].ok, false); assert.equal(r.artifacts.length, 0);
});
test('model answer without computation is marked unverified', async () => {
  const r = await runAgent({ ...fixture(), config, fetchImpl: async () => response({ content: '说明' }) });
  assert.match(r.caveat, /未调用响应计算工具/); assert.equal(r.trace.length, 0);
});
test('invalid JSON empty content and provider errors are sanitized', async () => {
  for (const fetchImpl of [async () => new Response('not json'), async () => response({ content: '' }), async () => new Response('DO_NOT_LEAK_KEY', { status: 401 }), async () => { throw new Error('DO_NOT_LEAK_KEY'); }]) {
    await assert.rejects(runAgent({ ...fixture(), config, fetchImpl }), e => !e.message.includes('DO_NOT_LEAK_KEY'));
  }
});
test('duplicate call IDs and oversized tool batches are rejected', async () => {
  for (const tool_calls of [[call('same', 'inspect_experiments', {}), call('same', 'inspect_experiments', {})], Array.from({ length: 9 }, (_, i) => call(`id${i}`, 'inspect_experiments', {}))]) {
    await assert.rejects(runAgent({ ...fixture(), config, fetchImpl: async () => response({ content: null, tool_calls }) }));
  }
});
test('loop budget stops a model that never finishes', async () => {
  let turns = 0;
  await assert.rejects(runAgent({ ...fixture(), config, fetchImpl: async () => response({ content: null, tool_calls: [call(`c${turns++}`, 'inspect_experiments', {})] }) }), /6 轮/);
  assert.equal(turns, 6);
});
test('oversized provider response is rejected', async () => {
  await assert.rejects(runAgent({ ...fixture(), config, fetchImpl: async () => new Response('a'.repeat(512001)) }), /大小限制/);
});

test('inspection alone is not labeled completed response calculation', async () => {
  let turn = 0;
  const r = await runAgent({ ...fixture(), config, fetchImpl: async () => !turn++ ? response({ content: null, tool_calls: [call('inspect', 'inspect_experiments', {})] }) : response({ content: '已查看数据描述。' }) });
  assert.equal(r.trace[0].ok, true); assert.match(r.caveat, /未调用响应计算工具/);
});

test('response stream errors are sanitized', async () => {
  const stream = new ReadableStream({ start(controller) { controller.error(new Error('DO_NOT_LEAK_KEY')); } });
  await assert.rejects(runAgent({ ...fixture(), config, fetchImpl: async () => new Response(stream) }), /响应读取失败/);
});

test('unrelated builtin questions do not fabricate an analysis', async () => {
  const r = await runAgent({ ...fixture(), message: '请写一首诗', config: null });
  assert.equal(r.trace.length, 0); assert.match(r.answer, /有限的分析操作/);
});
