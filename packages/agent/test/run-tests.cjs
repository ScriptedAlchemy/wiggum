/* eslint-disable no-console */
const assert = require('assert');

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    failures++;
    console.error(`not ok - ${name}`);
    console.error(e && e.stack ? e.stack : e);
  }
}

let pending = 0;
function testAsync(name, fn) {
  pending++;
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch((e) => {
      failures++;
      console.error(`not ok - ${name}`);
      console.error(e && e.stack ? e.stack : e);
    })
    .finally(() => {
      pending--;
      if (pending === 0) end();
    });
}

function end() {
  if (failures) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  } else {
    console.log('\nAll tests passed');
  }
}
(async () => {
  const mod = await import('../dist/index.js');

  // deepMerge tests
  test('deepMerge: objects and arrays concat, ignore undefined', () => {
    const base = { a: 1, b: { c: 2, d: [1] }, e: [1, 2], f: 'x' };
    const override = { a: undefined, b: { c: 3, d: [2, 3] }, e: [3], f: undefined, g: 42 };
    const out = mod.deepMerge(base, override);
    assert.deepStrictEqual(out, {
      a: 1, // unchanged
      b: { c: 3, d: [1, 2, 3] },
      e: [1, 2, 3],
      f: 'x', // unchanged
      g: 42,
    });
  });

  test('deepMerge: array of objects concatenates', () => {
    const base = [{ id: 1 }, { id: 2 }];
    const override = [{ id: 3 }];
    const out = mod.deepMerge(base, override);
    assert.deepStrictEqual(out, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  test('deepMerge: arrays dedupe primitives', () => {
    const base = [1, 2, 2];
    const override = [2, 3, 3];
    const out = mod.deepMerge(base, override);
    assert.deepStrictEqual(out, [1, 2, 3]);
  });

  test('deepMerge: arrays dedupe objects by deep equality', () => {
    const base = [{ a: 1, b: 2 }, { a: 2 }];
    const override = [{ b: 2, a: 1 }, { a: 3 }]; // same as first object but keys in different order
    const out = mod.deepMerge(base, override);
    assert.deepStrictEqual(out, [{ a: 1, b: 2 }, { a: 2 }, { a: 3 }]);
  });

  // pickPreferredModel tests
  test('pickPreferredModel: prefers claude-sonnet-4-20250514 if available', () => {
    const providers = [
      { id: 'anthropic', models: { 'claude-sonnet-4-20250514': {} } },
      { id: 'openrouter', models: { 'qwen/qwen3-coder:free': {} } },
    ];
    const model = mod.pickPreferredModel(providers);
    assert.strictEqual(model, 'anthropic/claude-sonnet-4-20250514');
  });

  test('pickPreferredModel: falls back to openrouter qwen free', () => {
    const providers = [
      { id: 'openrouter', models: { 'qwen/qwen3-coder:free': {} } },
    ];
    const model = mod.pickPreferredModel(providers);
    assert.strictEqual(model, 'openrouter/qwen/qwen3-coder:free');
  });

  // buildMergedConfig tests (with injected fetchEnv)
  testAsync('buildMergedConfig: inject fetchEnv success and closes server', async () => {
    let closed = false;
    const fetchEnv = async () => ({
      config: {},
      providers: [{ id: 'openrouter', models: { 'qwen/qwen3-coder:free': {} } }],
      server: { close: () => { closed = true; } },
    });
    const cfg = await mod.buildMergedConfig({ fetchEnv });
    assert.strictEqual(cfg.model, 'openrouter/qwen/qwen3-coder:free');
    assert.ok(cfg.agent && cfg.agent['wiggum-assistant']);
    assert.strictEqual(closed, true, 'server.close should be called');
  });

  testAsync('buildMergedConfig: returns base on fetch error', async () => {
    const fetchEnv = async () => { throw new Error('fail'); };
    const cfg = await mod.buildMergedConfig({ fetchEnv });
    assert.ok(cfg.agent && cfg.agent['wiggum-assistant']);
  });

  // If there were no async tests, end() would fire now
  if (pending === 0) end();
})().catch((err) => {
  failures++;
  console.error('Fatal test error:', err);
  end();
});
