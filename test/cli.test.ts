import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRudder, useTempHome } from './helpers.ts';

test('CLI help exposes only the supported public commands', () => {
  const home = useTempHome('rudder-cli-help-test-');
  try {
    const res = runRudder(['--help'], home.path);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /rudder init/);
    assert.match(res.stdout, /rudder start/);
    assert.doesNotMatch(res.stdout, /rudder rules/);
    assert.doesNotMatch(res.stdout, /rudder digest/);
    assert.doesNotMatch(res.stdout, /rudder stats/);
    assert.doesNotMatch(res.stdout, /rudder tag/);
    assert.doesNotMatch(res.stdout, /rudder hook/);
  } finally {
    home.restore();
  }
});

test('rules command is no longer supported', () => {
  const home = useTempHome('rudder-cli-rules-test-');
  try {
    const res = runRudder(['rules', '--no-compile'], home.path);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /unknown command 'rules'/);
  } finally {
    home.restore();
  }
});

test('commands reject invalid agent flags', () => {
  const home = useTempHome('rudder-cli-agent-test-');
  try {
    const res = runRudder(['start', '--agent', 'llama'], home.path);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /--agent must be 'claude' or 'codex'/);
  } finally {
    home.restore();
  }
});

test('unknown commands exit non-zero and print help', () => {
  const home = useTempHome('rudder-cli-unknown-test-');
  try {
    const res = runRudder(['bogus'], home.path);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /unknown command 'bogus'/);
    assert.match(res.stderr, /Usage:/);
  } finally {
    home.restore();
  }
});
