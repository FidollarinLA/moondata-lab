import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { root } from '../scripts/toolchain.mjs';

export async function startLocalModel({ port = 4324 } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local model port');
  let config;
  try { config = JSON.parse(await readFile(resolve(root, '.local/local-model.json'), 'utf8')); }
  catch { throw new Error('本地模型文件未准备好，请先运行 node scripts/setup-local-model.mjs'); }
  const child = spawn(config.runtime, ['--model', config.model, '--alias', config.modelName, '--host', '127.0.0.1', '--port', String(port), '--ctx-size', '8192', '--threads', '6', '--n-gpu-layers', '0', '--parallel', '1', '--reasoning', 'off', '--no-webui', '--log-disable'], { cwd: root, windowsHide: true, stdio: 'ignore' });
  let failure = null; child.on('error', e => { failure = e; });
  const origin = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (failure || child.exitCode !== null) throw new Error('本地模型启动失败，请检查端口占用与运行文件');
      try { const r = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(500) }); if (r.ok) return { child, model: config.modelName, origin, stop: () => child.kill() }; } catch {}
    }
    throw new Error('本地模型启动超时');
  } catch (e) { child.kill(); throw e; }
}
