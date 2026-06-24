import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { quote } from 'shell-quote';
import { dbPath, openDb } from './db.ts';

/** Supplied by Electron main so hook installers write the current app executable. */
export type HookArgvProvider = (sub: string[]) => string[];

export interface InstallResult {
  database: string;
  claude: string;
  codex: string;
}

export interface HookStatus {
  claude: boolean;
  codex: boolean;
  claudePath: string;
  codexPath: string;
}

interface ClaudeCommandHook {
  type: 'command';
  command: string;
}

interface ClaudePromptHook {
  hooks: ClaudeCommandHook[];
}

type ClaudeHooks = Record<string, unknown> & {
  UserPromptSubmit?: ClaudePromptHook[];
};

interface ClaudeSettings {
  hooks?: ClaudeHooks;
  [key: string]: unknown;
}

function backup(path: string): void {
  if (existsSync(path)) copyFileSync(path, `${path}.rudder-bak`);
}

// ---- Claude Code: UserPromptSubmit hook in ~/.claude/settings.json ----------

function includesHook(content: string, argv: string[]): boolean {
  return argv.every((part) => content.includes(part));
}

function installClaudeHook(argvForSub: HookArgvProvider): string {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  mkdirSync(dirname(settingsPath), { recursive: true });

  let settings: ClaudeSettings = {};
  if (existsSync(settingsPath)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(settingsPath, 'utf8'));
      settings =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as ClaudeSettings)
          : {};
    } catch {
      throw new Error(`Could not parse ${settingsPath} as JSON; fix it and retry.`);
    }
  }

  const argv = argvForSub(['hook', 'claude']);
  const command = quote(argv);
  settings.hooks ??= {};
  settings.hooks.UserPromptSubmit ??= [];

  const already = includesHook(JSON.stringify(settings.hooks.UserPromptSubmit), argv);
  if (!already) {
    settings.hooks.UserPromptSubmit.push({
      hooks: [{ type: 'command', command }],
    });
    backup(settingsPath);
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
    return `installed → ${settingsPath}`;
  }
  return `already present → ${settingsPath}`;
}

// ---- Codex: top-level `notify` in ~/.codex/config.toml ----------------------

function installCodexHook(argvForSub: HookArgvProvider): string {
  const configPath = join(homedir(), '.codex', 'config.toml');
  mkdirSync(dirname(configPath), { recursive: true });

  const argv = argvForSub(['hook', 'codex']);
  // TOML array of strings: ["/Applications/Rudder", "--rudder-hook", "codex"]
  const notifyLine = `notify = [${argv.map((p) => JSON.stringify(p)).join(', ')}]`;

  let content = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';

  if (/^\s*notify\s*=/m.test(content)) {
    if (includesHook(content, argv)) {
      return `already present → ${configPath}`;
    }
    backup(configPath);
    content = content.replace(/^\s*notify\s*=.*$/m, notifyLine);
  } else {
    backup(configPath);
    // Top-level keys must precede any [table]; prepend to stay valid.
    content = `${notifyLine}\n${content}`;
  }
  writeFileSync(configPath, content);
  return `installed → ${configPath}`;
}

export function electronHookArgv(
  executablePath: string,
  sub: string[],
  appEntryPath?: string
): string[] {
  // Both Claude and Codex hooks point at the same app executable; the final arg
  // selects which hook parser runs inside `--rudder-hook` mode.
  const hook = sub[0] === 'hook' ? sub.slice(1) : sub;
  return appEntryPath
    ? [executablePath, appEntryPath, '--rudder-hook', ...hook]
    : [executablePath, '--rudder-hook', ...hook];
}

export function hookStatus(argvForSub: HookArgvProvider): HookStatus {
  const claudePath = join(homedir(), '.claude', 'settings.json');
  const codexPath = join(homedir(), '.codex', 'config.toml');
  const claudeContent = existsSync(claudePath) ? readFileSync(claudePath, 'utf8') : '';
  const codexContent = existsSync(codexPath) ? readFileSync(codexPath, 'utf8') : '';
  return {
    claude: includesHook(claudeContent, argvForSub(['hook', 'claude'])),
    codex: includesHook(codexContent, argvForSub(['hook', 'codex'])),
    claudePath,
    codexPath,
  };
}

export function installHooks(argvForSub: HookArgvProvider): InstallResult {
  openDb();
  return {
    database: dbPath(),
    claude: installClaudeHook(argvForSub),
    codex: installCodexHook(argvForSub),
  };
}
