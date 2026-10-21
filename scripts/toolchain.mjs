import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export async function findMoon() {
  // Explicit user overrides retain priority. This only sets this process/children.
  if (process.platform === 'win32' && !process.env.MOON && !process.env.MOON_HOME) {
    let configured;
    try { configured = JSON.parse(await readFile(resolve(root, '.local/windows-toolchain.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (configured) {
      if (configured.schema !== 'moondata.windows-toolchain/1') throw new Error('Unsupported Windows toolchain manifest; rerun scripts/setup-windows-toolchain.mjs.');
      const home = resolve(root, '.local/moon-official-20261021'), compat = resolve(root, '.local/moon-path-compat');
      const paths = { MOON: resolve(home, 'bin/moon.exe'), MOON_HOME: home, MOON_COMPAT_BIN: resolve(home, 'bin'), MOONC_OVERRIDE: resolve(compat, 'moonc.exe'), MOONFMT_OVERRIDE: resolve(compat, 'moonfmt.exe'), MOONINFO_OVERRIDE: resolve(compat, 'mooninfo.exe') };
      try { for (const path of Object.values(paths)) await access(path); await access(resolve(home, 'lib/core/moon.mod')); }
      catch { throw new Error('Project-local toolchain is incomplete. Run node scripts/setup-windows-toolchain.mjs.'); }
      Object.assign(process.env, paths);
      return paths.MOON;
    }
  }
  let localPath;
  try { localPath = (await readFile(resolve(root, '.local/moon-path.txt'), 'utf8')).trim(); } catch {}
  const candidates = [process.env.MOON, localPath,
    resolve(process.env.MOON_HOME || resolve(homedir(), '.moon'), 'bin', process.platform === 'win32' ? 'moon.exe' : 'moon')];
  for (const path of candidates.filter(Boolean)) {
    try { await access(path); return path; } catch {}
  }
  return 'moon';
}
