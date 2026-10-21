import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { AppError } from './core.mjs';
import { DatasetStore } from './datasets.mjs';
import { analyze, compare, normalizeSelection, series } from './tools.mjs';
import { modelConfig, modelStatus, runAgent } from './agent.mjs';
import { makeReport } from './report.mjs';
import { templates, generateDataset, importDataset, profile, explore, dataReport, downloadDataset } from './data.mjs';
import { workbenchAgent } from './workbench-agent.mjs';
import { exportWorkspace, importWorkspace } from './workspace.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const staticFiles = new Map([
  ['/', ['web/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['web/app.js', 'text/javascript; charset=utf-8']],
  ['/chart.js', ['web/chart.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['web/style.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['web/favicon.svg', 'image/svg+xml']],
  ['/showcase', ['docs/showcase/index.html', 'text/html; charset=utf-8']],
  ['/showcase/', ['docs/showcase/index.html', 'text/html; charset=utf-8']],
  ['/showcase/style.css', ['docs/showcase/style.css', 'text/css; charset=utf-8']],
  ['/showcase/scene.js', ['docs/showcase/scene.js', 'text/javascript; charset=utf-8']],
]);
const securityHeaders = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
function send(res, status, data, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, { ...securityHeaders, 'Content-Type': contentType });
  res.end(contentType.startsWith('application/json') ? JSON.stringify(data) : data);
}
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new AppError('请求必须使用 application/json', 415);
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16 * 1024 * 1024) throw new AppError('上传请求超过 16 MiB', 413);
    chunks.push(chunk);
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch { throw new AppError('请求不是有效 JSON 对象'); }
}

