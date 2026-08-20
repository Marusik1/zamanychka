import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateProductionGuardResult } from './epic-01-production-guard-smoke.mjs';

test('production guard requires rejection without leaking configured secrets', () => {
  assert.doesNotThrow(() =>
    evaluateProductionGuardResult(
      { status: 1, stdout: '', stderr: 'DEV_AUTH_ENABLED=true is forbidden in production' },
      ['smoke-token', 'db-password'],
    ),
  );
  assert.throws(
    () => evaluateProductionGuardResult({ status: 0, stdout: '', stderr: '' }, ['secret']),
    /accepted/,
  );
  assert.throws(
    () => evaluateProductionGuardResult({ status: null, stdout: '', stderr: '' }, ['secret']),
    /exit status/,
  );
  assert.throws(
    () => evaluateProductionGuardResult({ status: 1, stdout: '', stderr: 'secret' }, ['secret']),
    /leaked/,
  );
});
