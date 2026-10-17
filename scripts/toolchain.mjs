import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export async function findMoon() {
  let localPath;
  try { localPath = (await readFile(resolve(root, '.local/moon-path.txt'), 'utf8')).trim(); } catch {}
  const candidates = [process.env.MOON, localPath,
    resolve(process.env.MOON_HOME || resolve(homedir(), '.moon'), 'bin', process.platform === 'win32' ? 'moon.exe' : 'moon')];
  for (const path of candidates.filter(Boolean)) {
    try { await access(path); return path; } catch {}
  }
  return 'moon';
}
