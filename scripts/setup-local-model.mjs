import { mkdir, readFile, rename, writeFile, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform, Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root } from './toolchain.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('此便携安装脚本目前仅支持 Windows x64；其他平台可连接兼容模型服务。');
const directory = resolve(root, '.local/model'); await mkdir(directory, { recursive: true });
const assets = [
  { file: 'llama-b11718-bin-win-cpu-x64.zip', size: 19662572, sha256: '92cc529b29a43f9a30e21d490cb2e95062acd0b59af6fee8b3b52b28074f838c', url: 'https://github.com/ggml-org/llama.cpp/releases/download/b11718/llama-b11718-bin-win-cpu-x64.zip' },
  { file: 'Qwen3-0.6B-Q8_0.gguf', size: 639446688, sha256: '9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031', url: 'https://modelscope.cn/models/Qwen/Qwen3-0.6B-GGUF/resolve/6abe20cd0aed577f4d0b267935868ecae190aee9/Qwen3-0.6B-Q8_0.gguf' },
];
async function hash(path) { const h = createHash('sha256'); for await (const chunk of createReadStream(path)) h.update(chunk); return h.digest('hex'); }
for (const asset of assets) {
  const path = resolve(directory, asset.file);
  let exists = false; try { exists = (await stat(path)).size === asset.size && await hash(path) === asset.sha256; } catch {}
  if (exists) { console.log(`Verified cached ${asset.file}`); continue; }
  console.log(`Downloading ${asset.file} (${Math.round(asset.size / 1e6)} MB)`);
  const r = await fetch(asset.url, { signal: AbortSignal.timeout(1200000) }); if (!r.ok || !r.body) throw new Error(`Download returned HTTP ${r.status}`);
  let bytes = 0, last = -1; const digest = createHash('sha256');
  const verify = new Transform({ transform(chunk, _, cb) { bytes += chunk.length; digest.update(chunk); if (bytes > asset.size) return cb(new Error('Download larger than expected')); const step = Math.floor(bytes / asset.size * 10); if (step !== last) { last = step; console.log(`${asset.file}: ${step * 10}%`); } cb(null, chunk); } });
  await pipeline(Readable.fromWeb(r.body), verify, createWriteStream(path + '.partial'));
  if (bytes !== asset.size || digest.digest('hex') !== asset.sha256) throw new Error('SHA-256 / size mismatch; file was not activated');
  await rename(path + '.partial', path); console.log(`Verified ${asset.file}`);
}
await mkdir(resolve(directory, 'runtime'), { recursive: true });
const unpack = spawnSync('tar.exe', ['-xf', resolve(directory, assets[0].file), '-C', resolve(directory, 'runtime')], { cwd: root, windowsHide: true, encoding: 'utf8' });
if (unpack.status !== 0) throw new Error('Cannot extract runtime: ' + unpack.stderr);
const config = { runtime: resolve(directory, 'runtime/llama-server.exe'), model: resolve(directory, assets[1].file), modelName: 'Qwen3-0.6B-Q8_0', source: 'Qwen official ModelScope repository; matching HF LFS SHA-256', assets };
await readFile(config.runtime); // Ensure runtime exists; no code is run during setup.
await writeFile(resolve(root, '.local/local-model.json'), JSON.stringify(config, null, 2));
console.log('Local model files ready. Run node scripts/start-with-model.mjs.');
