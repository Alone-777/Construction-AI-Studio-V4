import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertReadablePath,
  assertWritablePath,
  buildNamedAction,
  normalizeRelativePath,
  redactSecrets,
} from './lib.mjs';

test('normalizeRelativePath blocks absolute paths and traversal', () => {
  assert.equal(normalizeRelativePath('./src/core'), 'src/core');
  assert.throws(() => normalizeRelativePath('/etc/passwd'));
  assert.throws(() => normalizeRelativePath('../outside'));
});

test('secret and runtime write boundaries are enforced', () => {
  assert.throws(() => assertReadablePath('.env'));
  assert.throws(() => assertReadablePath('.git/config'));
  assert.throws(() => assertReadablePath('node_modules/example/index.js'));
  assert.equal(assertReadablePath('.firefly/demo/state.json'), '.firefly/demo/state.json');

  assert.throws(() => assertWritablePath('.firefly/demo/state.json'));
  assert.equal(assertWritablePath('src/example.ts'), 'src/example.ts');
});

test('redactSecrets removes credential-shaped environment values and bearer tokens', () => {
  const env = {
    GROQ_API_KEY: 'super-secret-key-value',
    ORDINARY_SETTING: 'visible-value',
  };

  const output = redactSecrets(
    'key=super-secret-key-value Authorization: Bearer abcdefghijklmnopqrstuvwxyz ordinary=visible-value',
    env
  );

  assert.doesNotMatch(output, /super-secret-key-value/);
  assert.doesNotMatch(output, /abcdefghijklmnopqrstuvwxyz/);
  assert.match(output, /visible-value/);
  assert.match(output, /\[REDACTED\]/);
});

test('named actions expose only deterministic commands', () => {
  assert.deepEqual(buildNamedAction('test'), {
    command: 'npm',
    argv: ['test'],
    timeoutMs: 240_000,
  });

  assert.deepEqual(buildNamedAction('firefly_status', { workspace: '.firefly/demo' }), {
    command: 'npm',
    argv: ['run', 'firefly:status', '--', '.firefly/demo'],
    timeoutMs: 60_000,
  });

  assert.throws(() => buildNamedAction('shell'));
});
