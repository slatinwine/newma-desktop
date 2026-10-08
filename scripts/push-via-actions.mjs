#!/usr/bin/env node
/**
 * 经 GitHub Actions 中转的精确推送（github.com:443 被墙但 api.github.com 可达时的推送方案）。
 *
 * 原理：GitHub create-commit API 会按自己的方式规范化提交对象（剥掉 message 末尾换行等），
 * 无法复现本地 git 的规范字节。本脚本把本地完整历史打成 git bundle，base64 后作为仓库的
 * git blob 上传（GITHUB_TOKEN 可读；secret gist 不行——Actions 应用令牌无权读用户 gist），
 * 一次性 workflow 校验 sha256 后从 bundle 取对象并 force-push 分支——远端 SHA 与本地严格一致。
 * 上传的 bundle blob 是悬垂对象，服务端 GC 会回收。
 *
 * 用法：node scripts/push-via-actions.mjs [origin] [branch]
 * 依赖：gh 已认证（需 repo/workflow scope），仓库启用 Actions。
 */
import { execSync, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const REMOTE_NAME = process.argv[2] || 'origin';
const BRANCH = process.argv[3] || spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

const TOKEN = execSync('gh auth token').toString().trim();
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const api = async (method, path, body) => {
  const res = await fetch(`https://api.github.com/${path.replace(/^\//, '')}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
};

const WORKFLOW_FILE = 'push-align.yml';
// 注意：yaml 里的 ${{ }} 不能放进 JS 模板字符串（会被解析为插值），用数组拼接
const WORKFLOW_YAML = [
  'name: push-align',
  'on:',
  '  workflow_dispatch:',
  '    inputs:',
  '      bundle_blob_sha:',
  "        description: 'git blob sha holding base64 bundle'",
  '        required: true',
  '      bundle_sha256:',
  "        description: 'sha256 of the decoded bundle'",
  '        required: true',
  '      expected_sha:',
  "        description: 'expected full commit sha'",
  '        required: true',
  'permissions:',
  '  contents: write',
  'jobs:',
  '  align:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  "      - name: Fetch bundle and push branch",
  '        shell: bash',
  '        run: |',
  '          set -euo pipefail',
  "          curl -sSL -H \"Authorization: Bearer ${{ secrets.GITHUB_TOKEN }}\" \\",
  '            "https://api.github.com/repos/${{ github.repository }}/git/blobs/${{ inputs.bundle_blob_sha }}" \\',
  "            | jq -j '.content' | tr -d '\\n' | base64 -d > push.bundle",
  '          echo "${{ inputs.bundle_sha256 }}  push.bundle" | sha256sum -c -',
  '          git clone -q --no-checkout \\',
  '            "https://x-access-token:${{ secrets.GITHUB_TOKEN }}@github.com/${{ github.repository }}.git" work',
  '          cd work',
  '          git fetch ../push.bundle "refs/heads/*:refs/bundle/*"',
  '          git cat-file -e "${{ inputs.expected_sha }}^{commit}"',
  '          git update-ref "refs/heads/${{ github.ref_name }}" "${{ inputs.expected_sha }}"',
  '          git push --force origin "refs/heads/${{ github.ref_name }}"',
].join('\n');

function gitOut(args, opts = {}) {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} 失败: ${r.stderr}`);
  return r.stdout;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const remoteUrl = gitOut(['remote', 'get-url', REMOTE_NAME]).trim();
  const repoMatch = remoteUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (!repoMatch) throw new Error(`无法从 remote 解析仓库：${remoteUrl}`);
  const REPO = repoMatch.slice(1).join('/');

  const localHead = gitOut(['rev-parse', 'HEAD']).trim();
  console.log(`本地 HEAD: ${localHead}`);

  // 1. 远端当前状态
  const ref = await api('GET', `repos/${REPO}/git/ref/heads/${BRANCH}`);
  console.log(`远端 ${BRANCH} @ ${ref.object.sha}`);
  if (ref.object.sha === localHead) {
    console.log('远端已与本地一致，无需推送');
    return;
  }

  // 2. 本地完整历史 -> git bundle -> base64 -> 仓库 git blob
  const tmp = mkdtempSync(join(tmpdir(), 'push-align-'));
  const bundlePath = join(tmp, 'push.bundle');
  try {
    // 必须用分支名打包：HEAD 打包出的 bundle 引用名是 "HEAD"，
    // fetch refspec refs/heads/* 匹配不到，对象就不会被取回
    gitOut(['bundle', 'create', bundlePath, BRANCH]);
    const bundle = readFileSync(bundlePath);
    const sha256 = createHash('sha256').update(bundle).digest('hex');
    const b64 = bundle.toString('base64');
    console.log(`bundle：${Math.round(bundle.length / 1024)}KB（sha256 ${sha256.slice(0, 12)}…）`);
    if (b64.length > 90 * 1024 * 1024) throw new Error('bundle 过大');

    const blob = await api('POST', `repos/${REPO}/git/blobs`, {
      content: b64,
      encoding: 'base64',
    });
    const bundleBlobSha = blob.sha;
    console.log(`bundle 已上传为 blob: ${bundleBlobSha}`);

    // 3. 确保 workflow 文件存在于远端（缺失或内容不同则经 data API 补工具提交）
    let wf = null;
    try {
      wf = await api('GET', `repos/${REPO}/contents/.github/workflows/${WORKFLOW_FILE}?ref=${BRANCH}`);
    } catch {
      /* 404 = 缺失 */
    }
    if (!wf || (wf.content && Buffer.from(wf.content, 'base64').toString('utf8') !== WORKFLOW_YAML)) {
      const baseTree = await api('GET', `repos/${REPO}/git/commits/${ref.object.sha}`);
      const blob = await api('POST', `repos/${REPO}/git/blobs`, {
        content: Buffer.from(WORKFLOW_YAML).toString('base64'),
        encoding: 'base64',
      });
      const tree = await api('POST', `repos/${REPO}/git/trees`, {
        base_tree: baseTree.tree.sha,
        tree: [{ path: `.github/workflows/${WORKFLOW_FILE}`, mode: '100644', type: 'blob', sha: blob.sha }],
      });
      const toolCommit = await api('POST', `repos/${REPO}/git/commits`, {
        message: 'chore: 添加 push-align 工具 workflow（推送中转用）',
        tree: tree.sha,
        parents: [ref.object.sha],
      });
      await api('PATCH', `repos/${REPO}/git/refs/heads/${BRANCH}`, { sha: toolCommit.sha, force: true });
      console.log(`workflow 文件已就位（工具提交 ${toolCommit.sha.slice(0, 8)}，推送完成后会被覆盖）`);
    }

    // 4. 触发对齐 workflow
    const t0 = new Date(Date.now() - 5000).toISOString(); // 容忍时钟偏差
    await api('POST', `repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
      ref: BRANCH,
      inputs: { bundle_blob_sha: bundleBlobSha, bundle_sha256: sha256, expected_sha: localHead },
    });
    console.log('workflow 已触发，等待完成...');

    // 5. 轮询「本次触发」的运行结果（dispatch 异步，等新运行记录出现，避免误读旧运行）
    let conclusion = null;
    let runUrl = '';
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      await sleep(5000);
      const runs = await api('GET', `repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=5`);
      const run = runs.workflow_runs.find((r) => r.head_branch === BRANCH && r.created_at >= t0);
      if (!run) continue;
      if (run.status === 'completed') {
        conclusion = run.conclusion;
        runUrl = run.html_url;
        break;
      }
    }
    if (conclusion !== 'success') {
      console.error(`运行${conclusion ? `失败（${conclusion}）` : '超时'}：${runUrl || '未知'}`);
      process.exitCode = 1;
      return;
    }

    // 6. 校验远端分支 == 本地 HEAD
    const after = await api('GET', `repos/${REPO}/git/ref/heads/${BRANCH}`);
    if (after.object.sha !== localHead) throw new Error(`对齐后不一致：远端 ${after.object.sha} != 本地 ${localHead}`);
    console.log(`✅ 已推送：${REPO} ${BRANCH} -> ${after.object.sha}（与本地 HEAD 一致）`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('推送失败 ❌:', err.message);
  process.exit(1);
});
