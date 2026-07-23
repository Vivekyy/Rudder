import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { rudderHome } from './db/client.ts';

export const PROMPT_CAPTURE_DISABLED_FILE = 'prompt-capture-disabled';

export function promptCaptureDisabledPath(): string {
  return join(rudderHome(), PROMPT_CAPTURE_DISABLED_FILE);
}

export function promptCaptureDisabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    env.RUDDER_DISABLE_PROMPT_CAPTURE === '1' ||
    existsSync(promptCaptureDisabledPath())
  );
}

export function setPromptCaptureEnabled(enabled: boolean): void {
  const marker = promptCaptureDisabledPath();
  if (enabled) {
    rmSync(marker, { force: true });
    return;
  }

  mkdirSync(rudderHome(), { recursive: true });
  writeFileSync(marker, `${new Date().toISOString()}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}
