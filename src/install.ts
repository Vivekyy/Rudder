import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { quote } from 'shell-quote';
import { openDb, dbPath } from './db/index.ts';
import { capture } from './telemetry.ts';

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

function backup(path: string): void {
  if (existsSync(path)) copyFileSync(path, `${path}.rudder-bak`);
}

// ---- Claude Code: UserPromptSubmit hook in ~/.claude/settings.json ----------

function installClaudeHook(): string {
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

  const promptArgv = rudderArgv(['hook', 'claude', 'prompt']);
  const stopArgv = rudderArgv(['hook', 'claude', 'stop']);
  const promptCommand = quote(promptArgv);
  const stopCommand = quote(stopArgv);
  settings.hooks ??= {};
  settings.hooks.UserPromptSubmit ??= [];
  settings.hooks.Stop ??= [];

  const promptAlready = JSON.stringify(settings.hooks.UserPromptSubmit).includes(promptArgv[1]);
  const stopAlready = JSON.stringify(settings.hooks.Stop).includes(stopArgv[1]);
  if (!promptAlready) {
    settings.hooks.UserPromptSubmit.push({
      hooks: [{ type: 'command', command: promptCommand, timeout: 30 }],
    });
  }
  if (!stopAlready) {
    settings.hooks.Stop.push({
      hooks: [{ type: 'command', command: stopCommand, timeout: 60 }],
    });
  }
  if (!promptAlready || !stopAlready) {
    backup(settingsPath);
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    return `installed/updated → ${settingsPath}`;
  }
  return `already present → ${settingsPath}`;
}

// ---- Codex: native UserPromptSubmit hook in ~/.codex/hooks.json -------------

function installCodexHook(): string {
  const codexDir = join(homedir(), '.codex');
  const hooksPath = join(codexDir, 'hooks.json');
  const configPath = join(homedir(), '.codex', 'config.toml');
  mkdirSync(codexDir, { recursive: true });

  const promptArgv = rudderArgv(['hook', 'codex', 'prompt']);
  const stopArgv = rudderArgv(['hook', 'codex', 'stop']);
  const promptCommand = quote(promptArgv);
  const stopCommand = quote(stopArgv);
  let hooks: Record<string, any> = {};
  if (existsSync(hooksPath)) {
    try {
      hooks = JSON.parse(readFileSync(hooksPath, 'utf8')) || {};
    } catch {
      throw new Error(`Could not parse ${hooksPath} as JSON; fix it and retry.`);
    }
  }
  hooks.hooks ??= {};
  hooks.hooks.UserPromptSubmit ??= [];
  hooks.hooks.Stop ??= [];
  const promptAlready = JSON.stringify(hooks.hooks.UserPromptSubmit).includes(promptArgv[1]);
  const stopAlready = JSON.stringify(hooks.hooks.Stop).includes(stopArgv[1]);
  if (!promptAlready) {
    hooks.hooks.UserPromptSubmit.push({
      hooks: [{ type: 'command', command: promptCommand, timeout: 30 }],
    });
  }
  if (!stopAlready) {
    hooks.hooks.Stop.push({
      hooks: [{ type: 'command', command: stopCommand, timeout: 60 }],
    });
  }
  if (!promptAlready || !stopAlready) {
    backup(hooksPath);
    writeFileSync(hooksPath, JSON.stringify(hooks, null, 2) + '\n');
  }

  // Remove Rudder's old post-turn `notify` integration. Do not disturb a notify
  // command owned by another tool.
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, 'utf8');
    const migrated = content
      .split('\n')
      .filter((line) => !(/^\s*notify\s*=/.test(line) && /\brudder(?:\.[jt]s)?\b/i.test(line)))
      .join('\n');
    if (migrated !== content) {
      backup(configPath);
      writeFileSync(configPath, migrated);
    }
  }
  return `${promptAlready && stopAlready ? 'already present' : 'installed/updated'} → ${hooksPath}`;
}

export function init(): void {
  openDb();
  const claudeResult = installClaudeHook();
  const codexResult = installCodexHook();
  console.log(`rudder: database ready → ${dbPath()}`);
  console.log(`rudder: claude hook  ${claudeResult}`);
  console.log(`rudder: codex hook   ${codexResult}`);
  console.log('rudder: Codex users must review and trust the new hook in an interactive session.');
  console.log('\nDone. New prompts in Claude Code and Codex will now be recorded.');
  console.log('Run `rudder start` to compile evidence and open your learned-rules dashboard.');
  capture('rudder initialized', {
    claude_hook: claudeResult.startsWith('installed'),
    codex_hook: codexResult.startsWith('installed'),
    node_version: process.version,
    platform: process.platform,
  });
}
