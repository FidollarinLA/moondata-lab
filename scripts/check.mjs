import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { findMoon, root } from './toolchain.mjs';

const moon = await findMoon(), checks = [];
function run(label, command, args) {
  console.log(`\n${label}`);
  const started = performance.now();
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  checks.push({ label, passed: result.status === 0 && !result.error, elapsedMs: Math.round(performance.now() - started), output: `${result.stdout || ''}${result.stderr || ''}`.trim() });
  if (result.error) console.error(result.error.message);
  return checks.at(-1).passed;
}
let passed = run('MoonBit interfaces', moon, ['info']);
passed = run('MoonBit formatting', moon, ['fmt']) && passed;
passed = run('MoonBit JS tests', moon, ['test', '--target', 'js', '--deny-warn']) && passed;
passed = run('MoonBit Wasm GC tests', moon, ['test', '--target', 'wasm-gc', '--deny-warn']) && passed;
passed = run('Build browser/server core', process.execPath, ['scripts/build.mjs']) && passed;
if (passed) passed = run('Server and Agent tests', process.execPath, ['--test', 'test/*.test.mjs']) && passed;
const version = spawnSync(moon, ['version', '--all'], { encoding: 'utf8', cwd: root });
await mkdir(resolve(root, 'artifacts'), { recursive: true });
await writeFile(resolve(root, 'artifacts/verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed, node: process.version, platform: `${process.platform}/${process.arch}`, toolchain: version.stdout?.trim(), checks, modelValidation: 'Protocol stub only; no external model credentials supplied.' }, null, 2));
if (!passed) process.exitCode = 1;
