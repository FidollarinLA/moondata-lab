import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root } from './toolchain.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This setup supports Windows x64. Use the official MoonBit toolchain on other platforms.');
const home = resolve(root, '.local/moon-official-20261021');
const compat = resolve(root, '.local/moon-path-compat');
const archives = [
  { name: 'toolchain.zip', url: 'https://cli.moonbitlang.com/binaries/latest/moonbit-windows-x86_64.zip', sha256: '653ebf0a3b2683048faa8ad79b7b7d0721bf78726bf1a7e58678e9740b0d430f', destination: home },
  { name: 'core.zip', url: 'https://cli.moonbitlang.com/cores/core-latest.zip', sha256: 'd58caf5ee6e2a95d8785adf7d90fd68dd9366d174df1dfaa36646dd6b47c5663', destination: resolve(home, 'lib') },
];
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.status}`);
}
await mkdir(home, { recursive: true }); await mkdir(compat, { recursive: true });
for (const archive of archives) {
  const path = resolve(home, archive.name); let bytes;
  try { bytes = await readFile(path); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.log(`Downloading official ${archive.name}…`);
    const response = await fetch(archive.url, { signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== archive.sha256) throw new Error(`${archive.name}: pinned SHA-256 mismatch. The mutable official endpoint may have changed. Setup stopped; existing toolchain is not activated or silently upgraded.`);
  // Only verified archives are written/extracted; no global installation or PATH edit.
  const partial = `${path}.verified`; await writeFile(partial, bytes); await rename(partial, path);
  await mkdir(archive.destination, { recursive: true }); run('tar', ['-xf', path, '-C', archive.destination]);
}
const csc = resolve(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
try { await access(csc); } catch { throw new Error('Windows .NET Framework C# compiler was not found; no system software was installed.'); }
run(csc, ['/nologo', `/out:${resolve(compat, 'moonc.exe')}`, resolve(root, 'scripts/windows/moon-path-compat.cs')]);
for (const name of ['moonfmt', 'mooninfo']) await copyFile(resolve(compat, 'moonc.exe'), resolve(compat, `${name}.exe`));
const env = { ...process.env, MOON_HOME: home, MOON_COMPAT_BIN: resolve(home, 'bin'), MOONC_OVERRIDE: resolve(compat, 'moonc.exe'), MOONFMT_OVERRIDE: resolve(compat, 'moonfmt.exe'), MOONINFO_OVERRIDE: resolve(compat, 'mooninfo.exe') };
const moon = resolve(home, 'bin/moon.exe');
for (const target of ['js', 'wasm-gc']) run(moon, ['bundle', '--warn-list', '-a', '--target', target], { cwd: resolve(home, 'lib/core'), env });
// Activate only after both standard-library bundles succeed.
await writeFile(resolve(root, '.local/windows-toolchain.json'), JSON.stringify({ schema: 'moondata.windows-toolchain/1', compiler: '0.10.16+b1a0e846e', archives: archives.map(({ name, url, sha256 }) => ({ name, url, sha256 })), createdAt: new Date().toISOString() }, null, 2));
console.log('Project-local Windows toolchain ready. Run node scripts/check.mjs or ./start.ps1 normally.');
