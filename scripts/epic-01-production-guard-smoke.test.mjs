import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRODUCTION_GUARD_EXIT_CODE,
  PRODUCTION_GUARD_SENTINEL,
  evaluateProductionGuardResult,
} from './epic-01-production-guard-smoke.mjs';

test('production guard requires rejection without leaking configured secrets', () => {
  assert.doesNotThrow(() =>
    evaluateProductionGuardResult(
      {
        status: PRODUCTION_GUARD_EXIT_CODE,
        stdout: '',
        stderr: `${PRODUCTION_GUARD_SENTINEL}\n`,
      },
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
    () => evaluateProductionGuardResult({ status: 1, stdout: '', stderr: 'import failed' }, []),
    /dedicated rejection/,
  );
  assert.throws(
    () =>
      evaluateProductionGuardResult(
        { status: 1, stdout: '', stderr: 'DATABASE_URL is required' },
        [],
      ),
    /dedicated rejection/,
  );
  assert.throws(
    () =>
      evaluateProductionGuardResult(
        { status: PRODUCTION_GUARD_EXIT_CODE, stdout: '', stderr: 'syntax error' },
        [],
      ),
    /sentinel/,
  );
  assert.throws(
    () => evaluateProductionGuardResult({ status: 1, stdout: '', stderr: 'secret' }, ['secret']),
    /leaked/,
  );
});
