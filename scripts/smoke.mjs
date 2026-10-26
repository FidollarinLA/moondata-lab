import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root, findMoon } from './toolchain.mjs';

const moon = await findMoon();
function run(label, command, args) {
  console.log(`\n== ${label}`);
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, shell: false });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0 || result.error) {
    console.error(result.error?.message || `${label} failed`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

let ok = run('MoonBit JS contract tests', moon, ['test', '--target', 'js', '--deny-warn']);
if (ok) ok = run('Build JS core export', process.execPath, [resolve(root, 'scripts/build.mjs')]);
if (ok) ok = run('Core-only numerical example', process.execPath, [resolve(root, 'examples/core-only.mjs')]);
if (ok) ok = run('Jury demo (generate → report fingerprint)', process.execPath, [resolve(root, 'scripts/demo-jury.mjs')]);
if (ok) ok = run('Fingerprint self-check', process.execPath, [resolve(root, 'scripts/fingerprint-check.mjs')]);
if (ok) {
  console.log('\nSmoke OK: MoonBit tests + build + core-only + demo-jury + fingerprint-check.');
  console.log('Next: node server/index.mjs  →  http://127.0.0.1:4321');
  console.log('MoonFrame positioning: docs/DIFF_VS_MOONFRAME.md');
}
