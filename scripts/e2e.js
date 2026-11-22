// End-to-end run in a real browser engine: plays several workout days with a
// controlled clock and checks every number against values worked out by hand.
// WebKit at iPhone size for the app, Chromium for the offline check.
// Set SHOTS=/some/dir to also write screenshots there.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { webkit, chromium } from 'playwright';
import { serve } from './dev.js';

const SHOTS = process.env.SHOTS;
// BASE=https://example.com/reps/ runs the same checks against a deployed copy.
const server = process.env.BASE ? null : await serve();
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

// Waits until the text matches, so checks do not race the render.
async function see(locator, expected, what) {
  const deadline = Date.now() + 4000;
  let got;
  while (Date.now() < deadline) {
    got = await locator.first().innerText().catch(() => null);
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
  const openName = page.locator('.entry.open .name');
  const result = (name) => page.locator('.results li', { hasText: name });
  const target = (name) => page.locator('.plan li', { hasText: name }).locator('.target');
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
  const home = async () => { await page.goto(base); await page.locator('.big').waitFor(); };

  // Day 1, Mon 2 Nov: first ever session.
  await at(2);
  await home();
  await see(page.locator('.big'), '0 of 3', 'first launch headline');
  await see(page.locator('.head .label'), 'sessions this week', 'first launch label');
  await see(page.locator('.next h2'), 'Routine A', 'first routine');
  await see(target('Leg Press'), '3 × 10, pick a weight', 'no history target');
  await shot('01-home-first');
  await button('Start Routine A').click();
  await see(openName, 'Leg Press', 'first exercise opens');
  await see(page.locator('.aim'), 'Pick a weight you could lift about 15 times, then do 10.', 'first-time prompt');
  assert.equal(await done.isDisabled(), true, 'Done is disabled until a weight is set');
  await shot('02-session-first');
  await weight.fill('40');
  // Tap budget: with the weight set, each set is exactly one tap.
  await done.click();
  await done.click();
  await done.click();
  await see(openName, 'Chest Press', 'next exercise opens after three taps');
  await see(page.locator('.entry', { hasText: 'Leg Press' }).locator('.sub'), '40 kg × 10, 10, 10', 'three sets logged in three taps');
  await log({ first: 20 });
  await log({ first: 30 });
  await see(openName, 'Dumbbell Shoulder Press', 'fourth exercise');
  await log({ first: 8 });
  assert.equal(await page.locator('.entry.open').count(), 0, 'nothing open once the core is done');
  assert.match(await button('Finish session').getAttribute('class'), /primary/, 'Finish becomes the main action');
  await finishSession();
  await see(page.locator('.big'), 'Starting numbers logged', 'first summary headline');
  await see(page.locator('.week'), 'Session 1 of 3 for the week.', 'week count after one');
  await see(result('Leg Press').locator('.delta'), 'first time', 'first-time marker');
  await see(result('Leg Press').locator('.sub'), '40 kg × 10, 10, 10', 'logged sets');
  await see(result('Leg Press').locator('.next'), 'Next 40 kg × 11, 10, 10 Same weight. One more rep on set 1.', 'next target');
  await page.getByRole('link', { name: 'Done' }).click();
  await see(page.locator('.big'), '1 of 3', 'home after one session');
  await see(page.locator('.next h2'), 'Routine B', 'rotation moves to B');

  // Day 2, Wed 4 Nov: routine B plus cardio. Reload first: data must persist.
  await at(4, 18);
  await home();
  await see(page.locator('.big'), '1 of 3', 'data survives a reload');
  await button('Start Routine B').click();
  await see(openName, 'Romanian Deadlift', 'B starts with the hinge');
  await log({ first: 30 });
  await log({ first: 35 });
  await log({ first: 10 });
  await log({ first: 20 });
  await page.locator('.entry', { hasText: 'Cardio' }).click();
  await button('Stationary Bike').click();
  await button('More minutes').click();
  await shot('03-session-cardio');
  assert.equal(await done.evaluate((el) => el.getBoundingClientRect().bottom <= document.querySelector('.dock').getBoundingClientRect().top), true,
    'opening cardio scrolls its Done button above the dock');
  await done.click();
  await see(page.locator('.entry', { hasText: 'Cardio' }).locator('.sub'), 'Stationary Bike · 15 min', 'cardio logged');
  await finishSession();
  await see(page.locator('.week'), 'Session 2 of 3 for the week.', 'week count after two');
  await see(result('Cardio').locator('.sub'), 'Stationary Bike · 15 min', 'cardio in summary');

  // Day 3, Fri 6 Nov: routine A again, now with targets to beat.
  await at(6, 7);
  await home();
  await see(page.locator('.big'), '2 of 3', 'home after two');
  await see(target('Leg Press'), '40 kg × 11, 10, 10', 'home shows the target');
  await button('Start Routine A').click();
  assert.equal(await weight.inputValue(), '40', 'weight is pre-filled');
  assert.equal(await reps.inputValue(), '11', 'reps are pre-filled with the target');
  await see(page.locator('.last'), 'Last time 40 kg × 10, 10, 10', 'last time line');
  await see(page.locator('.aim'), 'Same weight. One more rep on set 1.', 'thing to beat');
  await shot('04-session-targets');
  await log(); // Leg Press 11, 10, 10: hits the suggestion in three taps
  await log({ each: [15] }); // Chest Press 15, 10, 10: far past the top
  await button('More reps').click(); // Seated Cable Row 12, 12, 12 with steppers
  await done.click();
  for (let i = 0; i < 2; i++) {
    await button('More reps').click();
    await button('More reps').click();
    await done.click();
  }
  await see(openName, 'Dumbbell Shoulder Press', 'row done with steppers');
  await button('Less reps').click(); // Shoulder Press 9, 10, 10: a worse day
  await button('Less reps').click();
  await log();
  await page.locator('.entry', { hasText: 'Cable Crunch' }).click(); // the optional one
  await log({ first: 20 });
  await shot('05-session-complete');
  await finishSession();
  await see(page.locator('.big'), 'Beat last time on 3 of 4', 'wins headline');
  await see(page.locator('.week'), 'Session 3 of 3 for the week. Week on target.', 'week on target');
  await see(result('Leg Press').locator('.delta'), '+1 rep', 'one more rep is a win');
  await see(result('Leg Press').locator('.next'), 'Next 40 kg × 12, 10, 10 Same weight. One more rep on set 1.', 'rep rule');
  await see(result('Chest Press').locator('.delta'), '+5 reps', 'more total reps');
  await see(result('Chest Press').locator('.next'), 'Next 30 kg × 8, 8, 8 15 reps is well past 12. Jump two steps, aim for 8.', 'fast ramp');
  await see(result('Seated Cable Row').locator('.delta'), '+6 reps', 'row delta');
  await see(result('Seated Cable Row').locator('.next'), 'Next 35 kg × 8, 8, 8 Every set reached 12. Add weight, aim for 8.', 'top of range');
  await see(result('Dumbbell Shoulder Press').locator('.delta'), '−1 rep', 'a worse day is shown plainly');
  await see(result('Dumbbell Shoulder Press').locator('.next'), 'Next 8 kg × 10, 10, 10 Same weight. One more rep on set 1.', 'recover the rep');
  await see(result('Cable Crunch').locator('.delta'), 'first time', 'optional exercise first time');
  await shot('06-summary-wins');
  await page.getByRole('link', { name: 'Done' }).click();
  await see(page.locator('.big'), '1 of 1', 'first week on target');
  await see(page.locator('.head .label'), 'week on target', 'singular label');
  await see(page.locator('.week'), 'This week 3 of 3', 'this week line');
  await shot('07-home-on-target');

  // Day 4, Mon 9 Nov: swap an exercise and keep it.
  await at(9);
  await home();
  await see(page.locator('.big'), '1 of 1', 'an unfinished week is not held against you');
  await see(page.locator('.week'), 'This week 0 of 3', 'new week starts empty');
  await button('Start Routine B').click();
  await button('Swap').click();
  await shot('08-swap-sheet');
  await button('Dumbbell Romanian Deadlift dumbbell').click();
  await see(openName, 'Dumbbell Romanian Deadlift', 'swapped in one tap');
  await see(page.locator('.swap-note'), 'In for Romanian Deadlift today. Keep in Routine B', 'swap note');
  await button('Keep in Routine B').click();
  await see(page.locator('.swap-note'), 'Routine B now uses this exercise.', 'kept');
  await weight.fill('12');
  await done.click();
  await finishSession(); // one set still counts as a session
  await see(page.locator('.week'), 'Session 1 of 3 for the week.', 'a short session counts');
  await page.goto(`${base}#/routine/b`);
  await see(page.locator('.item-head .name'), 'Dumbbell Romanian Deadlift', 'routine B changed for good');

  // Mon 30 Nov: three weeks away.
  await at(30);
  await home();
  await see(page.locator('.big'), '1 of 4', 'hit rate after missed weeks');
  await see(page.locator('.home > .note'), 'Welcome back. 21 days away, so weights start about 10 percent lighter.', 'welcome back');
  await see(page.locator('.next h2'), 'Routine A', 'rotation continues after the break');
  await see(target('Leg Press'), '35 kg × 8, 8, 8', 'lighter after a break');
  await see(target('Chest Press'), '15 kg × 8, 8, 8', 'lighter by at least one step');
  await shot('09-home-back');

  // Custom exercise, routine edit, units.
  await page.getByRole('link', { name: 'Edit program' }).click();
  await shot('10-program');
  await page.getByRole('link', { name: /Exercise library/ }).click();
  await shot('11-library');
  await page.getByRole('link', { name: 'New exercise' }).click();
  await page.getByPlaceholder('Exercise name').fill('Sled Push');
  await button('Save').click();
  await see(page.locator('.list li', { hasText: 'Sled Push' }).locator('.sub'), 'machine · custom', 'custom exercise in the library');
  await page.goto(`${base}#/routine/a`);
  await button('Add exercise').click();
  await page.getByLabel('Search exercises').fill('sled');
  await button('Sled Push machine').click();
  await button('More sets of Leg Press').click();
  await shot('12-routine-editor');
  await home();
  await see(target('Leg Press'), '35 kg × 8, 8, 8, 8', 'routine edit reaches the plan');
  await see(target('Sled Push'), '3 × 10, pick a weight', 'custom exercise in the plan');
  await page.goto(`${base}#/program`);
  await button('lb').click();
  await home();
  await see(target('Leg Press'), '70 lb × 8, 8, 8, 8', 'pounds use the pound step');
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
  await shot('13-past');
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
  await page.getByRole('link', { name: 'Correct this session' }).click();
  await page.locator('.entry', { hasText: 'Leg Press' }).click();
  await page.locator('.set.done button').first().click();
  await reps.fill('12');
  await done.click();
  await button('Save changes').click();
  await see(result('Leg Press').locator('.delta'), '+2 reps', 'after the correction');
  await context.close();

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
    await p.locator('.big').waitFor();
    await p.screenshot({ path: `${SHOTS}/20-dark-home.png` });
    await p.getByRole('button', { name: 'Start Routine A' }).click();
    await p.getByRole('button', { name: 'Done', exact: true }).click();
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
  await s.locator('.big').waitFor();
  await fits('home');
  await s.getByRole('button', { name: 'Start Routine A' }).click();
  await s.getByLabel('weight', { exact: true }).fill('42.5');
  await fits('session');
  for (let i = 0; i < 3; i++) await s.getByRole('button', { name: 'Done', exact: true }).click();
  await see(s.locator('.entry.open .name'), 'Chest Press', 'flow works with motion on');
  await s.locator('.entry', { hasText: 'Cardio' }).click();
  await fits('cardio');
  await s.getByRole('button', { name: 'Finish session' }).click();
  await see(s.locator('.big'), 'Starting numbers logged', 'summary with motion on');
  await fits('summary');
  await s.goto(`${base}#/routine/a`);
  await s.locator('.items').waitFor();
  await fits('routine editor');
  if (SHOTS) await s.screenshot({ path: `${SHOTS}/30-small-routine.png` });
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
  await see(off.locator('.big'), '0 of 3', 'app opens offline');
  await off.getByRole('button', { name: 'Start Routine A' }).click();
  await off.getByLabel('weight', { exact: true }).fill('40');
  await off.getByRole('button', { name: 'Done', exact: true }).click();
  await off.goto(`${base}#/library`);
  await see(off.locator('.list .name'), 'Back Squat', 'library opens offline, in name order');
  const assets = await off.evaluate(() => Promise.all(
    ['manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'].map((u) => fetch(u).then((r) => r.ok, () => false))));
  assert.deepEqual(assets, [true, true, true], 'manifest and icons are served offline');
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
  server?.close();
  server?.closeAllConnections?.();
}
