import assert from 'assert';
import { NotificationLog, formatNotificationStamp } from '../../src/engine/NotificationLog.js';

console.log('=== notifications.case.js ===');

const fire = { id: 'fire:3,4', message: 'Fire reported', x: 3, y: 4 };
const crime = { id: 'crime:2,2', message: 'Crime is high', x: 2, y: 2 };
const foodSoft = { id: 'food', message: 'Food supply is below demand', x: null, y: null };
const foodHard = { id: 'food', message: 'Food shortage — citizens are going hungry', x: null, y: null };

// Stamps follow the header clock: 24 ticks a day, one tick an hour.
assert.strictEqual(formatNotificationStamp(0), 'D1 00:00');
assert.strictEqual(formatNotificationStamp(14), 'D1 14:00');
assert.strictEqual(formatNotificationStamp(24), 'D2 00:00');
assert.strictEqual(formatNotificationStamp(61), 'D3 13:00');
assert.strictEqual(formatNotificationStamp(-5), 'D1 00:00', 'A negative clock should not produce nonsense');

{
  const log = new NotificationLog();
  const added = log.record([fire], 5);
  assert.strictEqual(added.length, 1, 'A new warning is logged');
  assert.deepStrictEqual(added[0].stamp, 'D1 05:00', 'The entry is stamped with the in-game time');
  assert.strictEqual(added[0].x, 3, 'Jump coordinates are kept');
  assert.strictEqual(log.entries.length, 1);

  // A standing warning must not repeat every tick.
  assert.strictEqual(log.record([fire], 6).length, 0, 'A warning that is still active is not logged twice');
  assert.strictEqual(log.entries.length, 1);

  // Newest at the bottom.
  log.record([fire, crime], 7);
  assert.deepStrictEqual(log.entries.map((entry) => entry.alertId), ['fire:3,4', 'crime:2,2'],
    'Entries append in the order the warnings appear');
}

{
  const log = new NotificationLog();
  log.record([foodSoft], 1);
  log.record([foodSoft], 2);
  assert.strictEqual(log.entries.length, 1);
  // The wording escalation is a new event, even though the id is the same.
  log.record([foodHard], 3);
  assert.deepStrictEqual(log.entries.map((entry) => entry.message),
    ['Food supply is below demand', 'Food shortage — citizens are going hungry']);
  assert.deepStrictEqual(log.entries.map((entry) => entry.open), [false, true],
    'Only the current wording is still an alarm; the earlier one is history');
}

{
  const log = new NotificationLog();
  log.record([fire], 1);
  assert.strictEqual(log.entries[0].open, true);
  // Clearing the condition leaves the entry as history.
  log.record([], 2);
  assert.strictEqual(log.entries.length, 1, 'A cleared warning stays in the log');
  assert.strictEqual(log.entries[0].open, false, 'A cleared warning reads as resolved');
  // It comes back with a fresh stamp when the condition returns.
  log.record([fire], 9);
  assert.strictEqual(log.entries.length, 2, 'A warning that returns is logged again');
  assert.strictEqual(log.entries[1].stamp, 'D1 09:00');
}

{
  const log = new NotificationLog();
  log.record([fire, crime], 1);
  const [first] = log.entries;
  assert.strictEqual(log.dismiss(first.key), true, 'Dismissing an entry removes it');
  assert.strictEqual(log.entries.length, 1);

  // Dismissed warnings stay quiet while the condition persists...
  log.record([fire, crime], 2);
  assert.deepStrictEqual(log.entries.map((entry) => entry.alertId), ['crime:2,2'],
    'A dismissed warning does not come back while it is still active');

  // ...but a cleared and returning condition is a new event worth showing.
  log.record([crime], 3);
  log.record([fire, crime], 4);
  assert.deepStrictEqual(log.entries.map((entry) => entry.alertId), ['crime:2,2', 'fire:3,4'],
    'Once the condition cleared, the next occurrence is logged again');

  assert.strictEqual(log.dismiss(9999), false, 'Dismissing an unknown key is a no-op');
}

{
  const log = new NotificationLog(3);
  for (let tick = 0; tick < 6; tick++) log.record([{ id: `a${tick}`, message: `Warning ${tick}` }], tick);
  assert.strictEqual(log.entries.length, 3, 'The log keeps only its most recent entries');
  assert.deepStrictEqual(log.entries.map((entry) => entry.alertId), ['a3', 'a4', 'a5']);

  log.clear();
  assert.strictEqual(log.entries.length, 0, 'Clearing empties the log');
  assert.strictEqual(log.record([{ id: 'a5', message: 'Warning 5' }], 9).length, 1,
    'Clearing also forgets which warnings were dismissed');
}

{
  const log = new NotificationLog();
  log.record([{ message: 'no id' }, null, { id: 'ok', message: 'fine' }], 0);
  assert.deepStrictEqual(log.entries.map((entry) => entry.alertId), ['ok'], 'Malformed alerts are skipped');
}

console.log('Notification log tests passed.');
