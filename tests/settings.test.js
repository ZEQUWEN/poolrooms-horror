import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveControlScheme, CONTROL_SCHEMES, CONTROL_SCHEME_DESCRIPTIONS } from '../src/settings.js';

test('auto scheme follows the device', () => {
  assert.equal(resolveControlScheme('auto', true), 'touch');
  assert.equal(resolveControlScheme('auto', false), 'desktop');
});

test('explicit schemes override the device', () => {
  assert.equal(resolveControlScheme('desktop', true), 'desktop');
  assert.equal(resolveControlScheme('touch', false), 'touch');
});

test('unknown or missing values fall back to auto', () => {
  assert.equal(resolveControlScheme('bogus', true), 'touch');
  assert.equal(resolveControlScheme(undefined, false), 'desktop');
  assert.equal(resolveControlScheme(null, true), 'touch');
});

test('every scheme value is documented for the settings UI', () => {
  for (const scheme of CONTROL_SCHEMES) {
    if (scheme === 'auto') continue;
    assert.ok(typeof CONTROL_SCHEME_DESCRIPTIONS[scheme] === 'string' && CONTROL_SCHEME_DESCRIPTIONS[scheme].length > 10);
  }
});
