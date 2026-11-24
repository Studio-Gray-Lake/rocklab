import { ROWS, STARTS, defaultSettings, showsOn, sizeOn } from '../src/settings.js';
import { madeOn } from '../src/make.js';

// Does the settings table (src/settings.js) tell the truth about a tab?
// For a tab on the test slope and a kind of rock, every slider is put at
// its least, its most and a third of the way between, and what the tab
// makes is made each time (src/make.js). A row is amiss if:
//   - making fails at one of its ends;
//   - the table shows it there, and it changes nothing;
//   - the table hides it there, and it changes something.
// (A third of the way, not half: half a turn of a layered stack is the
// same stack.) The land's own rows are left out: they are not handed to
// anything on the test slope.
//
// Gives { amiss: [{ key, what }], builds }.
export function rowsAmiss(tab, kind) {
  const base = { ...defaultSettings(), kind, ...STARTS[kind], size: sizeOn(tab, kind) };
  const amiss = [];
  let builds = 0;
  for (const row of ROWS) {
    if (!row.range || row.group.level === 'land') continue;
    const [least, most, step] = row.range;
    const third = Number((least + Math.round((most - least) / 3 / step) * step).toFixed(4));
    const made = (value) => {
      builds++;
      return JSON.stringify(madeOn(tab, { ...base, ...(row.given ?? {}), [row.key]: value }).made.list);
    };
    let changes;
    try {
      const [a, b] = [made(least), made(most)];
      changes = a !== b || a !== made(third);
    } catch (error) {
      amiss.push({ key: row.key, what: `fails at one of its ends: ${error.message}` });
      continue;
    }
    const shown = showsOn(row, tab, kind);
    if (shown && !changes) amiss.push({ key: row.key, what: 'is shown, and changes nothing' });
    if (!shown && changes) amiss.push({ key: row.key, what: 'is hidden, and changes something' });
  }
  return { amiss, builds };
}
