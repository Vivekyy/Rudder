import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { quote } from 'shell-quote';
import { openDb, dbPath } from './db.ts';

/**
 * Resolve the rudder bin path for the module at `moduleUrl`, matching the bin's
 * extension to however that module was loaded: a dev checkout runs the `.ts`
 * sources directly (src/install.ts ↔ bin/rudder.ts), while a built/published
 * install runs the compiled `.js` (dist/src/install.js ↔ dist/bin/rudder.js).
 * Hardcoding `.ts` made `rudder init` write a hook pointing at a file that
 * doesn't exist in the published package. Takes the URL as an argument so the
 * `.js` branch is testable without an actual build.
 */
export function rudderBinPath(moduleUrl: string): string {
  const here = fileURLToPath(moduleUrl);
  const ext = here.endsWith('.ts') ? 'ts' : 'js';
  return resolve(dirname(here), '..', 'bin', `rudder.${ext}`);
}

/**
 * The argv another tool should run to invoke a rudder hook. We point at the
 * absolute bin path with the current node binary so it works whether or not
 * `rudder` is on PATH (dev checkouts and global installs alike). Returned as an
 * array so callers never have to re-split a path that may contain spaces.
 */
export function rudderArgv(sub: string[]): string[] {
  return [process.execPath, rudderBinPath(import.meta.url), ...sub];
}

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

  let settings: Record<string, any> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8')) || {};
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
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    return `installed → ${settingsPath}`;
  }
  return `already present → ${settingsPath}`;
}

// ---- Codex: top-level `notify` in ~/.codex/config.toml ----------------------

function installCodexHook(argvForSub: HookArgvProvider): string {
  const configPath = join(homedir(), '.codex', 'config.toml');
  mkdirSync(dirname(configPath), { recursive: true });

  const argv = argvForSub(['hook', 'codex']);
  // TOML array of strings: ["/abs/node", "/abs/rudder.ts", "hook", "codex"]
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
  const hook = sub[0] === 'hook' ? sub.slice(1) : sub;
  return appEntryPath
    ? [executablePath, appEntryPath, '--rudder-hook', ...hook]
    : [executablePath, '--rudder-hook', ...hook];
}

export function hookStatus(argvForSub: HookArgvProvider = rudderArgv): HookStatus {
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

export function installHooks(argvForSub: HookArgvProvider = rudderArgv): InstallResult {
  openDb();
  return {
    database: dbPath(),
    claude: installClaudeHook(argvForSub),
    codex: installCodexHook(argvForSub),
  };
}

export function init(): void {
  const result = installHooks();
  console.log(`rudder: database ready → ${result.database}`);
  console.log(`rudder: claude hook  ${result.claude}`);
  console.log(`rudder: codex hook   ${result.codex}`);
  console.log('\nDone. New prompts in Claude Code and Codex will now be recorded.');
  console.log('Run `rudder digest` at the end of the day to summarize your work.');
}
