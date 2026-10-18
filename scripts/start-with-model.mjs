import { spawnSync } from 'node:child_process';
import { root } from './toolchain.mjs';
const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit', windowsHide: true });
if (build.status !== 0) process.exit(1);
const { startLocalModel } = await import('../server/local-runtime.mjs');
const { createServer } = await import('../server/index.mjs');
console.log('正在载入本地 Qwen 小模型…');
const model = await startLocalModel({ port: Number(process.env.LAB_LOCAL_MODEL_PORT || 4324) });
const server = createServer({ env: { ...process.env, LAB_LOCAL_MODEL_URL: `${model.origin}/v1`, LAB_LOCAL_MODEL_NAME: model.model } });
let closing = false;
function stop() { if (closing) return; closing = true; server.closeAllConnections(); server.close(); model.stop(); }
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, stop);
process.on('exit', () => model.stop());
server.on('error', e => { console.error(`服务启动失败：${e.code || 'unknown'}`); stop(); process.exitCode = 1; });
model.child.on('exit', () => { if (!closing) { console.error('本地模型已停止，请重新启动应用。'); stop(); process.exitCode = 1; } });
server.listen(Number(process.env.PORT || 4321), '127.0.0.1', () => console.log(`MoonData Lab + ${model.model}: http://127.0.0.1:${server.address().port}`));
