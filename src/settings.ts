import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { rudderHome } from './db.ts';

export interface RudderConfig {
  agentPath?: string;
  agentEnvPath?: string;
}

function settingsPath(): string {
  return join(rudderHome(), 'settings.json');
}

export function loadSettings(): RudderConfig {
  const path = settingsPath();
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as RudderConfig;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveSettings(next: RudderConfig): void {
  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2) + '\n');
}

export function agentPath(): string | null {
  return loadSettings().agentPath || null;
}

export function setAgentPath(path: string | null | undefined): void {
  const settings = loadSettings();
  const normalized = path?.trim();
  if (normalized) settings.agentPath = normalized;
  else delete settings.agentPath;
  saveSettings(settings);
}

export function agentEnvPath(): string | null {
  return loadSettings().agentEnvPath || null;
}

export function setAgentEnvPath(path: string): void {
  const settings = loadSettings();
  if (settings.agentEnvPath === path) return;
  settings.agentEnvPath = path;
  saveSettings(settings);
}
