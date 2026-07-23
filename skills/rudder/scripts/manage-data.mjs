#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const stateRoot = process.env.RUDDER_HOME || join(homedir(), '.rudder');
const databasePath = join(stateRoot, 'rudder.db');
const disabledPath = join(stateRoot, 'prompt-capture-disabled');

function databasePromptCount(database) {
  const table = database
    .prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'prompt_branches'"
    )
    .get();
  if (!table) return 0;
  return database
    .prepare('SELECT count(*) AS count FROM prompt_branches')
    .get().count;
}

function promptCount() {
  if (!existsSync(databasePath)) return 0;
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return databasePromptCount(database);
  } finally {
    database.close();
  }
}

function status() {
  return {
    captureEnabled:
      process.env.RUDDER_DISABLE_PROMPT_CAPTURE !== '1' &&
      !existsSync(disabledPath),
    disabledByEnvironment:
      process.env.RUDDER_DISABLE_PROMPT_CAPTURE === '1',
    disabledByPreference: existsSync(disabledPath),
    rudderHome: stateRoot,
    databasePath,
    promptCount: promptCount(),
  };
}

function setCaptureEnabled(enabled) {
  if (enabled) {
    rmSync(disabledPath, { force: true });
  } else {
    mkdirSync(stateRoot, { recursive: true });
    writeFileSync(disabledPath, `${new Date().toISOString()}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }
  return status();
}

function deletePrompts() {
  if (!existsSync(databasePath)) {
    return { deletedPromptCount: 0, ...status() };
  }
  const database = new DatabaseSync(databasePath);
  let deletedPromptCount;
  try {
    deletedPromptCount = databasePromptCount(database);
    if (deletedPromptCount > 0) {
      database.exec('PRAGMA secure_delete = ON');
      database.exec('DELETE FROM prompt_branches');
      database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      database.exec('VACUUM');
    }
  } finally {
    database.close();
  }
  return { deletedPromptCount, ...status() };
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  let result;
  switch (command) {
    case 'status':
      result = status();
      break;
    case 'disable':
      result = setCaptureEnabled(false);
      break;
    case 'enable':
      result = setCaptureEnabled(true);
      break;
    case 'delete':
      if (!args.includes('--confirm')) {
        throw new Error(
          'delete requires --confirm because stored prompt removal is irreversible'
        );
      }
      result = deletePrompts();
      break;
    default:
      throw new Error(
        'usage: manage-data.mjs <status|disable|enable|delete --confirm>'
      );
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
}
