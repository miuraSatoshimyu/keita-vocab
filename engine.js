/* keita-vocab engine: 純粋ロジック(DOMなし)。node でテスト可能。 */
(function (root) {
  'use strict';

  const INTERVALS = [0, 1, 2, 4, 7, 14, 30]; // stage -> 次の出題までの日数
  const MASTER_STAGE = 5;
  const MAX_FREEZES = 2;
  const XP = { correct: 10, combo: 5, intro: 5, voice: 15, shadow: 40, clear: 50, boss: 100 };

  // ---- 日付(端末ローカル日付を YYYY-MM-DD で扱う) ----
  function ymd(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function weekday(s) { return parse(s).getDay(); } // 0=日 … 5=金 6=土
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }

  // ---- 状態 ----
  function freshState() {
    return { v: 2, xp: 0, cards: {}, days: {}, freezes: 0, frozen: [], stats: { spoken: 0, bossWins: 0, answered: 0, correct: 0 }, badges: {} };
  }
  function normalizeState(s) {
    const f = freshState();
    if (!s || typeof s !== 'object' || s.v !== 2) return f;
    return Object.assign(f, s, { stats: Object.assign(f.stats, s.stats || {}) });
  }

  // ---- レベル ----
  function xpForLevel(n) { return 25 * n * (n - 1); } // Lv2=50, Lv3=150, Lv5=500, Lv10=2250
  function levelOf(xp) { let n = 1; while (xp >= xpForLevel(n + 1)) n++; return n; }
  function levelProgress(xp) {
    const lv = levelOf(xp), lo = xpForLevel(lv), hi = xpForLevel(lv + 1);
    return { lv, into: xp - lo, need: hi - lo, ratio: (xp - lo) / (hi - lo) };
  }
  const TITLES = [[1, '見習い'], [3, 'オペレーター'], [6, '段取り名人'], [10, 'ライン班長'], [15, 'エンジニア'], [20, '工場長'], [30, 'グローバル工場長']];
  function titleOf(lv) { let t = TITLES[0][1]; for (const [n, name] of TITLES) if (lv >= n) t = name; return t; }

  // ---- SRS ----
  function introduce(state, id, today) {
    if (!state.cards[id]) state.cards[id] = { stage: 0, due: today, seen: today, right: 0, wrong: 0 };
    return state.cards[id];
  }
  function grade(state, id, ok, today) {
    const c = state.cards[id] || introduce(state, id, today);
    state.stats.answered++;
    if (ok) {
      c.right++; state.stats.correct++;
      c.stage = Math.min(c.stage + 1, INTERVALS.length - 1);
      c.due = addDays(today, INTERVALS[c.stage]);
    } else {
      c.wrong++;
      c.stage = c.stage > 0 ? 1 : 0;
      c.due = addDays(today, 1);
    }
    return c;
  }
  function dueIds(state, today) {
    return Object.entries(state.cards).filter(([, c]) => c.due <= today && c.seen !== today)
      .sort((a, b) => (a[1].due < b[1].due ? -1 : a[1].due > b[1].due ? 1 : a[1].stage - b[1].stage)).map(([id]) => id);
  }
  function introducedOn(state, day) { return Object.entries(state.cards).filter(([, c]) => c.seen === day).map(([id]) => id); }
  function isBossDay(today) { return weekday(today) === 5; }

  /** 今日の新語の枠。ゲートなし。復習が溜まっている日は新語を減らす。 */
  function newQuota(state, today) {
    const wd = weekday(today);
    let q = wd === 5 ? 0 : (wd === 0 || wd === 6) ? 3 : 5;
    const due = dueIds(state, today).length;
    if (due > 30) q = 0; else if (due > 15) q = Math.min(q, 2);
    return Math.max(0, q - introducedOn(state, today).length);
  }
  function nextNewIds(state, bank, n) {
    const out = [];
    for (const w of bank) { if (out.length >= n) break; if (!state.cards[w.id]) out.push(w.id); }
    return out;
  }
  function weekIds(state, today) { // ボス戦: 直近7日に出会った語 + 期限切れ
    const from = addDays(today, -6);
    const ids = Object.entries(state.cards).filter(([, c]) => c.seen >= from && c.seen <= today).map(([id]) => id);
    for (const id of dueIds(state, today)) if (!ids.includes(id)) ids.push(id);
    return ids;
  }

  // ---- 連続記録と休み保護 ----
  function participated(state, day) { return !!(state.days[day] && state.days[day].s1) || state.frozen.includes(day); }
  function lastActive(state) {
    const ds = Object.keys(state.days).filter((d) => state.days[d].s1).sort();
    return ds.length ? ds[ds.length - 1] : null;
  }
  /** アプリを開いた時に呼ぶ。空白日を休み保護で埋める(足りなければ埋めない=連続が切れる)。 */
  function applyFreezes(state, today) {
    const last = lastActive(state);
    if (!last) return [];
    const gap = [];
    for (let d = addDays(last, 1); d < today; d = addDays(d, 1)) if (!state.frozen.includes(d)) gap.push(d);
    if (!gap.length || gap.length > state.freezes) return [];
    state.freezes -= gap.length;
    state.frozen.push(...gap);
    return gap;
  }
  function streak(state, today) {
    let d = participated(state, today) ? today : addDays(today, -1), n = 0;
    while (participated(state, d)) { if (!state.frozen.includes(d)) n++; d = addDays(d, -1); }
    return n;
  }
  function bestStreak(state) {
    const ds = Object.keys(state.days).filter((d) => state.days[d].s1).concat(state.frozen).sort();
    let best = 0, run = 0, prev = null;
    for (const d of ds) {
      if (prev && d === prev) continue;
      run = prev && daysBetween(prev, d) === 1 ? run + (state.frozen.includes(d) ? 0 : 1) : (state.frozen.includes(d) ? 0 : 1);
      best = Math.max(best, run); prev = d;
    }
    return best;
  }

  // ---- 1日のクエスト ----
  function dayRec(state, today) { return state.days[today] || (state.days[today] = { s1: false, s2: false, s3: false, xp: 0 }); }
  function addXp(state, today, n) { state.xp += n; dayRec(state, today).xp += n; return n; }
  /** ステージ完了。初回の s1 完了で連続記録が伸び、7日ごとに休み保護を1つ獲得。全3段クリアでボーナス。 */
  function completeStage(state, stage, today) {
    const rec = dayRec(state, today), key = 's' + stage, events = [];
    if (rec[key]) return events;
    rec[key] = true;
    if (stage === 1) {
      const s = streak(state, today);
      if (s > 0 && s % 7 === 0 && state.freezes < MAX_FREEZES) { state.freezes++; events.push({ type: 'freeze', streak: s }); }
    }
    if (rec.s1 && rec.s2 && rec.s3 && !rec.clear) { rec.clear = true; addXp(state, today, XP.clear); events.push({ type: 'clear', xp: XP.clear }); }
    return events;
  }

  // ---- バッジ ----
  const BADGES = [
    { id: 'first', name: '初出勤', desc: '初めてクエストを1段クリア', test: (s) => Object.values(s.days).some((d) => d.s1) },
    { id: 'clear1', name: 'フルシフト', desc: '3段すべてクリアした日がある', test: (s) => Object.values(s.days).some((d) => d.clear) },
    { id: 'streak7', name: '1週間稼働', desc: '7日連続', test: (s, t) => bestStreak(s) >= 7 },
    { id: 'streak30', name: '月間無停止', desc: '30日連続', test: (s) => bestStreak(s) >= 30 },
    { id: 'boss1', name: 'ボス撃破', desc: '金曜ボス戦に勝利', test: (s) => s.stats.bossWins >= 1 },
    { id: 'voice50', name: '声出し50', desc: '発音チャレンジ50回合格', test: (s) => s.stats.spoken >= 50 },
    { id: 'master25', name: '25語マスター', desc: '25語を★5に', test: (s) => mastered(s) >= 25 },
    { id: 'master100', name: '100語マスター', desc: '100語を★5に', test: (s) => mastered(s) >= 100 },
  ];
  function mastered(state) { return Object.values(state.cards).filter((c) => c.stage >= MASTER_STAGE).length; }
  function checkBadges(state, today) {
    const got = [];
    for (const b of BADGES) if (!state.badges[b.id] && b.test(state, today)) { state.badges[b.id] = today; got.push(b); }
    return got;
  }

  // ---- 出題 ----
  function shuffle(a, rnd) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function makeQuestion(word, bank, rnd, canListen) {
    const kinds = canListen ? ['en2ja', 'ja2en', 'listen'] : ['en2ja', 'ja2en'];
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    const pool = bank.filter((w) => w.id !== word.id);
    const samePos = pool.filter((w) => w.pos === word.pos);
    const src = shuffle(samePos.length >= 3 ? samePos : pool, rnd).slice(0, 3);
    const options = shuffle([word, ...src], rnd);
    return { kind, id: word.id, word, options: options.map((w) => w.id), answer: word.id };
  }

  // ---- 発音判定 ----
  function norm(s) { return String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  /** 認識結果(複数候補)が目標フレーズにどれだけ合っているか 0〜1。 */
  function speechScore(target, transcripts) {
    const t = norm(target).split(' ').filter(Boolean);
    if (!t.length) return 0;
    let best = 0;
    for (const raw of transcripts) {
      const heard = norm(raw).split(' ').filter(Boolean);
      const bag = heard.slice();
      let hit = 0;
      for (const w of t) { const i = bag.indexOf(w); if (i >= 0) { hit++; bag.splice(i, 1); } }
      best = Math.max(best, hit / t.length);
    }
    return best;
  }
  const VOICE_PASS = 0.75;

  // ---- シャドーイング週 ----
  function shadowWeek(shadow, today) {
    if (!shadow || !shadow.weeks) return null;
    return shadow.weeks.find((w) => w.from <= today && today <= w.to) || null;
  }

  const api = {
    INTERVALS, MASTER_STAGE, MAX_FREEZES, XP, VOICE_PASS, BADGES,
    ymd, addDays, weekday, daysBetween,
    freshState, normalizeState, xpForLevel, levelOf, levelProgress, titleOf,
    introduce, grade, dueIds, introducedOn, isBossDay, newQuota, nextNewIds, weekIds,
    participated, applyFreezes, streak, bestStreak, dayRec, addXp, completeStage,
    mastered, checkBadges, shuffle, makeQuestion, norm, speechScore, shadowWeek,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KV = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
