import { rowsAmiss } from './rows.js';

// `npm run check:rows`: does every slider the Cliff tab shows change the
// cliff, and none it hides? (scripts/rows.js.) A cliff takes about a
// second to make and this makes over a hundred, so it is run by hand,
// after a change to the table or to a maker: about a minute and a half of
// one core. The Stone and Cluster tabs are checked the same way by
// `npm test` (tests/settings.test.js), where it takes a few seconds.
//
//   npm run check:rows            the Cliff tab
//   npm run check:rows -- stone,cluster,cliff
const tabs = process.argv[2] ? process.argv[2].split(',') : ['cliff'];
let wrong = 0;
for (const tab of tabs) {
  for (const kind of ['granite', 'layered']) {
    const began = performance.now();
    const { amiss, builds } = rowsAmiss(tab, kind);
    console.log(`${tab}, ${kind}: made ${builds} times in ${((performance.now() - began) / 1000).toFixed(1)} s`);
    for (const { key, what } of amiss) console.log(`  "${key}" ${what}`);
    wrong += amiss.length;
  }
}
console.log(wrong ? `${wrong} rows amiss` : 'Every row shown changes what is made, and no hidden row does.');
process.exit(wrong ? 1 : 0);
