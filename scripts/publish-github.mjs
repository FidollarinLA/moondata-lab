import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root } from './toolchain.mjs';

const target = process.argv[2] || 'FidollarinLA/moondata-lab';
if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(target)) throw new Error('Use an owner/repository name.');
function command(program, args, optional = false) {
  const r = spawnSync(program, args, { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (r.status !== 0 || r.error) {
    if (optional) return null;
    throw new Error(`${program} ${args[0]} failed: ${r.error?.message || r.stderr.trim()}`);
  }
  return r.stdout.trim();
}
try {
  const login = command('gh', ['api', 'user', '--jq', '.login'], true);
  if (!login) throw new Error('GitHub CLI 未登录。请在自己的终端执行 gh auth login，完成后重试；不要把令牌发到聊天里。');
  if (command('git', ['status', '--porcelain'])) throw new Error('工作区尚有未提交的修改，请先完成检查与提交。');
  let repo;
  const existing = command('gh', ['repo', 'view', target, '--json', 'nameWithOwner,isPrivate,url'], true);
  if (existing) repo = JSON.parse(existing);
  else {
    if (target.split('/')[0].toLowerCase() !== login.toLowerCase()) throw new Error('自动新建仅支持当前登录者的个人账号，请提供已存在且可写的仓库。');
    command('gh', ['repo', 'create', target, '--private', '--description', 'MoonBit-powered AI workbench for motor experiment data analysis.']);
    repo = JSON.parse(command('gh', ['repo', 'view', target, '--json', 'nameWithOwner,isPrivate,url']));
  }
  const remote = command('git', ['remote', 'get-url', 'origin'], true);
  const url = `${repo.url}.git`;
  if (remote && remote.replace(/\.git$/, '') !== repo.url) throw new Error('现有 origin 指向其他仓库，已停止以避免误推送。');
  if (!remote) command('git', ['remote', 'add', 'origin', url]);
  const branch = command('git', ['branch', '--show-current']);
  if (!branch.startsWith('codex/')) throw new Error('请从 codex/ 分支发布，不覆盖其他分支。');
  // Per-command credential helper: no global Git configuration or token files.
  command('git', ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', '-u', 'origin', `HEAD:refs/heads/${branch}`]);
  const local = command('git', ['rev-parse', 'HEAD']);
  const remoteSha = command('gh', ['api', `repos/${target}/commits/${encodeURIComponent(branch)}`, '--jq', '.sha']);
  if (local !== remoteSha) throw new Error('远端提交与本地不一致，请核对后再报告发布完成。');
  const receipt = { pushedAt: new Date().toISOString(), repository: repo.url, private: repo.isPrivate, branch, commit: local };
  await mkdir(resolve(root, '.local'), { recursive: true });
  await writeFile(resolve(root, '.local/publication.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
} catch (e) { console.error(e.message); process.exitCode = 1; }
