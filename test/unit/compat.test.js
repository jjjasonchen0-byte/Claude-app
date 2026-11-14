// Things that would stop the app loading or drawing on browsers still in
// use (iPhones on iOS 15 and 16.0–16.3 most of all).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const jsFiles = fs.readdirSync(path.join(root, 'public/js')).filter((f) => f.endsWith('.js'));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('no regular-expression look-behind in the app (Safari before 16.4 cannot parse one: the app would not load)', () => {
  for (const f of jsFiles) {
    const src = read(`public/js/${f}`);
    assert.doesNotMatch(src, /\(\?<[=!]/, `${f} uses a look-behind`);
  }
});

test('no Array.prototype.at() or similar newer methods in the app', () => {
  for (const f of jsFiles) {
    // Comments out, then what is left.
    const src = read(`public/js/${f}`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(/[\w)\]]\.(at|findLast|findLastIndex|toSorted|toReversed|toSpliced|replaceAll|groupBy)\(/g)) {
      // Our own functions with these names are fine (a flood's `at(node)`, the test version's `at(lat, lon)`).
      const own = new RegExp(`\\b${m[1]}\\s*[:=(]|\\b${m[1]}:`).test(src) && /\bat\b/.test(m[1]);
      assert.ok(own, `${f} uses .${m[1]}()`);
    }
  }
});

test('colours mixed with color-mix() are only used where the browser knows it', () => {
  const css = read('public/css/styles.css');
  const start = css.indexOf('@supports (color: color-mix(');
  assert.ok(start > 0, 'a @supports block for color-mix()');
  assert.doesNotMatch(css.slice(0, start), /color-mix\(/, 'color-mix() outside the @supports block');
  assert.equal(css.slice(start).trimEnd().endsWith('}'), true);
  // The block comes last, so it wins over the plain colours it improves on.
  const after = css.slice(start);
  assert.equal((after.match(/@supports/g) || []).length, 1);
});
