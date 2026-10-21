import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { root } from './toolchain.mjs';

if (process.platform !== 'win32') throw new Error('This clean-room check exercises the Windows toolchain setup.');
const stage = resolve(root, `.local/source-build-${Date.now()}/source tree with spaces`);
await mkdir(stage, { recursive: true });
const listed = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
if (listed.status !== 0) throw new Error(listed.stderr);
const files = new Set([...listed.stdout.split('\0').filter(Boolean), 'scripts/setup-windows-toolchain.mjs', 'scripts/windows/moon-path-compat.cs']);
for (const file of files) { const destination = resolve(stage, file); await mkdir(dirname(destination), { recursive: true }); await copyFile(resolve(root, file), destination); }
await assert.rejects(readFile(resolve(stage, 'web/engine.js'))); // Ignored output must be rebuilt.
const cache = '.local/moon-official-20261021'; await mkdir(resolve(stage, cache), { recursive: true });
for (const name of ['toolchain.zip', 'core.zip']) await copyFile(resolve(root, cache, name), resolve(stage, cache, name));
const env = { ...process.env };
for (const key of ['MOON', 'MOON_HOME', 'MOON_COMPAT_BIN', 'MOONC_OVERRIDE', 'MOONFMT_OVERRIDE', 'MOONINFO_OVERRIDE', 'LAB_MODEL_URL', 'LAB_LOCAL_MODEL_URL']) delete env[key];
const checks = [], evidence = { checkedAt: new Date().toISOString(), stage, passed: false, caveat: 'Fresh source tree without built engine, toolchain or node_modules. Two pinned archives are seeded to avoid repeated network transfer; this is not an uncached download availability test.' };
function run(script) {
  const result = spawnSync(process.execPath, [script], { cwd: stage, env, encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  checks.push({ script, passed: result.status === 0, output: `${result.stdout || ''}${result.stderr || ''}` });
  if (result.error || result.status !== 0) throw new Error(`${script}: ${result.error?.message || result.stderr || result.status}`);
}
let child;
try {
  run('scripts/setup-windows-toolchain.mjs'); run('scripts/check.mjs');
  assert.equal(JSON.parse(await readFile(resolve(stage, 'artifacts/verification.json'), 'utf8')).passed, true);
  const port = 38000 + Math.floor(Math.random() * 20000);
  child = spawn(process.execPath, ['server/index.mjs'], { cwd: stage, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  let status;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error(`Server stopped: ${output}`);
    try { const response = await fetch(`http://127.0.0.1:${port}/api/status`); status = await response.json(); if (response.ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(status?.version, JSON.parse(await readFile(resolve(stage, 'package.json'), 'utf8')).version);
  assert.equal((await fetch(`http://127.0.0.1:${port}/showcase`)).status, 200);
  checks.push({ script: 'server/index.mjs', passed: true, status: { version: status.version, engine: status.engine } });
  evidence.passed = true;
} finally {
  if (child && child.exitCode === null) { const closed = new Promise(resolve => child.once('exit', resolve)); child.kill(); await closed; }
  await writeFile(resolve(root, 'artifacts/source-build-verification.json'), JSON.stringify({ ...evidence, checks }, null, 2));
}
console.log(`PASS fresh-source setup, dual-backend checks and HTTP startup: ${stage}`);
