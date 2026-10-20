import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { root } from './toolchain.mjs';
function git(args) { const p = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); if (p.status !== 0) throw new Error(p.stderr); return p.stdout.trim(); }
if (git(['status', '--porcelain'])) throw new Error('Commit reviewed changes before packaging.');
const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const commit = git(['rev-parse', 'HEAD']);
const destination = resolve(root, '..', 'deliverables'); await mkdir(destination, { recursive: true });
const prefix = `moondata-lab-v${version}`;
const zip = resolve(destination, `${prefix}-source.zip`), bundle = resolve(destination, `${prefix}-history.bundle`);
git(['archive', '--format=zip', '--prefix=moondata-lab/', '-o', zip, 'HEAD']);
git(['bundle', 'create', bundle, '--all']); git(['bundle', 'verify', bundle]);
const files = await Promise.all([zip, bundle].map(async path => { const content = await readFile(path); return { path, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') }; }));
const receipt = { createdAt: new Date().toISOString(), version, commit, files, excluded: 'Ignored .local data, model weights, credentials and node_modules are not included. Follow README to build and configure the local model. GitHub push is a separate operation.' };
await writeFile(resolve(destination, `${prefix}-receipt.json`), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt, null, 2));