export function createServer({ env = process.env, fetchImpl = fetch } = {}) {
  const sessions = new Map();
  const server = http.createServer(async (req, res) => {
    try {
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) throw new AppError('仅支持本机访问', 403);
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && staticFiles.has(url.pathname)) {
        const [path, type] = staticFiles.get(url.pathname);
        send(res, 200, await readFile(resolve(root, path)), type); return;
      }
      if (!url.pathname.startsWith('/api/')) throw new AppError('页面不存在', 404);
      if (!['GET', 'POST', 'DELETE'].includes(req.method)) throw new AppError('不支持的请求方法', 405);
      if (req.method !== 'GET') {
        if (req.headers['x-lab-client'] !== '1') throw new AppError('缺少应用请求标识', 403);
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new AppError('拒绝跨站请求', 403);
      }
      if (url.pathname === '/api/status' && req.method === 'GET') {
        send(res, 200, {
          name: 'MoonData Lab', version: '0.5.2', engine: 'MoonBit', model: modelStatus(env),
          persistence: 'memory+workspace-pack', edition: 'local-table-preview',
          dataPolicy: '本地表格探索预览版：本地小模型仅接收问题、字段信息和当前选择，不发送原始数据行。远程模型模式会发送问题、字段方案和工具摘要，分组结果可能包含类别名称。不承诺任意格式或任意自然语言一次做对。',
        }); return;
      }
      const now = Date.now();
      for (const [key, session] of sessions) if (now - session.lastUsed > 2 * 60 * 60 * 1000 && !session.busy) sessions.delete(key);
      let sessionId = /(?:^|;\s*)lab_session=([a-f0-9]{48})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      if (!sessions.has(sessionId)) {
        if (sessions.size >= 8) throw new AppError('本机会话已满，请关闭旧会话或重启服务', 429);
        sessionId = randomBytes(24).toString('hex');
        sessions.set(sessionId, { store: new DatasetStore(), lastUsed: now, busy: false });
        res.setHeader('Set-Cookie', `lab_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/`);
      }
      const session = sessions.get(sessionId); session.lastUsed = now;
      const store = session.store;
      if (url.pathname === '/api/templates' && req.method === 'GET') { send(res, 200, { templates }); return; }
      if (url.pathname === '/api/import' && req.method === 'POST') { send(res, 201, { dataset: importDataset(store, await body(req)) }); return; }
      if (url.pathname === '/api/generate' && req.method === 'POST') { send(res, 201, { dataset: generateDataset(store, await body(req)) }); return; }
      if (url.pathname === '/api/profile' && req.method === 'POST') { const input = await body(req); send(res, 200, { profile: profile(store, input.datasetId) }); return; }
      if (url.pathname === '/api/explore' && req.method === 'POST') { send(res, 200, { result: explore(store, await body(req)) }); return; }
      if (url.pathname === '/api/data-report' && req.method === 'POST') { send(res, 200, dataReport(store, await body(req))); return; }
      if (url.pathname === '/api/download' && req.method === 'POST') { const input = await body(req); const file = downloadDataset(store, input.datasetId, input.format); send(res, 200, input.format === 'json' ? JSON.parse(file.content) : file.content, file.type); return; }
      if (url.pathname === '/api/workspace/export' && req.method === 'POST') {
        const input = await body(req);
        send(res, 200, { workspace: exportWorkspace(store, input) }); return;
      }
      if (url.pathname === '/api/workspace/import' && req.method === 'POST') {
        if (session.busy) throw new AppError('请先停止当前分析，再导入工作区', 409);
        send(res, 201, importWorkspace(store, await body(req))); return;
      }
      if (url.pathname === '/api/workbench-chat' && req.method === 'POST') {
        if (session.busy) throw new AppError('助手正在运行，请先停止或等待', 409);
        const input = await body(req); session.busy = true;
        const controller = new AbortController(); const disconnected = () => { if (!res.writableEnded) controller.abort(); };
        res.on('close', disconnected);
        try {
          const result = await workbenchAgent({ store, datasetId: input.datasetId, message: input.message, query: input.query, history: input.history, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]), config: modelConfig(env), fetchImpl });
          if (!res.destroyed) send(res, 200, result);
        } finally { session.busy = false; res.off('close', disconnected); }
        return;
      }
      if (url.pathname === '/api/datasets' && req.method === 'GET') { send(res, 200, { datasets: store.list() }); return; }
      if (url.pathname === '/api/datasets' && req.method === 'POST') {
        const input = await body(req);
        send(res, 201, { dataset: store.add({ name: input.name, csv: input.csv, synthetic: false }) }); return;
      }
      if (url.pathname === '/api/demo' && req.method === 'POST') {
        await body(req);
        // Generic synthetic demos for the workbench; motor fixtures remain for historical regression only.
        if (store.datasets.size > 10) throw new AppError('请先删除旧数据，为两份示例腾出位置', 413);
        const names = ['sales-synthetic.csv', 'survey-synthetic.csv'];
        const files = await Promise.all(names.map(name => readFile(resolve(root, 'examples', name), 'utf8')));
        const added = [];
        try { for (let i = 0; i < names.length; i++) added.push(store.add({ name: names[i], csv: files[i], synthetic: true })); }
        catch (e) { for (const d of added) store.remove(d.id); throw e; }
        send(res, 201, { datasets: added }); return;
      }
      const deleteMatch = /^\/api\/datasets\/([a-f0-9-]+)$/.exec(url.pathname);
      if (deleteMatch && req.method === 'DELETE') {
        if (session.busy) throw new AppError('请先停止当前分析，再删除数据', 409);
        store.remove(deleteMatch[1]); send(res, 200, { ok: true }); return;
      }
      if (url.pathname === '/api/analyze' && req.method === 'POST') {
        send(res, 200, { result: analyze(store, await body(req)) }); return;
      }
      if (url.pathname === '/api/compare' && req.method === 'POST') {
        const input = await body(req); send(res, 200, { result: compare(store, input.selections) }); return;
      }
      if (url.pathname === '/api/report' && req.method === 'POST') {
        const input = await body(req);
        if (!Array.isArray(input.selections) || ![1, 2].includes(input.selections.length)) throw new AppError('报告需要一至两份实验');
        const comparison = input.selections.length === 2 ? compare(store, input.selections) : null;
        const results = comparison?.results ?? input.selections.map(s => analyze(store, s));
        send(res, 200, makeReport(results, comparison)); return;
      }
      if (url.pathname === '/api/export-csv' && req.method === 'POST') {
        const selection = normalizeSelection(store, await body(req));
        const { times, values } = series(store, selection);
        const safeHeader = selection.valueColumn.replace(/[\r\n]/g, ' ');
        const header = /^[=+\-@\t]/.test(safeHeader) ? `'${safeHeader}` : safeHeader;
        const csv = `time_s,"${header.replaceAll('"', '""')}"\n` + times.map((t, i) => `${t},${values[i]}`).join('\n') + '\n';
        send(res, 200, csv, 'text/csv; charset=utf-8'); return;
      }
      if (url.pathname === '/api/chat' && req.method === 'POST') {
        if (session.busy) throw new AppError('当前分析正在运行，请等待或停止', 409);
        const input = await body(req);
        session.busy = true;
        const controller = new AbortController();
        const disconnected = () => { if (!res.writableEnded) controller.abort(); };
        res.on('close', disconnected);
        try {
          const config = modelConfig(env);
          const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]);
          const result = await runAgent({ store, selections: input.selections, message: input.message, history: input.history, signal, config, fetchImpl });
          if (!res.destroyed) send(res, 200, result);
        } finally { session.busy = false; res.off('close', disconnected); }
        return;
      }
      throw new AppError('接口不存在', 404);
    } catch (e) {
      if (!res.destroyed && !res.headersSent) send(res, e instanceof AppError ? e.status : 500, { error: e instanceof AppError ? e.message : '服务处理失败，请检查输入或重启服务' });
    }
  });
  server.requestTimeout = 130_000;
  server.headersTimeout = 15_000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4321);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须为 1–65535');
  const server = createServer();
  server.listen(port, '127.0.0.1', () => console.log(`MoonData Lab http://127.0.0.1:${server.address().port}`));
  server.on('error', e => { console.error(`服务启动失败：${e.code || 'unknown'}`); process.exitCode = 1; });
}
