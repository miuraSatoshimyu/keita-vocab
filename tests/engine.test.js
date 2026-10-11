// node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const KV = require('../engine.js');
const bank = require('../data/bank.json').words;

const MON = '2026-10-12', FRI = '2026-10-16', SAT = '2026-10-17';

test('weekday helpers', () => {
  assert.equal(KV.weekday(MON), 1);
  assert.equal(KV.weekday(FRI), 5);
  assert.equal(KV.addDays('2026-10-31', 1), '2026-11-01');
});

test('levels grow and titles change', () => {
  assert.equal(KV.levelOf(0), 1);
  assert.equal(KV.levelOf(49), 1);
  assert.equal(KV.levelOf(50), 2);
  assert.equal(KV.levelOf(500), 5);
  assert.equal(KV.titleOf(1), '見習い');
  assert.equal(KV.titleOf(10), 'ライン班長');
  const p = KV.levelProgress(100);
  assert.equal(p.lv, 2); assert.equal(p.into, 50); assert.equal(p.need, 100);
});

test('SRS: correct answers push the due date out, wrong resets', () => {
  const s = KV.freshState();
  KV.introduce(s, 'yield', MON);
  KV.grade(s, 'yield', true, MON);
  assert.equal(s.cards.yield.stage, 1); assert.equal(s.cards.yield.due, '2026-10-13');
  KV.grade(s, 'yield', true, '2026-10-13');
  assert.equal(s.cards.yield.stage, 2); assert.equal(s.cards.yield.due, '2026-10-15');
  KV.grade(s, 'yield', false, '2026-10-15');
  assert.equal(s.cards.yield.stage, 1); assert.equal(s.cards.yield.due, '2026-10-16');
});

test('no gate: new words keep coming after skipped days, quota shrinks only when reviews pile up', () => {
  const s = KV.freshState();
  assert.equal(KV.newQuota(s, MON), 5);
  assert.equal(KV.newQuota(s, FRI), 0, 'Friday is boss day');
  assert.equal(KV.newQuota(s, SAT), 3);
  for (let i = 0; i < 20; i++) s.cards['w' + i] = { stage: 1, due: '2026-10-01', seen: '2026-09-30', right: 0, wrong: 0 };
  assert.equal(KV.newQuota(s, MON), 2);
  for (let i = 20; i < 40; i++) s.cards['w' + i] = { stage: 1, due: '2026-10-01', seen: '2026-09-30', right: 0, wrong: 0 };
  assert.equal(KV.newQuota(s, MON), 0);
});

test('nextNewIds follows bank order and skips known words', () => {
  const s = KV.freshState();
  KV.introduce(s, bank[0].id, MON);
  assert.deepEqual(KV.nextNewIds(s, bank, 2), [bank[1].id, bank[2].id]);
});

test('streak counts consecutive days, today optional', () => {
  const s = KV.freshState();
  for (const d of ['2026-10-09', '2026-10-10', '2026-10-11']) KV.completeStage(s, 1, d);
  assert.equal(KV.streak(s, '2026-10-11'), 3);
  assert.equal(KV.streak(s, MON), 3, 'not done yet today still shows yesterday streak');
  assert.equal(KV.streak(s, '2026-10-13'), 0, 'a missed day breaks it');
});

test('7-day streak earns a freeze that covers one missed day', () => {
  const s = KV.freshState();
  let d = '2026-10-01';
  for (let i = 0; i < 7; i++) { KV.completeStage(s, 1, d); d = KV.addDays(d, 1); }
  assert.equal(s.freezes, 1);
  // 10/08 skipped, open app on 10/09
  const used = KV.applyFreezes(s, '2026-10-09');
  assert.deepEqual(used, ['2026-10-08']);
  assert.equal(s.freezes, 0);
  KV.completeStage(s, 1, '2026-10-09');
  assert.equal(KV.streak(s, '2026-10-09'), 8, 'frozen day keeps the chain but does not add');
});

test('freeze is not spent when the gap is larger than what you hold', () => {
  const s = KV.freshState();
  s.freezes = 1;
  KV.completeStage(s, 1, '2026-10-01');
  assert.deepEqual(KV.applyFreezes(s, '2026-10-05'), []);
  assert.equal(s.freezes, 1);
});

test('full clear gives bonus once', () => {
  const s = KV.freshState();
  KV.completeStage(s, 1, MON); KV.completeStage(s, 2, MON);
  const ev = KV.completeStage(s, 3, MON);
  assert.ok(ev.some((e) => e.type === 'clear'));
  assert.equal(s.xp, KV.XP.clear);
  assert.deepEqual(KV.completeStage(s, 3, MON), []);
});

test('badges unlock', () => {
  const s = KV.freshState();
  KV.completeStage(s, 1, MON);
  const got = KV.checkBadges(s, MON).map((b) => b.id);
  assert.ok(got.includes('first'));
  assert.deepEqual(KV.checkBadges(s, MON), []);
});

test('question has 4 unique options including the answer', () => {
  let x = 1; const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  for (const w of bank.slice(0, 30)) {
    const q = KV.makeQuestion(w, bank, rnd, true);
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.ok(q.options.includes(w.id));
  }
});

test('speech score tolerates casing, punctuation and extra words', () => {
  assert.equal(KV.speechScore('streamline a process', ['Streamline a process.']), 1);
  assert.equal(KV.speechScore('streamline a process', ['uh streamline the process']), 2 / 3);
  assert.ok(KV.speechScore('streamline a process', ['nothing', 'streamline a process']) >= KV.VOICE_PASS);
  assert.equal(KV.speechScore('trade-off', ['trade off']), 1);
});

test('shadow week lookup', () => {
  const shadow = require('../data/shadow.json');
  assert.equal(KV.shadowWeek(shadow, '2026-10-11').wk, 'W5');
  assert.equal(KV.shadowWeek(shadow, '2026-10-13').wk, 'W6');
  assert.equal(KV.shadowWeek(shadow, '2027-01-01'), null);
});

test('boss pool = words met this week plus overdue', () => {
  const s = KV.freshState();
  KV.introduce(s, 'a', MON); KV.introduce(s, 'b', '2026-10-14');
  s.cards.old = { stage: 3, due: '2026-10-10', seen: '2026-09-01', right: 3, wrong: 0 };
  s.cards.future = { stage: 3, due: '2026-10-30', seen: '2026-09-01', right: 3, wrong: 0 };
  assert.deepEqual(KV.weekIds(s, FRI).sort(), ['a', 'b', 'old']);
});

test('bank is valid', () => {
  assert.ok(bank.length >= 100);
  for (const w of bank) for (const k of ['id', 'w', 'ipa', 'ja', 'ex', 'exja', 'tag']) assert.ok(w[k], `${w.id} missing ${k}`);
  assert.ok(bank.every((w) => w.col.length >= 1));
});
