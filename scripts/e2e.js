// End-to-end run in a real browser engine: plays several workout days with a
// controlled clock and checks every number against values worked out by hand.
// WebKit at iPhone size for the app, Chromium for the offline check.
// Set SHOTS=/some/dir to also write screenshots there.
import assert from 'node:assert/strict';
import { readFile, writeFile, appendFile, cp, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { webkit, chromium } from 'playwright';
import { serve } from './dev.js';
import { FORM } from '../src/form.js';
import { EXERCISES } from '../src/seed.js';

const SHOTS = process.env.SHOTS;
// BASE=https://example.com/reps/ runs the same checks against a deployed copy.
const server = process.env.BASE ? null : await serve();
const servers = [server];
const base = process.env.BASE || `http://127.0.0.1:${server.address().port}/reps/`;
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' };
const problems = [];
const browsers = [];
const tmp = await mkdtemp(`${tmpdir()}/reps-e2e-`);

function watch(page) {
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console error: ${m.text()}`));
  page.on('dialog', (d) => d.accept());
}

// Waits until the text matches, so checks do not race the render. Compares
// the text in the page, not its styling (headings are upper-cased by CSS).
async function see(locator, expected, what) {
  const deadline = Date.now() + 4000;
  let got;
  while (Date.now() < deadline) {
    got = await locator.first().textContent().catch(() => null);
    if (got != null && got.replace(/\s+/g, ' ').trim() === expected) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail(`${what}\n  expected: ${expected}\n  got:      ${got}`);
}

async function main() {
  const browser = await webkit.launch();
  browsers.push(browser);
  const context = await browser.newContext(phone);
  const page = await context.newPage();
  watch(page);

  const at = (day, hour = 10) => context.clock.setFixedTime(new Date(2026, 10, day, hour));
  const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const done = button('Done');
  const headline = page.locator('.headline');
  const openName = page.locator('.row.open h2');
  const row = (name) => page.locator('.row', { hasText: name });
  const result = (name) => page.locator('.results li', { hasText: name });
  const target = (name) => page.locator('.plan li', { hasText: name }).locator('.nums');
  const weight = page.getByLabel('weight', { exact: true });
  const reps = page.getByLabel('reps', { exact: true });
  // Logs every set of the open exercise. One tap per set unless a value is
  // given: `first` sets the weight once, `each` overrides reps per set.
  async function log({ first, each = [] } = {}, sets = 3) {
    if (first != null) await weight.fill(String(first));
    for (let i = 0; i < sets; i++) {
      if (each[i] != null) await reps.fill(String(each[i]));
      await done.click();
    }
  }
  const finishSession = () => button('Finish session').click();
  const home = async () => { await page.goto(base); await headline.waitFor(); };

  // Day 1, Mon 2 Nov: first ever session.
  await at(2);
  await home();
  await see(headline, '0 of 3 sessions this week', 'first launch headline');
  const weekLine = page.locator('.week');
  await see(weekLine, 'Train any 3 days this week. Weeks run Monday to Sunday.', 'no pressure before the first session');
  assert.equal(await page.locator('.punch .col.before').count(), 11, 'an empty card: eleven weeks before the start');
  assert.equal(await page.locator('.punch .col.open i:not(.on)').count(), 3, 'three open sessions this week');
  await see(page.locator('.today h2'), 'Routine A', 'first routine');
  await see(target('Leg Press'), '? kg 10 10 10', 'no history target');
  await shot('01-home-first');
  await button('Start Routine A').click();
  await see(openName, 'Leg Press', 'first exercise opens');
  await see(page.locator('.aim'), 'Pick a weight you could lift about 15 times, then do 10.', 'first-time prompt');
  assert.equal(await done.isDisabled(), true, 'Done is disabled until a weight is set');
  await shot('02-session-first');
  await weight.fill('40');
  await see(page.locator('.cell.now .cw'), '40 kg', 'the deck updates the plan as you type');
  // Tap budget: with the weight set, each set is exactly one tap, and the
  // Done button stays in the same place from set to set.
  const spot = await done.boundingBox();
  await done.click();
  assert.deepEqual(await done.boundingBox(), spot, 'Done does not move between sets');
  await done.click();
  await done.click();
  await see(openName, 'Chest Press', 'next exercise opens after three taps');
  assert.deepEqual(await done.boundingBox(), spot, 'Done does not move between exercises');
  await see(row('Leg Press').locator('.nums'), '40 kg 10 10 10', 'three sets logged in three taps');
  await log({ first: 20 });
  await log({ first: 30 });
  await see(openName, 'Dumbbell Shoulder Press', 'fourth exercise');
  await log({ first: 8 });
  assert.equal(await page.locator('.row.open').count(), 0, 'nothing open once the core is done');
  assert.deepEqual(await button('Finish session').boundingBox(), spot, 'Finish takes the place of Done');
  await finishSession();
  await see(headline, 'Starting numbers logged', 'first summary headline');
  await see(page.locator('.sub-head'), 'Session 1 of 3 for the week. Routine A, 1 min.', 'week count after one');
  await see(result('Leg Press').locator('.delta'), 'first time', 'first-time marker');
  await see(result('Leg Press').locator('> .nums'), '40 kg 10 10 10', 'logged sets');
  await see(result('Leg Press').locator('.next'), 'Next 40 kg 11 10 10 Same weight. One more rep on set 1.', 'next target');
  await page.getByRole('link', { name: 'Done' }).click();
  await see(headline, '1 of 3 sessions this week', 'home after one session');
  await see(weekLine, '2 to go, 6 days left. Wednesday and Friday would make 3.', 'the week plan leaves a rest day');
  await see(page.locator('.today h2'), 'Routine B', 'rotation moves to B');

  // Day 2, Wed 4 Nov: routine B plus cardio. Reload first: data must persist.
  await at(4, 18);
  await home();
  await see(headline, '1 of 3 sessions this week', 'data survives a reload');
  const keys = await page.evaluate(() => Object.keys(localStorage).sort().map((k) => k.replace(/^reps:s:.+/, 'reps:s:*')));
  assert.deepEqual(keys, ['reps:exercises', 'reps:routines', 'reps:s:*', 'reps:settings'], 'data is in localStorage');
  assert.deepEqual(await page.evaluate(() => indexedDB.databases()), [], 'and nothing is in IndexedDB');
  await see(weekLine, '2 to go, 5 days left. Today and Friday would make 3.', 'the week plan moves with the day');
  await button('Start Routine B').click();
  await see(openName, 'Romanian Deadlift', 'B starts with the hinge');
  await log({ first: 30 });
  await log({ first: 35 });
  await log({ first: 10 });
  await log({ first: 20 });
  await row('Cardio').click();
  await button('Stationary Bike').click();
  await button('More minutes').click();
  await see(page.locator('.cell.now'), 'Stationary Bike15 min', 'cardio cell follows the deck');
  await shot('03-session-cardio');
  assert.deepEqual(await done.boundingBox(), spot, 'Done is in the same place for cardio');
  await done.click();
  await see(row('Cardio').locator('.nums'), '15 min', 'cardio logged');
  await finishSession();
  await see(page.locator('.sub-head'), 'Session 2 of 3 for the week. Routine B, 1 min.', 'week count after two');
  await see(result('Stationary Bike').locator('.nums'), '15 min', 'cardio in summary');

  // Day 3, Fri 6 Nov: routine A again, now with targets to beat.
  await at(6, 7);
  await home();
  await see(headline, '2 of 3 sessions this week', 'home after two');
  await see(target('Leg Press'), '40 kg 11 10 10', 'home shows the target');
  await button('Start Routine A').click();
  assert.equal(await weight.inputValue(), '40', 'weight is pre-filled');
  assert.equal(await reps.inputValue(), '11', 'reps are pre-filled with the target');
  await see(page.locator('.last'), 'Last time 40 kg × 10, 10, 10', 'last time line');
  await see(page.locator('.aim'), 'Same weight. One more rep on set 1.', 'thing to beat');
  await shot('04-session-targets');
  await log(); // Leg Press 11, 10, 10: hits the suggestion in three taps
  await log({ each: [15] }); // Chest Press 15, 10, 10: far past the top
  await button('More reps').click(); // Seated Cable Row 12, 12, 12 with steppers
  await see(page.locator('.cell.now .cr'), '12', 'a stepper tap shows in the plan');
  await done.click();
  await shot('05-session-midway');
  for (let i = 0; i < 2; i++) {
    await button('More reps').click();
    await button('More reps').click();
    await done.click();
  }
  await see(openName, 'Dumbbell Shoulder Press', 'row done with steppers');
  await button('Less reps').click(); // Shoulder Press 9, 10, 10: a worse day
  await button('Less reps').click();
  await log();
  await row('Cable Crunch').click(); // the optional one
  await log({ first: 20 });
  await shot('06-session-complete');
  await finishSession();
  await see(headline, 'Beat last time on 3 of 4', 'wins headline');
  await see(page.locator('.sub-head'), 'Session 3 of 3 for the week. Week on target. Routine A, 1 min.', 'week on target');
  await see(result('Leg Press').locator('.delta'), '+1 rep', 'one more rep is a win');
  await see(result('Leg Press').locator('.next'), 'Next 40 kg 12 10 10 Same weight. One more rep on set 1.', 'rep rule');
  await see(result('Chest Press').locator('.delta'), '+5 reps', 'more total reps');
  await see(result('Chest Press').locator('.next'), 'Next 30 kg 8 8 8 15 reps is well past 12. Jump two steps, aim for 8.', 'fast ramp');
  await see(result('Seated Cable Row').locator('.delta'), '+6 reps', 'row delta');
  await see(result('Seated Cable Row').locator('.next'), 'Next 35 kg 8 8 8 Every set reached 12. Add weight, aim for 8.', 'top of range');
  await see(result('Dumbbell Shoulder Press').locator('.delta'), '−1 rep', 'a worse day is shown plainly');
  await see(result('Dumbbell Shoulder Press').locator('.next'), 'Next 8 kg 10 10 10 Same weight. One more rep on set 1.', 'recover the rep');
  await see(result('Cable Crunch').locator('.delta'), 'first time', 'optional exercise first time');
  await shot('07-summary-wins');
  await page.getByRole('link', { name: 'Done' }).click();
  await see(headline, '1 of 1 week on target', 'first week on target');
  await see(weekLine, 'Week on target.', 'nothing left to plan');
  await see(page.locator('.caption span').last(), 'This week 3 of 3', 'this week line');
  assert.equal(await page.locator('.punch .col.hit i.on').count(), 3, 'the week on target is punched three times');
  await shot('08-home-on-target');

  // Day 4, Mon 9 Nov: swap an exercise and keep it.
  await at(9);
  await home();
  await see(headline, '1 of 1 week on target', 'an unfinished week is not held against you');
  await see(page.locator('.caption span').last(), 'This week 0 of 3', 'new week starts empty');
  await see(weekLine, '3 to go, 7 days left. Today, Wednesday and Friday would make 3.', 'a fresh week plan');
  await button('Start Routine B').click();
  await button('Swap').click();
  await shot('09-swap-sheet');
  await button('Dumbbell Romanian Deadlift dumbbell').click();
  await see(openName, 'Dumbbell Romanian Deadlift', 'swapped in one tap');
  await see(page.locator('.swap-note'), 'In for Romanian Deadlift today. Keep in Routine B', 'swap note');
  await button('Keep in Routine B').click();
  await see(page.locator('.swap-note'), 'Routine B now uses this exercise.', 'kept');
  await weight.fill('12');
  await done.click();
  await button('Finish').click(); // one set still counts as a session
  await see(page.locator('.sub-head'), 'Session 1 of 3 for the week. Routine B, 1 min.', 'a short session counts');
  await page.goto(`${base}#/routine/b`);
  await see(page.locator('.item-head .name'), 'Dumbbell Romanian Deadlift', 'routine B changed for good');

  // Sun 15 Nov: one session this week and one day left, so 3 is out of
  // reach. The app offers a catch-up drawn from both routines.
  await at(15);
  await home();
  await see(weekLine, '3 is out of reach this week. One catch-up session still covers the whole body.', 'out of reach');
  await see(page.locator('.today h2'), 'Catch-up', 'the catch-up is chosen for you');
  const planNames = async () => (await page.locator('.plan .name').allTextContents()).map((t) => t.trim());
  assert.deepEqual(await planNames(), ['Leg Press', 'Incline Dumbbell Press', 'Seated Cable Row', 'Leg Curl'],
    'both leg patterns, a push and a pull, skipping what this week already had');
  assert.equal(await button('Start catch-up').count(), 1, 'the main button starts the catch-up');
  await shot('18-home-catch-up');
  await button('15 minutes').click();
  await see(page.locator('.today h2'), 'Routine A', 'the short version belongs to the next routine');
  assert.deepEqual(await planNames(), ['Chest Press', 'Seated Cable Row'], 'the two closest to a weight increase, from different families');
  await see(target('Chest Press'), '30 kg 8 8', 'two sets, already due a jump');
  await see(target('Seated Cable Row'), '35 kg 8 8', 'two sets at the next weight');
  assert.equal(await button('Start 15 minutes').count(), 1, 'the main button follows the choice');
  await shot('19-home-short');
  await button('Full session').click();
  assert.equal(await button('Start Routine A').count(), 1, 'the full routine is one tap away');

  // Mon 30 Nov: three weeks away.
  await at(30);
  await home();
  await see(headline, '1 of 4 weeks on target', 'hit rate after missed weeks');
  assert.equal(await page.locator('.punch .col.before').count(), 7, 'five weeks on the card so far');
  assert.equal(await page.locator('.punch .col.miss').count(), 3, 'three weeks missed');
  await see(page.locator('.back'), 'Welcome back. 21 days away, so weights start about 10 percent lighter.', 'welcome back');
  await see(weekLine, '3 to go, 7 days left. Today, Wednesday and Friday would make 3.', 'week plan after a break');
  await see(page.locator('.today h2'), 'Routine A', 'rotation continues after the break');
  await see(target('Leg Press'), '35 kg 8 8 8', 'lighter after a break');
  await see(target('Chest Press'), '15 kg 8 8 8', 'lighter by at least one step');
  await shot('10-home-back');

  // Custom exercise, routine edit, units.
  await page.getByRole('link', { name: 'Program', exact: true }).click();
  await shot('11-program');
  await page.goto(`${base}#/`);
  await page.getByRole('link', { name: 'Exercises', exact: true }).click();
  await shot('12-library');
  await page.getByRole('link', { name: 'New exercise' }).click();
  await page.getByPlaceholder('Exercise name').fill('Sled Push');
  await shot('13-exercise');
  await button('Save').click();
  await see(page.locator('.bar h1'), 'Sled Push', 'a new exercise opens on its page');
  assert.equal(await page.locator('canvas').count(), 0, 'no empty clip frame without a clip');
  await page.locator('.back').click();
  await see(page.locator('.list li', { hasText: 'Sled Push' }).locator('.sub'), 'machine, custom', 'custom exercise in the library');
  await page.goto(`${base}#/routine/a`);
  await button('Add exercise').click();
  await page.getByLabel('Search exercises').fill('sled');
  await button('Sled Push machine').click();
  await button('More sets of Leg Press').click();
  await shot('14-routine-editor');
  await home();
  await see(target('Leg Press'), '35 kg 8 8 8 8', 'routine edit reaches the plan');
  await see(target('Sled Push'), '? kg 10 10 10', 'custom exercise in the plan');
  await page.goto(`${base}#/program`);
  await button('lb').click();
  await home();
  await see(target('Leg Press'), '70 lb 8 8 8 8', 'pounds use the pound step');
  await page.goto(`${base}#/program`);
  await button('kg').click();

  // Backup: export, delete a session, import, and the session is back.
  const shares = await page.evaluate(() => typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] }));
  if (shares) await page.evaluate(() => { navigator.canShare = () => false; });
  const [download] = await Promise.all([page.waitForEvent('download'), button('Export backup').click()]);
  const file = `${tmp}/backup.json`; // a copy: the browser's own file goes away with its context
  await download.saveAs(file);
  const backup = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(backup.sessions.length, 4, 'backup holds all four sessions');
  assert.equal(backup.exercises.some((e) => e.name === 'Sled Push'), true, 'backup holds the custom exercise');
  await page.goto(`${base}#/past`);
  await shot('15-past');
  assert.equal(await page.locator('.list li').count(), 4, 'four past sessions');
  await page.locator('.list a').first().click();
  await button('Delete').click();
  await page.locator('.list li').nth(2).waitFor();
  assert.equal(await page.locator('.list li').count(), 3, 'session deleted');
  await page.goto(`${base}#/program`);
  await page.locator('input[type=file]').setInputFiles(file);
  await see(page.locator('.notice'), 'Backup restored: 4 sessions.', 'import feedback');
  await page.goto(`${base}#/past`);
  await page.locator('.list li').nth(3).waitFor();

  // Correct a past session: Fri 6 Nov, Leg Press set 1 was really 12.
  await page.locator('.list a', { hasText: 'Routine A' }).first().click();
  await see(result('Leg Press').locator('.delta'), '+1 rep', 'before the correction');
  await page.getByRole('link', { name: 'Correct' }).click();
  await row('Leg Press').click();
  await page.locator('.cell.done').first().click();
  await reps.fill('12');
  await done.click();
  await button('Save changes').click();
  await see(result('Leg Press').locator('.delta'), '+2 reps', 'after the correction');

  // Build a program around five exercises the user knows.
  await page.goto(`${base}#/program`);
  await page.getByRole('link', { name: 'Build from exercises you know' }).click();
  assert.equal(await button('Pick an exercise').isDisabled(), true, 'nothing to build from yet');
  for (const name of ['Bench Press barbell', 'Lat Pulldown cable', 'Leg Press machine', 'Dumbbell Curl dumbbell', 'Cable Crunch cable']) {
    await button(name).click();
  }
  await shot('16-build-pick');
  await button('Build with 5 exercises').click();
  await page.locator('.built').first().waitFor();
  assert.equal(await page.evaluate(() => scrollY), 0, 'the built program opens at its top');
  const built = (n) => page.locator('.built').nth(n).locator('li');
  const lines = async (n) => (await built(n).allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
  assert.deepEqual(await lines(0), [
    'Leg Pressyours', 'Bench Pressyours', 'Seated Cable Rowadded: no row yet',
    'Dumbbell Shoulder Pressadded: no overhead press yet', 'Cable Crunchoptionalyours',
  ], 'routine A is built around the picks');
  assert.deepEqual(await lines(1), [
    'Romanian Deadliftadded: no hip hinge yet', 'Lat Pulldownyours', 'Incline Dumbbell Pressadded: a second push',
    'Leg Curladded: hamstrings', 'Dumbbell Curloptionalyours',
  ], 'routine B fills the gaps');
  await shot('17-build-result');
  await button('Use this program').click();
  await see(page.locator('.today h2'), 'Routine A', 'the new program starts at its first routine');
  await see(target('Bench Press'), '? kg 10 10 10', 'a newly included exercise starts fresh');
  await see(target('Leg Press'), '35 kg 8 8 8', 'an exercise with history keeps its weights');
  assert.equal(await page.locator('.plan li').count(), 6, 'five exercises and cardio');
  await page.reload();
  await see(target('Bench Press'), '? kg 10 10 10', 'the built program survives a reload');
  await context.close();

  // Behind on the week: do the catch-up, then a 15-minute session. Starts
  // from the backup (four sessions up to Mon 9 Nov), on Sun 15 Nov.
  {
    const ctx = await browser.newContext(phone);
    await ctx.clock.setFixedTime(new Date(2026, 10, 15, 10));
    const p = await ctx.newPage();
    watch(p);
    const btn = (name) => p.getByRole('button', { name, exact: true });
    const res = (name) => p.locator('.results li', { hasText: name });
    await p.goto(`${base}#/program`);
    await p.locator('input[type=file]').setInputFiles(file);
    await p.locator('.notice').waitFor();
    await p.goto(base);
    await p.reload();
    await btn('Start catch-up').click();
    await see(p.locator('.bar h1'), 'Catch-up', 'the session is named for what it is');
    assert.equal(await p.locator('.row').count(), 5, 'four exercises and cardio');
    for (let i = 0; i < 4; i++) await btn('Done').click(); // Leg Press 12, 10, 10, 8
    await see(p.locator('.row.open h2'), 'Incline Dumbbell Press', 'moves on to the next catch-up exercise');
    await btn('Finish').click();
    await see(p.locator('.headline'), 'Beat last time on 1 of 1', 'catch-up summary');
    await see(p.locator('.sub-head'), 'Session 2 of 3 for the week. Catch-up, 1 min.', 'a catch-up counts as one session');
    await see(res('Leg Press').locator('.delta'), '+9 reps', 'four sets against three');
    await see(res('Leg Press').locator('.next'), 'Next 40 kg 12 11 10 8 Same weight. One more rep on set 2.', 'next time follows the routine');
    assert.equal(await p.locator('.pace').count(), 0, 'three sessions are too few for a forecast');
    await p.getByRole('link', { name: 'Done' }).click();
    await see(p.locator('.week'), '3 is out of reach this week.', 'trained today, so no second catch-up');
    await see(p.locator('.today h2'), 'Routine A', 'a catch-up does not move the rotation');
    await ctx.clock.setFixedTime(new Date(2026, 10, 15, 16));
    await btn('15 minutes').click();
    await btn('Start 15 minutes').click();
    await see(p.locator('.bar h1'), 'Short Routine A', 'short session name');
    for (let i = 0; i < 4; i++) await btn('Done').click(); // Chest Press 8, 8 then Seated Cable Row 8, 8
    await btn('Finish session').click();
    await see(p.locator('.headline'), 'Beat last time on 2 of 2', 'short session summary');
    await see(p.locator('.sub-head'), 'Session 3 of 3 for the week. Week on target. Short Routine A, 1 min.', 'a short session counts');
    await see(res('Chest Press').locator('.delta'), '+10 kg', 'the jump it was due');
    await p.getByRole('link', { name: 'Done' }).click();
    await see(p.locator('.headline'), '2 of 2 weeks on target', 'the week was saved');
    await see(p.locator('.today h2'), 'Routine B', 'a short session moves the rotation on');
    await ctx.close();
  }

  // Habits, forecast and usual swap need more history: four weeks of
  // Monday, Wednesday and Friday evenings, built on top of the backup.
  {
    const seeded = JSON.parse(await readFile(file, 'utf8'));
    seeded.sessions = [5, 7, 9, 12, 14, 16, 19, 21, 23, 26, 28, 30].map((day, k) => {
      const start = new Date(2026, 9, day, 18).getTime();
      const set = (w, r) => ({ w, r, done: true, t: start + 600000 });
      const j = Math.floor(k / 2);
      const entry = k % 2 === 0
        ? { ex: 'leg-press', sets: Array(3).fill(set([30, 30, 35, 35, 40, 40][j], j % 2 ? 12 : 10)) }
        : { ex: 'close-grip-pulldown', swapped: 'lat-pulldown', sets: [set(30, 10)] };
      return {
        id: `h${k}`, routineId: k % 2 ? 'b' : 'a', name: k % 2 ? 'Routine B' : 'Routine A',
        start, end: start + 1800000, cardio: null, entries: [{ min: 8, max: 12, reason: '', ...entry }],
      };
    });
    const seedFile = `${tmp}/seeded.json`;
    await writeFile(seedFile, JSON.stringify(seeded));
    const ctx = await browser.newContext(phone);
    await ctx.clock.setFixedTime(new Date(2026, 10, 2, 12));
    const p = await ctx.newPage();
    watch(p);
    await p.goto(`${base}#/program`);
    await p.locator('input[type=file]').setInputFiles(seedFile);
    await see(p.locator('.notice'), 'Backup restored: 12 sessions.', 'seed data imported');
    await p.goto(base);
    await p.reload();
    await see(p.locator('.headline'), '4 of 4 weeks on target', 'four seeded weeks');
    await see(p.locator('.week'),
      '3 to go, 7 days left. Today, Wednesday and Friday would make 3. You usually train on Monday, Wednesday and Friday evenings.',
      'the app has learned the usual days and time');
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/23-home-habits.png` });
    await p.getByRole('link', { name: 'Past', exact: true }).click();
    await p.locator('.list a', { hasText: 'Routine A' }).first().click();
    const pace = (await p.locator('.pace').textContent()).trim();
    assert.match(pace, /^On pace for 45 kg around .+, 50 kg around .+\.$/, `forecast from six sessions, got: ${pace}`);
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/24-summary-forecast.png` });
    await p.goto(base);
    await p.getByRole('button', { name: 'Switch' }).click();
    await p.getByRole('button', { name: 'Start Routine B' }).click();
    await p.locator('.row', { hasText: 'Lat Pulldown' }).click();
    await p.getByRole('button', { name: 'Swap' }).click();
    await see(p.locator('.sheet .pick').first(), 'Close-Grip Pulldownyour usual swap', 'the usual swap is offered first');
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/25-usual-swap.png` });
    await ctx.close();
  }

  // The explorer, the exercise page and the form clip. Motion on: the clip
  // must really move, pause, and stop when its page is left.
  {
    const ctx = await browser.newContext({ ...phone, reducedMotion: 'no-preference' });
    await ctx.clock.setFixedTime(new Date(2026, 10, 11, 10));
    await ctx.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      window.frames_ = 0;
      window.requestAnimationFrame = (fn) => raf((t) => { window.frames_++; fn(t); });
    });
    const p = await ctx.newPage();
    watch(p);
    const btn = (name) => p.getByRole('button', { name, exact: true });
    const chip = (group, name) => p.getByRole('group', { name: group }).getByRole('button', { name, exact: true });
    const names = async () => (await p.locator('.list .name').allTextContents());
    await p.goto(`${base}#/program`);
    await p.locator('input[type=file]').setInputFiles(file);
    await p.locator('.notice').waitFor();
    await p.goto(base);
    await p.reload();
    await p.getByRole('link', { name: 'Exercises', exact: true }).click();
    await p.locator('.filters').waitFor();
    assert.equal((await names()).length, 94, '93 exercises and one custom');
    await chip('Muscle', 'Back').click();
    await chip('Equipment', 'cable').click();
    assert.deepEqual(await names(), ['Close-Grip Pulldown', 'Face Pull', 'Lat Pulldown', 'Seated Cable Row', 'Straight-Arm Pulldown'], 'filters combine');
    assert.equal(await chip('Equipment', 'cardio').isDisabled(), true, 'a filter that would empty the list is off');
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/40-explore-filter.png` });
    await p.getByRole('link', { name: /^Seated Cable Row/ }).click();
    await see(p.locator('.bar h1'), 'Seated Cable Row', 'exercise page');
    await p.locator('.back').click();
    await p.locator('.filters').waitFor();
    assert.equal((await names()).length, 5, 'filters survive opening an exercise');
    await chip('Muscle', 'Back').click();
    await chip('Equipment', 'cable').click();
    await p.evaluate(() => scrollTo(0, 2400));
    await p.waitForTimeout(400);
    const at = await p.evaluate(() => scrollY);
    assert.ok(at > 1500, 'the list is scrolled');
    await p.locator('.list a').nth(Math.round(at / 65) - 2).evaluate((a) => a.click());
    await p.locator('.exercise').waitFor();
    assert.equal(await p.evaluate(() => scrollY), 0, 'a page opens at its top');
    await p.locator('.back').click();
    await p.locator('.filters').waitFor();
    assert.equal(await p.evaluate(() => scrollY), at, 'the list is where it was');

    // More pages than a browser allows graphics contexts: the last still draws.
    for (const id of [...Object.keys(FORM), ...Object.keys(FORM), 'leg-press']) {
      await p.goto(`${base}#/exercise/${id}`);
      await see(p.locator('.bar h1'), EXERCISES.find((x) => x.id === id).name, 'page after page');
      await p.waitForTimeout(60);
      if (id === 'leg-press') continue; // its lowest point is a thin post, which shades little
      // The floor is darker just below the lowest point of what stands on it.
      const shade = await p.evaluate(() => {
        const c = document.querySelector('.clip canvas');
        const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
        let low = data.length - 4;
        while (low > 0 && data[low + 3] < 255) low -= 4;
        return data[low + 4 * (4 * c.width - 12) + 3] / 255;
      });
      assert.ok(shade > 0.03 && shade < 0.7, `${id}: the floor under the figure is shaded ${shade.toFixed(2)}`);
    }
    await p.waitForTimeout(300);
    const full = await p.locator('.clip canvas').screenshot();
    assert.ok(full.length > 12000, `the last of many clips draws: ${full.length} bytes`);
    assert.equal(await p.locator('.steps dd').count(), 3, 'three steps');
    await see(p.locator('.muscles'), 'Works quads and glutesHelped by hamstrings and calves', 'muscles');
    await see(p.locator('.best'), 'Best set40 kg × 11Fri, Nov 6', 'best set');
    assert.deepEqual((await p.locator('.exercise .plan li').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim()),
      ['Fri, Nov 640 kg 11 10 10', 'Mon, Nov 240 kg 10 10 10'], 'recent sessions, newest first');
    const picture = async () => (await p.locator('.clip canvas').screenshot()).toString('base64');
    const heard = new Set();
    for (let i = 0; i < 60; i++) {
      // Both in one read: the rep can move on between two.
      heard.add(await p.locator('.say').evaluate((el) => `${el.querySelector('b').textContent}/${el.querySelector('span').textContent}`));
      await p.waitForTimeout(90);
    }
    assert.deepEqual([...heard].sort(), ['Hold/', 'Lower/Slowly, breathe in', 'Push/Breathe out'], 'the words follow the rep');
    // Materials: the picture changes without them, and without their grain; and the
    // grain belongs to the figure, so moving figure and camera together changes nothing.
    const differ = await p.evaluate(async () => {
      const at = (file) => import(new URL(`src/${file}.js`, document.baseURI));
      const [F, B, S, { FORM: forms }] = await Promise.all(['figure', 'body', 'stage', 'form'].map(at));
      const canvas = Object.assign(document.createElement('canvas'), { width: 600, height: 460 });
      const stage = S.createStage(canvas);
      const draw = (change, shift = 0, clip = forms.rdl, turn = 0) => {
        const mesh = B.build(B.createMesh(), clip, F.solve(clip.pose(0)), 0);
        const cloud = Array.from({ length: mesh.n }, (_, i) => mesh.v.slice(i * B.STRIDE, i * B.STRIDE + 3));
        for (let i = 0; i < mesh.n; i++) {
          change(mesh.v.subarray(i * B.STRIDE, (i + 1) * B.STRIDE));
          mesh.v[i * B.STRIDE] += shift;
        }
        const camera = S.frameCamera(cloud.map(([x, y, z]) => [x + shift, y, z]), clip.yaw + turn, 10, 600 / 460);
        stage.draw(mesh, B.dots(B.createMesh(), []), camera, { dark: false, reach: 90 });
        const flat = Object.assign(document.createElement('canvas'), { width: 600, height: 460 }).getContext('2d');
        flat.drawImage(canvas, 0, 0);
        return flat.getImageData(0, 0, 600, 460).data;
      };
      const whole = draw(() => {});
      const apart = (other) => {
        let sum = 0;
        let n = 0;
        for (let i = 0; i < whole.length; i += 4) {
          if (whole[i + 3] < 255 || other[i + 3] < 255) continue;
          sum += Math.abs(whole[i] - other[i]) + Math.abs(whole[i + 1] - other[i + 1]) + Math.abs(whole[i + 2] - other[i + 2]);
          n++;
        }
        return sum / n;
      };
      return { plain: apart(draw((v) => { v[9] = 0; })), grain: apart(draw((v) => v.fill(0, 10))), moved: apart(draw(() => {}, 7.3)), white: draw(() => {}, 0, forms['leg-press'], -90).reduce((n, x, i, d) => n + (i % 4 === 3 && x === 255 && Math.min(d[i - 1], d[i - 2], d[i - 3]) > 240 ? 1 : 0), 0) };
    });
    assert.ok(differ.plain > 8 && differ.grain > 1.5 && differ.moved < 0.8 && differ.white === 0, `materials: ${JSON.stringify(differ)}`);
    // In a hold the figure still breathes: the picture changes between two moments of it.
    const [early, late, word] = await p.evaluate(() => new Promise((done) => {
      const canvas = document.querySelector('.clip canvas');
      const say = document.querySelector('.say b');
      let moved = false;
      let first, since;
      const look = (now) => {
        if (say.textContent !== 'Hold') moved = true;
        else if (moved && !first) [first, since] = [canvas.toDataURL(), now];
        if (first && now - since > 250) return done([first, canvas.toDataURL(), say.textContent]);
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    }));
    assert.equal(word, 'Hold');
    assert.ok(early !== late, 'a held clip breathes');
    await p.waitForFunction(() => document.querySelector('.say b').textContent === 'Lower');
    const one = await picture();
    await p.waitForTimeout(500);
    assert.notEqual(await picture(), one, 'the clip moves');
    const clip = p.locator('.clip');
    await clip.click();
    assert.equal(await clip.getAttribute('aria-label'), 'Leg Press clip. Tap to play.', 'a tap pauses');
    await p.waitForTimeout(300);
    const still = await picture();
    await p.waitForTimeout(400);
    assert.equal(await picture(), still, 'and the picture stands still');
    const area = await clip.boundingBox();
    const disc = await p.locator('.play .icon').boundingBox();
    assert.ok(disc.x > area.x + area.width * 0.8 && disc.y > area.y + area.height * 0.8 && disc.width >= 40,
      `the play sign sits in the bottom right corner: ${JSON.stringify(disc)}`);
    await p.mouse.move(area.x + 250, area.y + 150);
    await p.mouse.down();
    await p.mouse.move(area.x + 120, area.y + 155, { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(200);
    assert.notEqual(await picture(), still, 'a drag turns the figure');
    assert.equal(await clip.getAttribute('aria-label'), 'Leg Press clip. Tap to play.', 'and does not count as a tap');
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/41-exercise-paused.png` });
    await clip.click();
    await btn('Add to a routine').click();
    assert.equal(await p.locator('.sheet .pick', { hasText: 'Routine A' }).isDisabled(), true, 'already in Routine A');
    await p.locator('.sheet .pick', { hasText: 'Routine B' }).click();
    await see(p.locator('.dock .btn'), 'Added to Routine B', 'adding is confirmed');
    await p.goto(`${base}#/past`);
    await p.waitForTimeout(800);
    const before = await p.evaluate(() => window.frames_);
    await p.waitForTimeout(400);
    assert.equal(await p.evaluate(() => window.frames_), before, 'nothing animates once the page is left');
    await p.goto(`${base}#/`);
    await p.getByRole('button', { name: 'Switch' }).click();
    const onHome = () => p.locator('.plan .name').allTextContents();
    await see(p.locator('.today h2'), 'Routine B', 'routine B on Home');
    assert.ok((await onHome()).some((n) => n.includes('Leg Press')), 'the added exercise is in the plan');

    // Form, mid-session: the set in progress is untouched.
    await btn('Start Routine B').click();
    await p.locator('.row', { hasText: 'Lat Pulldown' }).click();
    await see(p.locator('.deck-title'), 'Lat Pulldown, set 1 of 3', 'the deck follows the open exercise');
    await p.getByLabel('weight', { exact: true }).fill('42.5');
    await btn('Form').click();
    await p.locator('.sheet canvas').waitFor();
    await p.waitForTimeout(300);
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/42-form-sheet.png` });
    await p.mouse.click(195, 30);
    await p.locator('.sheet').waitFor({ state: 'detached' });
    assert.equal(await p.getByLabel('weight', { exact: true }).inputValue(), '42.5', 'the set in progress is kept');
    await ctx.close();

    // Reduce Motion: two stills, nothing moving.
    const calm = await browser.newContext(phone);
    const c = await calm.newPage();
    watch(c);
    await c.goto(`${base}#/exercise/rdl`);
    await see(c.locator('.stills'), 'StartEnd', 'start and end side by side');
    await c.waitForTimeout(400);
    const shots = [];
    for (const i of [0, 1]) shots.push((await c.locator('canvas').nth(i).screenshot()).toString('base64'));
    assert.notEqual(shots[0], shots[1], 'the two stills differ');
    await c.waitForTimeout(400);
    assert.equal((await c.locator('canvas').first().screenshot()).toString('base64'), shots[0], 'and do not move');
    await calm.close();
  }

  // Feels like an app: data in the first frame, back that goes back, no zoom,
  // no selection, and a deck that stays above the keyboard.
  {
    const ctx = await browser.newContext(phone);
    await ctx.clock.setFixedTime(new Date(2026, 10, 11, 10));
    const p = await ctx.newPage();
    watch(p);
    await p.goto(`${base}#/program`);
    await p.locator('input[type=file]').setInputFiles(file);
    await p.locator('.notice').waitFor();
    await p.addInitScript(() => {
      new MutationObserver((_, o) => {
        const app = document.getElementById('app');
        if (!app?.firstChild) return;
        window.firstFrame = app.textContent;
        o.disconnect();
      }).observe(document, { childList: true, subtree: true });
    });
    await p.goto(base);
    await p.reload();
    const btn = (name) => p.getByRole('button', { name, exact: true });
    const link = (name) => p.getByRole('link', { name, exact: true });
    const path = async (want, what) => {
      await p.waitForFunction((w) => (location.hash.slice(1) || '/') === w, want, { timeout: 3000 })
        .catch(async () => assert.fail(`${what}: at ${await p.evaluate(() => location.hash)}, not ${want}`));
    };
    await p.locator('.headline').waitFor();
    assert.match(await p.evaluate(() => window.firstFrame), /^1 of 1 week on target.*Routine A.*40 kg 11|^1 of 1 week on target.*Routine A.*Leg Press40 kg 12 10 10/s, 'the first frame already has your data');

    await link('Exercises').click();
    await path('/library', 'explorer');
    await p.getByRole('link', { name: /^Leg Press/ }).click();
    await path('/exercise/leg-press', 'exercise');
    await p.locator('.back').click();
    await path('/library', 'the arrow goes back to the list');
    await p.goBack();
    await path('/', 'a swipe back then leads Home, not into the exercise again');
    await btn('Start Routine A').click();
    await path('/session', 'session');
    await btn('Done').click();
    const depth = await p.evaluate(() => history.length);
    await btn('Finish').click();
    await p.locator('.summary').waitFor();
    assert.equal(await p.evaluate(() => history.length), depth, 'the summary takes the place of the session');
    await p.goBack();
    await path('/', 'a swipe back from a summary leads Home, not into the session');
    await link('Past').click();
    await p.locator('.list a').first().click();
    await p.locator('.summary').waitFor();
    const summaryPath = await p.evaluate(() => location.hash.slice(1));
    await link('Correct').click();
    await p.locator('.session').waitFor();
    await btn('Save').click();
    await path(summaryPath, 'a correction returns to the summary');
    await p.locator('.summary').waitFor();
    await link('Done').click();
    await path('/', 'Done leads Home');
    await link('Past').click();
    await path('/past', 'past');
    await p.goBack();
    await path('/', 'and Home is right behind it');
    await p.goto(`${base}#/nowhere`);
    await see(p.locator('.headline'), '1 of 1 week on target', 'an unknown address shows Home');

    const look = await p.evaluate(() => ({
      viewport: document.querySelector('meta[name=viewport]').content,
      select: getComputedStyle(document.querySelector('.headline')).webkitUserSelect,
      touch: getComputedStyle(document.querySelector('.dock .btn')).touchAction,
    }));
    assert.match(look.viewport, /user-scalable=no/, 'no pinch zoom');
    assert.equal(look.select, 'none', 'text is not selectable');
    assert.equal(look.touch, 'pan-x pan-y', 'no double-tap zoom');
    await link('Program').click();
    assert.match(await p.locator('.note').last().textContent(), /^Opened in \d+ ms\. Using \d+\.\d of about 5 MB\.$/, 'launch time and space');
    await p.locator('.list a').first().click();
    assert.equal(await p.locator('.field input').evaluate((el) => getComputedStyle(el).webkitUserSelect), 'text', 'fields can be edited normally');
    await p.goto(`${base}#/`);
    await btn('Start Routine B').click();
    await p.getByLabel('weight', { exact: true }).focus();
    const keyboard = (height) => p.evaluate((h) => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => innerHeight - h });
      visualViewport.dispatchEvent(new Event('resize'));
    }, height);
    const deckBottom = () => p.locator('.dock').evaluate((el) => innerHeight - el.getBoundingClientRect().bottom);
    await keyboard(336);
    assert.equal(await deckBottom(), 336, 'the deck sits on the keyboard');
    await p.getByLabel('weight', { exact: true }).press('Enter');
    await p.waitForTimeout(50);
    assert.equal(await deckBottom(), 0, 'Return closes it, and the deck goes back even if the viewport has not');
    await ctx.close();
  }

  // Every clip, as a user sees it.
  if (SHOTS) {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ ...phone, colorScheme: scheme, reducedMotion: 'no-preference' });
      const p = await ctx.newPage();
      watch(p);
      for (const id of Object.keys(FORM)) {
        await p.goto(`${base}#/exercise/${id}`);
        await p.locator('canvas').waitFor();
        await p.waitForTimeout(1300);
        await p.screenshot({ path: `${SHOTS}/clip-${scheme}-${id}.png` });
      }
      await ctx.close();
    }
  }

  // Dark theme screenshots from the same data.
  if (SHOTS) {
    const dark = await browser.newContext({ ...phone, colorScheme: 'dark' });
    await dark.clock.setFixedTime(new Date(2026, 10, 11, 10));
    const p = await dark.newPage();
    watch(p);
    await p.goto(`${base}#/program`);
    await p.locator('input[type=file]').setInputFiles(file);
    await p.locator('.notice').waitFor();
    await p.goto(base);
    await p.reload();
    await p.locator('.headline').waitFor();
    await p.screenshot({ path: `${SHOTS}/20-dark-home.png` });
    await p.getByRole('button', { name: 'Start Routine A' }).click();
    await p.getByRole('button', { name: 'Done', exact: true }).click();
    assert.equal(await p.evaluate(() => document.querySelector('.setadj').offsetTop === document.querySelector('.cellgrid').offsetTop), true, 'four sets and the set buttons share one row');
    await p.screenshot({ path: `${SHOTS}/21-dark-session.png` });
    await p.goto(`${base}#/past`);
    await p.locator('.list a', { hasText: 'Routine A' }).first().click();
    await p.locator('.results').waitFor();
    await p.screenshot({ path: `${SHOTS}/22-dark-summary.png` });
    await dark.close();
  }

  // Motion on, on the narrowest iPhone width: screen changes animate, the
  // flow still works, and nothing overflows sideways.
  const small = await browser.newContext({ ...phone, viewport: { width: 320, height: 568 }, reducedMotion: 'no-preference' });
  const s = await small.newPage();
  watch(s);
  const fits = async (what) => assert.equal(
    await s.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${what} fits a 320px screen`);
  await s.goto(base);
  await s.locator('.headline').waitFor();
  await fits('home');
  await s.getByRole('button', { name: 'Start Routine A' }).click();
  await s.getByLabel('weight', { exact: true }).fill('42.5');
  await fits('session');
  assert.equal(await s.getByLabel('weight', { exact: true }).evaluate((el) => el.scrollWidth <= el.clientWidth), true,
    'a weight like 42.5 is not clipped on a 320px screen');
  await s.getByRole('button', { name: 'Add a set' }).click();
  assert.equal(await s.locator('.cell').count(), 4, 'a set is added');
  assert.equal(await s.evaluate(() => document.querySelector('.setadj').offsetTop === document.querySelector('.cellgrid').offsetTop), true, 'add and remove stay beside the sets');
  await s.getByRole('button', { name: 'Remove a set' }).click();
  assert.equal(await s.locator('.cell').count(), 3, 'a set is removed');
  await s.waitForFunction(() => document.getAnimations().length === 0, null, { timeout: 3000 })
    .catch(() => assert.fail('the screen change animation never finished'));
  if (SHOTS) await s.screenshot({ path: `${SHOTS}/30-small-session.png` });
  for (let i = 0; i < 3; i++) await s.getByRole('button', { name: 'Done', exact: true }).click();
  await see(s.locator('.row.open h2'), 'Chest Press', 'flow works with motion on');
  // On the smallest screen the open exercise must still be between the bar
  // and the deck, all the way down the plan.
  const inView = async (what) => {
    await s.waitForTimeout(400);
    const v = await s.evaluate(() => {
      const box = (q) => document.querySelector(q).getBoundingClientRect();
      return { bar: box('.bar').bottom, title: box('.row.open h2').top, cells: box('.row.open .cells').bottom, deck: box('.dock').top };
    });
    assert.ok(v.title >= v.bar && v.cells <= v.deck, `${what} is in view: ${JSON.stringify(v)}`);
  };
  await inView('Chest Press');
  for (const next of ['Seated Cable Row', 'Dumbbell Shoulder Press']) {
    await s.getByLabel('weight', { exact: true }).fill('20');
    for (let i = 0; i < 3; i++) await s.getByRole('button', { name: 'Done', exact: true }).click();
    await see(s.locator('.row.open h2'), next, 'next exercise');
    await inView(next);
  }
  await s.locator('.row', { hasText: 'Cardio' }).click();
  await inView('Cardio');
  await fits('cardio');
  await s.getByRole('button', { name: 'Finish', exact: true }).click();
  await see(s.locator('.headline'), 'Starting numbers logged', 'summary with motion on');
  await fits('summary');
  await s.goto(`${base}#/routine/a`);
  await s.locator('.items').waitFor();
  await fits('routine editor');
  await s.goto(`${base}#/library`);
  await s.locator('.filters').waitFor();
  await fits('explorer');
  await s.goto(`${base}#/exercise/incline-db-press`);
  await s.locator('canvas').waitFor();
  await fits('exercise page');
  await small.close();
  await browser.close();

  // Offline, in Chromium: after one online visit the app must open and work
  // with the network cut.
  const cr = await chromium.launch();
  browsers.push(cr);
  const ctx = await cr.newContext({ ...phone, reducedMotion: 'no-preference' });
  const off = await ctx.newPage();
  watch(off);
  await off.goto(base);
  await off.evaluate(() => navigator.serviceWorker.ready);
  await off.waitForFunction(() => navigator.serviceWorker.controller != null);
  await ctx.setOffline(true);
  await off.reload();
  await see(off.locator('.headline'), '0 of 3 sessions this week', 'app opens offline');
  await off.getByRole('button', { name: 'Start Routine A' }).click();
  await off.getByLabel('weight', { exact: true }).fill('40');
  await off.getByRole('button', { name: 'Done', exact: true }).click();
  await off.goto(`${base}#/library`);
  await see(off.locator('.list .name'), 'Back Squat', 'library opens offline, in name order');
  const assets = await off.evaluate(() => Promise.all(
    ['manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'].map((u) => fetch(u).then((r) => r.ok, () => false))));
  assert.deepEqual(assets, [true, true, true], 'manifest and icons are served offline');
  await off.goto(`${base}#/exercise/lat-pulldown`);
  await off.locator('canvas').waitFor();
  await off.waitForTimeout(500);
  const drawn = await off.locator('canvas').screenshot();
  assert.ok(drawn.length > 12000, `a form clip draws offline: ${drawn.length} bytes of picture`);
  await ctx.close();

  // A new version, published while the app sits open in the background.
  if (!process.env.BASE) {
    const copy = `${tmp}/site/`;
    const root = fileURLToPath(new URL('..', import.meta.url));
    for (const part of ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'icons']) await cp(root + part, copy + part, { recursive: true });
    const site = await serve(0, copy);
    servers.push(site);
    const url = `http://127.0.0.1:${site.address().port}/reps/`;
    const later = await cr.newContext(phone);
    await later.clock.setFixedTime(new Date(2026, 10, 2, 10));
    const p = await later.newPage();
    watch(p);
    await p.goto(url);
    await p.waitForFunction(() => navigator.serviceWorker.controller != null);
    await p.waitForTimeout(500);
    await appendFile(`${copy}src/dom.js`, '\nwindow.version = 2;\n');
    const comeBack = () => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await comeBack();
    await p.waitForTimeout(800);
    assert.equal(await p.evaluate(() => window.version), undefined, 'not checked again within 6 hours');
    await later.clock.setFixedTime(new Date(2026, 10, 2, 17));
    await p.getByRole('button', { name: 'Start Routine A' }).click();
    await comeBack();
    await p.waitForTimeout(1200);
    assert.equal(await p.evaluate(() => window.version), undefined, 'a session is never interrupted');
    await p.getByRole('button', { name: 'Finish', exact: true }).click(); // nothing logged, so it is dropped
    await p.locator('.headline').waitFor();
    await comeBack();
    await p.waitForFunction(() => window.version === 2, null, { timeout: 5000 })
      .catch(() => assert.fail('the new version did not take over on Home'));
    await later.setOffline(true);
    await p.reload();
    assert.equal(await p.evaluate(() => window.version), 2, 'and it is the one that opens offline');
    await later.close();
  }
  await cr.close();

  assert.deepEqual(problems, [], 'no page or console errors');
}

try {
  await main();
  console.log('e2e passed');
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
} finally {
  await Promise.all(browsers.map((b) => b.close().catch(() => {})));
  await rm(tmp, { recursive: true, force: true });
  for (const s of servers) {
    s?.close();
    s?.closeAllConnections();
  }
}
