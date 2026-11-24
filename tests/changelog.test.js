import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RELEASES } from '../src/changelog.js';
import { versionLabel, versionSays } from '../src/version.js';
import { showsWelcome, turnWelcomeOff, welcomeIsOff } from '../src/welcome.js';

// What the page says of itself: which Rock Lab it is (src/version.js), what
// each release brought (src/changelog.js), and the welcome card
// (src/welcome.js).

test('the release log: newest first, its top entry the version in package.json', () => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(RELEASES[0].version, version.replace(/\.0$/, ''), 'a release needs its entry at the top of the log');
  for (let i = 0; i < RELEASES.length; i++) {
    const { date, name, changes, post } = RELEASES[i];
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(name.length > 0 && changes.length > 0);
    for (const change of changes) assert.ok(change.length <= 140, `"${change}" is too long for a line`);
    assert.ok(post === null || post.startsWith('https://'));
    if (i > 0) assert.ok(RELEASES[i - 1].date >= date, 'newest first');
  }
});

test('the version beside the name: the version, then the commit, or the day for a website\'s', () => {
  assert.equal(versionLabel({ version: '0.2.0', date: '2026-11-25' }), '0.2.0 · 2026-11-25');
  assert.equal(versionLabel({ version: '0.2.0', date: '2026-11-25', hash: 'abc1234' }), '0.2.0 · abc1234');
  assert.equal(versionLabel({ version: '0.2.0', dev: true, hash: 'abc1234', changed: true }), '0.2.0 · dev · abc1234+');
  assert.equal(versionLabel(null), '');
  assert.match(versionSays({ version: '0.2.0', date: '2026-11-25' }), /^Rock Lab 0\.2\.0: built 2026-11-25\./);
});

test('the welcome card shows until a viewer asks not to see it again; with no storage, it shows', () => {
  const kept = new Map();
  const store = () => ({ getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v) });
  assert.equal(showsWelcome({ store }), true);
  assert.equal(turnWelcomeOff(store), true);
  assert.equal(welcomeIsOff(store), true);
  assert.equal(showsWelcome({ store }), false);
  const blocked = () => { throw new Error('no storage'); };
  assert.equal(showsWelcome({ store: blocked }), true);
  assert.equal(turnWelcomeOff(blocked), false);
});
