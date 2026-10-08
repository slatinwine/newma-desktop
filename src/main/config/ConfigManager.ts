import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface DesktopConfig {
  bridge: { preferredPort: number };
  newma: { bin: string; openaiEndpoint: string };
  workspace: { defaultDir: string };
  web: { publicDir: string };
  window: { width: number; height: number };
}

/** newma 把 settings.json 的 baseUrl 误拼成 /v1/chat/completions 导致 404，
 *  用完整端点修复；与 newma-web/start.sh 的行为一致。 */
export const DEFAULT_OPENAI_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

export function defaultConfig(): DesktopConfig {
  return {
    bridge: { preferredPort: 3010 },
    newma: { bin: process.env.NEWMA_BIN || 'newma', openaiEndpoint: DEFAULT_OPENAI_ENDPOINT },
    workspace: { defaultDir: path.join(os.homedir(), 'NewmaWorkspace') },
    web: { publicDir: '' },
    window: { width: 1280, height: 860 },
  };
}

function mergeSection<T extends object>(base: T, loaded: unknown): T {
  return { ...base, ...(typeof loaded === 'object' && loaded ? loaded : {}) };
}

/** 极简配置管理：userData/config.json，仅在新架构用到的键上与默认值合并。 */
export class ConfigManager {
  private readonly configPath: string;
  private config: DesktopConfig;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, 'config.json');
    this.config = this.load();
  }

  private load(): DesktopConfig {
    const defaults = defaultConfig();
    try {
      if (fs.existsSync(this.configPath)) {
        const loaded = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        return {
          bridge: mergeSection(defaults.bridge, loaded.bridge),
          newma: mergeSection(defaults.newma, loaded.newma),
          workspace: mergeSection(defaults.workspace, loaded.workspace),
          web: mergeSection(defaults.web, loaded.web),
          window: mergeSection(defaults.window, loaded.window),
        };
      }
    } catch (err) {
      console.error('[config] 加载失败，使用默认配置:', err);
    }
    return defaults;
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      console.error('[config] 保存失败:', err);
    }
  }

  get(): DesktopConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  update(patch: {
    bridge?: Partial<DesktopConfig['bridge']>;
    newma?: Partial<DesktopConfig['newma']>;
    workspace?: Partial<DesktopConfig['workspace']>;
    web?: Partial<DesktopConfig['web']>;
    window?: Partial<DesktopConfig['window']>;
  }): void {
    if (patch.bridge) this.config.bridge = { ...this.config.bridge, ...patch.bridge };
    if (patch.newma) this.config.newma = { ...this.config.newma, ...patch.newma };
    if (patch.workspace) this.config.workspace = { ...this.config.workspace, ...patch.workspace };
    if (patch.web) this.config.web = { ...this.config.web, ...patch.web };
    if (patch.window) this.config.window = { ...this.config.window, ...patch.window };
    this.save();
  }

  getConfigPath(): string {
    return this.configPath;
  }
}
