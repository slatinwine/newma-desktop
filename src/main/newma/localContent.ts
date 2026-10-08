import fs from 'fs';
import path from 'path';

export interface SkillInfo {
  name: string;
  dir: string;
  description: string;
  source: 'project' | 'user';
}

export interface PluginInfo {
  name: string;
  desc: string;
  kind: string;
}

export interface BuiltinPluginInfo {
  name: string;
  desc: string;
}

/** newma 内置插件（src/loop/plugins/，随 CLI 安装，无法从外部目录枚举） */
export const BUILTIN_PLUGINS: BuiltinPluginInfo[] = [
  { name: 'core-plugin', desc: '核心命令插件：基础命令注册' },
  { name: 'mode-commands-plugin', desc: '模式切换命令：/chat /plan /do 等' },
  { name: 'plan-mode-plugin', desc: '规划模式：先规划再执行任务' },
  { name: 'do-mode-plugin', desc: '执行模式：直接执行任务' },
  { name: 'intent-integration-plugin', desc: '意图识别：自动把简单问题导向聊天、复杂任务导向规划' },
  { name: 'memo-cli-plugin', desc: '备忘录命令：/memo 记录与检索' },
  { name: 'event-source-commands', desc: '事件源命令' },
];

const FRONT_MATTER = /^---\s*\n([\s\S]*?)\n---/;

/** 解析 SKILL.md / 插件 md 的 front-matter（仅取顶层 key: value）。 */
export function parseFrontMatter(text: string): Record<string, string> {
  const m = FRONT_MATTER.exec(text);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(\w[\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let val = kv[2].trim();
    if (val.length >= 2 && val[0] === val[val.length - 1] && (val[0] === '"' || val[0] === "'")) {
      val = val.slice(1, -1);
    }
    out[kv[1]] = val;
  }
  return out;
}

function readHead(file: string): string | null {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(20000);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      return buf.toString('utf8', 0, n);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** 枚举技能：项目 .kode/skills 优先，其次用户 ~/.kode/skills。 */
export function listSkills(roots: { project: string; home: string }): SkillInfo[] {
  const skills: SkillInfo[] = [];
  const seen = new Set<string>();

  const addFrom = (dir: string, mdPath: string, sourceRoot: string, source: 'project' | 'user') => {
    if (seen.has(dir)) return;
    const raw = readHead(mdPath);
    if (raw === null) return;
    const meta = parseFrontMatter(raw);
    seen.add(dir);
    skills.push({
      name: meta.name || path.basename(dir),
      dir: path.relative(sourceRoot, dir),
      description: meta.description || '',
      source,
    });
  };

  const scan = (root: string, source: 'project' | 'user') => {
    if (!isDir(root)) return;
    const rootIndex = path.join(root, 'SKILL.md');
    if (isFile(rootIndex)) addFrom(root, rootIndex, root, source);
    for (const name of fs.readdirSync(root).sort()) {
      const d = path.join(root, name);
      const f = path.join(d, 'SKILL.md');
      if (isFile(f)) addFrom(d, f, root, source);
    }
  };

  scan(roots.project, 'project');
  scan(roots.home, 'user');
  return skills;
}

/** 枚举项目 .kode/plugins 下已装插件（.md 单文件或含 README.md 的目录）。 */
export function listPlugins(projectPluginsDir: string): PluginInfo[] {
  const plugins: PluginInfo[] = [];
  if (!isDir(projectPluginsDir)) return plugins;
  for (const name of fs.readdirSync(projectPluginsDir).sort()) {
    const p = path.join(projectPluginsDir, name);
    let desc = '';
    let displayName = name;
    if (isFile(p) && name.toLowerCase().endsWith('.md')) {
      const raw = readHead(p);
      desc = raw !== null ? parseFrontMatter(raw).description || '' : '';
      displayName = name.slice(0, -3);
    } else if (isDir(p)) {
      const readme = path.join(p, 'README.md');
      if (isFile(readme)) {
        try {
          for (const line of fs.readFileSync(readme, 'utf8').split(/\r?\n/)) {
            const t = line.trim().replace(/^[#\s]+/, '').trim();
            if (t) {
              desc = t;
              break;
            }
          }
        } catch {
          /* ignore */
        }
      }
    }
    plugins.push({ name: displayName, desc, kind: 'project' });
  }
  return plugins;
}
