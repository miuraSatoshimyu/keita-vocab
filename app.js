/* 朝の英語クエスト UI。ロジックは engine.js (window.KV)。進捗は端末の localStorage に保存。 */
(() => {
  'use strict';
  const KEY = 'keita-vocab-v2';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const STAGES = [null, { icon: '⚡', name: 'タイムアタック' }, { icon: '🎤', name: '発音チャレンジ' }, { icon: '🎧', name: 'シャドーイング' }];

  let S, BANK = [], BYID = {}, SHADOW = null, TODAY, TAGS = {};
  let tab = 'home', zFilter = 'all';

  // ---------- storage ----------
  function load() { try { return KV.normalizeState(JSON.parse(localStorage.getItem(KEY))); } catch { return KV.freshState(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('この端末では記録を保存できません（プライベートモード？）'); } }

  // ---------- speech out ----------
  const TTS = 'speechSynthesis' in window;
  let voice = null;
  function pickVoice() {
    if (!TTS) return;
    const vs = speechSynthesis.getVoices();
    voice = vs.find((v) => /^en-US/i.test(v.lang) && /Samantha|Google US English|Aaron|Nicky/i.test(v.name))
      || vs.find((v) => /^en-US/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
  }
  if (TTS) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function say(text, rate = 0.92) {
    if (!TTS) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; if (voice) u.voice = voice; u.rate = rate; speechSynthesis.speak(u); } catch { /* 無音で続行 */ }
  }
  // ---------- speech in ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let micBlocked = false;

  // ---------- helpers ----------
  function toast(msg, ms = 2600) {
    const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), ms);
  }
  const rec = () => S.days[TODAY] || {};
  const nextStage = () => { const r = rec(); return !r.s1 ? 1 : !r.s2 ? 2 : !r.s3 ? 3 : 0; };
  const fmtT = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const stars = (stage) => '★'.repeat(Math.min(stage, 5)) + '☆'.repeat(Math.max(0, 5 - stage));

  // ---------- boot ----------
  async function boot() {
    TODAY = KV.ymd(new Date());
    try {
      const v = '?v=' + TODAY;
      const [b, sh] = await Promise.all([fetch('data/bank.json' + v).then((r) => r.json()), fetch('data/shadow.json' + v).then((r) => r.json()).catch(() => null)]);
      BANK = b.words; TAGS = b.tags || {}; SHADOW = sh;
      BANK.forEach((w) => (BYID[w.id] = w));
    } catch {
      $('#app').innerHTML = '<div class="err"><h2>単語データを読み込めませんでした</h2><p class="note">電波のある場所で開き直してください。</p></div>';
      return;
    }
    S = load();
    const used = KV.applyFreezes(S, TODAY);
    save();
    $('#tabs').hidden = false;
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) go(b.dataset.tab); });
    render();
    if (used.length) toast(`❄️ 休み保護を${used.length}個使って、連続記録を守りました`, 4000);
  }
  function go(t) {
    tab = t;
    document.querySelectorAll('#tabs button').forEach((b) => { if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    render(); window.scrollTo(0, 0);
  }
  function render() {
    // 日付をまたいで開きっぱなしの場合に備える
    const now = KV.ymd(new Date());
    if (now !== TODAY) { TODAY = now; KV.applyFreezes(S, TODAY); save(); }
    $('#app').innerHTML = header() + (tab === 'home' ? home() : tab === 'zukan' ? zukan() : log());
    bind();
  }

  // ---------- header ----------
  function header() {
    const lp = KV.levelProgress(S.xp), st = KV.streak(S, TODAY);
    return `<header class="top">
      <div class="lv">Lv ${lp.lv}<small>${esc(KV.titleOf(lp.lv))}</small></div>
      <div class="chips"><span title="連続日数">🔥 <b class="num">${st}</b>日</span><span title="休み保護">❄️ <b class="num">${S.freezes}</b></span></div>
      <div class="xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="${lp.need}" aria-valuenow="${lp.into}"><i style="width:${Math.round(lp.ratio * 100)}%"></i></div>
      <div class="xpmeta">次のレベルまで ${lp.need - lp.into} XP（合計 ${S.xp} XP）</div>
    </header>`;
  }

  // ---------- home ----------
  function stage1Plan() {
    if (KV.isBossDay(TODAY) && KV.weekIds(S, TODAY).length >= 4) return `金曜ボス戦 ${KV.weekIds(S, TODAY).length}語`;
    const n = KV.newQuota(S, TODAY) + KV.introducedOn(S, TODAY).length, d = KV.dueIds(S, TODAY).length;
    return `新語${Math.min(n, BANK.length - Object.keys(S.cards).length + KV.introducedOn(S, TODAY).length)}・復習${d}`;
  }
  function home() {
    const r = rec(), nx = nextStage(), wk = KV.shadowWeek(SHADOW, TODAY);
    const lamp = (i) => `<div class="lamp ${r['s' + i] ? 'done' : nx === i ? 'next' : ''}"><span aria-hidden="true">${STAGES[i].icon}</span><b>${r['s' + i] ? '完了' : nx === i ? '次' : '待機'}</b></div>`;
    const doneCount = [r.s1, r.s2, r.s3].filter(Boolean).length;
    const lead = doneCount === 3 ? '今朝のシフトは完了です。また明日。'
      : doneCount === 0 ? '今朝のシフトは3工程、約10分です。'
      : `あと${3 - doneCount}工程です。`;
    const plans = [null, stage1Plan(), '5フレーズ', wk ? `${wk.wk} ${fmtT(wk.start)}〜` : '今週の台本'];
    const items = [1, 2, 3].map((i) => `<li class="${r['s' + i] ? 'ok' : ''}"><span>${STAGES[i].icon} ${STAGES[i].name}</span><span>${r['s' + i] ? '完了' : esc(plans[i])}</span></li>`).join('');
    const btn = nx ? `<button class="go" data-act="stage" data-stage="${nx}">${STAGES[nx].icon} ${STAGES[nx].name}を始める</button>`
      : `<button class="go" data-act="stage" data-stage="1">⚡ もう一回タイムアタック（XPのみ）</button>`;
    return `<div class="board">
        <div class="tower" aria-label="今日の3工程の状態">${lamp(1)}${lamp(2)}${lamp(3)}</div>
        <div class="plan"><h1>${lead}</h1><ul>${items}</ul></div>
      </div>
      ${btn}
      <div class="row">${[1, 2, 3].filter((i) => i !== (nx || 1)).map((i) => `<button class="ghost" data-act="stage" data-stage="${i}">${STAGES[i].icon} ${r['s' + i] ? 'もう一回' : '先にやる'}</button>`).join('')}</div>
      <section class="card" style="margin-top:18px">
        <h2>続けるためのルール</h2>
        <p class="note" style="margin:0">⚡を終えた日が連続記録に数えられます。7日続くごとに❄️休み保護（最大2個）がもらえ、休んだ日を自動で埋めます。何日空いても、開いた日から再開できます。</p>
      </section>
      <button class="ghost" data-act="settings" style="width:100%">⚙ バックアップと設定</button>`;
  }

  // ---------- zukan ----------
  function zukan() {
    const seen = Object.keys(S.cards).length, m = KV.mastered(S);
    const fl = [['all', 'すべて'], ['seen', '出会った'], ['master', '★5'], ...Object.entries(TAGS)];
    const list = BANK.filter((w) => {
      const c = S.cards[w.id];
      if (zFilter === 'seen') return !!c; if (zFilter === 'master') return c && c.stage >= KV.MASTER_STAGE;
      if (zFilter !== 'all') return w.tag === zFilter; return true;
    });
    const tiles = list.map((w) => {
      const c = S.cards[w.id];
      if (!c) return `<div class="tile locked" aria-label="まだ出会っていない単語"><span class="en">???</span><span class="note">${esc(TAGS[w.tag] || '')}</span></div>`;
      return `<button class="tile ${c.stage >= KV.MASTER_STAGE ? 'mastered' : ''}" data-act="word" data-id="${esc(w.id)}"><span class="en${w.w.length > 9 ? ' long' : ''}" lang="en">${esc(w.w)}</span><span class="stars" aria-label="習熟度${Math.min(c.stage, 5)}">${stars(c.stage)}</span></button>`;
    }).join('');
    return `<section class="card"><h2>単語図鑑</h2>
        <div class="stats"><div><span class="num">${seen}</span><span>出会った語</span></div><div><span class="num">${m}</span><span>★5マスター</span></div><div><span class="num">${BANK.length}</span><span>全単語</span></div></div>
      </section>
      <div class="filters" role="group" aria-label="絞り込み">${fl.map(([k, l]) => `<button data-act="zf" data-f="${k}" aria-pressed="${zFilter === k}">${esc(l)}</button>`).join('')}</div>
      <div class="grid">${tiles || '<p class="note">まだありません。クエストで出会いましょう。</p>'}</div>`;
  }

  // ---------- log ----------
  function log() {
    const st = KV.streak(S, TODAY), best = KV.bestStreak(S);
    const acc = S.stats.answered ? Math.round((100 * S.stats.correct) / S.stats.answered) : 0;
    // 10週ぶん、月曜始まり
    const wd = (KV.weekday(TODAY) + 6) % 7;
    const start = KV.addDays(TODAY, -wd - 63);
    let cells = '';
    for (let i = 0; i < 70; i++) {
      const d = KV.addDays(start, i);
      if (d > TODAY) { cells += '<div aria-hidden="true" style="visibility:hidden"></div>'; continue; }
      const r = S.days[d], f = S.frozen.includes(d);
      const cls = r && r.clear ? 'c' : r && r.s1 ? 'p' : f ? 'f' : '';
      cells += `<div class="${cls} ${d === TODAY ? 't' : ''}" title="${d}">${Number(d.slice(8))}</div>`;
    }
    const badges = KV.BADGES.map((b) => `<div class="badge ${S.badges[b.id] ? '' : 'off'}"><b>${S.badges[b.id] ? '🏅' : '🔒'} ${esc(b.name)}</b>${esc(b.desc)}</div>`).join('');
    return `<section class="card"><div class="stats">
        <div><span class="num">${st}</span><span>連続日数</span></div>
        <div><span class="num">${best}</span><span>最長連続</span></div>
        <div><span class="num">${acc}%</span><span>正答率</span></div></div></section>
      <section class="card"><h2>直近10週</h2>
        <div class="heat" aria-label="日ごとの実施状況">${['月', '火', '水', '木', '金', '土', '日'].map((x) => `<div style="background:none">${x}</div>`).join('')}${cells}</div>
        <p class="note" style="margin:10px 0 0">緑＝3工程クリア　薄い黄＝⚡のみ　点線＝休み保護</p></section>
      <section class="card"><h2>バッジ</h2><div class="badges">${badges}</div></section>`;
  }

  // ---------- binding ----------
  function bind() {
    $('#app').onclick = (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act;
      if (a === 'stage') startStage(Number(b.dataset.stage));
      else if (a === 'zf') { zFilter = b.dataset.f; render(); }
      else if (a === 'word') wordSheet(b.dataset.id);
      else if (a === 'settings') settingsSheet();
    };
  }

  // ---------- play shell ----------
  const play = $('#play');
  let session = null;
  function openPlay() { play.hidden = false; document.body.style.overflow = 'hidden'; }
  function closePlay() {
    if (session && session.timer) clearInterval(session.timer);
    if (session && session.rec) try { session.rec.abort(); } catch { /* noop */ }
    session = null; play.hidden = true; play.innerHTML = ''; document.body.style.overflow = ''; if (TTS) speechSynthesis.cancel(); render();
  }
  function shell(inner, { timer = '', score = '' } = {}) {
    play.innerHTML = `<div class="wrap"><div class="playbar"><button class="x" data-act="quit" aria-label="中断してホームに戻る">✕</button>${timer || '<div style="flex:1"></div>'}${score ? `<div class="score">${score}</div>` : ''}</div>${inner}</div>`;
    play.querySelector('[data-act="quit"]').onclick = () => {
      if (session && session.stage === 1 && session.answered > 0) finishStage1(); else closePlay();
    };
  }
  function startStage(n) { openPlay(); if (n === 1) stage1(); else if (n === 2) stage2(); else stage3(); }

  // ---------- result ----------
  function result(stage, gained, extra = []) {
    const lvBefore = session.lvBefore, lvAfter = KV.levelOf(S.xp);
    const badges = KV.checkBadges(S, TODAY); save();
    const lines = [...extra];
    if (lvAfter > lvBefore) lines.push(`🎉 レベルアップ！ Lv ${lvAfter}「${KV.titleOf(lvAfter)}」`);
    badges.forEach((b) => lines.push(`🏅 バッジ獲得「${b.name}」`));
    const nx = nextStage();
    play.innerHTML = `<div class="wrap result" role="status">
      <p class="stagehead">${STAGES[stage].icon} ${STAGES[stage].name} 完了</p>
      <div class="big">+${gained}</div><p class="note">XP</p>
      ${lines.map((l) => `<p><b>${esc(l)}</b></p>`).join('')}
      <p class="note">🔥 連続 ${KV.streak(S, TODAY)}日</p>
      <div style="margin-top:28px">${nx ? `<button class="go" id="nx">${STAGES[nx].icon} 次の工程：${STAGES[nx].name}</button>` : '<p><b>今朝のシフト完了です。お疲れさまでした。</b></p>'}
      <button class="ghost" id="hm" style="width:100%;margin-top:10px">ホームに戻る</button></div></div>`;
    $('#hm', play).onclick = closePlay;
    if (nx) $('#nx', play).onclick = () => { session = null; startStage(nx); };
    session = { stage: 0 };
  }
  function stageEvents(evs) {
    return evs.map((e) => (e.type === 'clear' ? `3工程クリアボーナス +${e.xp} XP` : e.type === 'freeze' ? `❄️ ${e.streak}日連続で休み保護を1つ獲得` : '')).filter(Boolean);
  }

  // ---------- stage 1: intro + time attack ----------
  function stage1() {
    const lvBefore = KV.levelOf(S.xp), xp0 = S.xp;
    let boss = KV.isBossDay(TODAY) && KV.weekIds(S, TODAY).length >= 4;
    const newIds = boss ? [] : KV.nextNewIds(S, BANK, KV.newQuota(S, TODAY));
    session = { stage: 1, lvBefore, xp0, boss, newIds, practice: !!rec().s1, i: 0, answered: 0, graded: new Set(), combo: 0, score: 0 };
    if (newIds.length) introCard(); else startQuiz();
  }
  function introCard() {
    const s = session, w = BYID[s.newIds[s.i]];
    shell(`<p class="stagehead">今日の新語 ${s.i + 1} / ${s.newIds.length}</p>
      <div class="word en">${esc(w.w)}</div>
      <div class="ipa">${esc(w.ipa)}　${esc(w.pos)}　<button class="speak" id="sp" aria-label="発音を聞く">🔊</button></div>
      <div class="ja">${esc(w.ja)}</div>
      <p class="ex">${esc(w.ex)} <button class="speak" id="spx" aria-label="例文を聞く" style="width:34px;height:34px;font-size:15px">🔊</button></p>
      <p class="exja">${esc(w.exja)}</p>
      <div class="cols">${w.col.map((c) => `<span>${esc(c)}</span>`).join('')}</div>
      <button class="go" id="nx" style="margin-top:24px">${s.i + 1 < s.newIds.length ? '覚えた、次へ' : '覚えた、タイムアタックへ'}</button>`);
    $('#sp', play).onclick = () => say(w.w, 0.85);
    $('#spx', play).onclick = () => say(w.ex);
    say(w.w, 0.85);
    $('#nx', play).onclick = () => {
      KV.introduce(S, w.id, TODAY); KV.addXp(S, TODAY, KV.XP.intro); save();
      s.i++; if (s.i < s.newIds.length) introCard(); else startQuiz();
    };
  }
  function startQuiz() {
    const s = session;
    let ids;
    if (s.boss) ids = KV.weekIds(S, TODAY);
    else ids = [...KV.introducedOn(S, TODAY), ...KV.dueIds(S, TODAY).slice(0, 20)];
    if (!ids.length) { // 何もない日は出会った語からランダム練習
      const seen = Object.keys(S.cards);
      ids = KV.shuffle(seen, Math.random).slice(0, 10);
    }
    if (!ids.length) { ids = KV.nextNewIds(S, BANK, 5); ids.forEach((id) => KV.introduce(S, id, TODAY)); }
    s.queue = KV.shuffle([...new Set(ids)], Math.random);
    s.hpMax = s.boss ? s.queue.length : 0; s.hp = s.hpMax;
    s.total = s.boss ? 120 : 180; s.left = s.total; s.requeued = new Set();
    s.timer = setInterval(() => {
      s.left -= 0.25; const bar = $('.timer', play);
      if (bar) { bar.firstElementChild.style.width = `${Math.max(0, (100 * s.left) / s.total)}%`; bar.classList.toggle('low', s.left < 20); }
      if (s.left <= 0) finishStage1();
    }, 250);
    nextQ();
  }
  function nextQ() {
    const s = session; if (!s || s.stage !== 1) return;
    if (!s.queue.length) return finishStage1();
    const id = s.queue.shift(), w = BYID[id];
    if (!w) return nextQ();
    const q = KV.makeQuestion(w, BANK, Math.random, TTS);
    s.q = q;
    const prompt = q.kind === 'en2ja' ? `<p class="q-prompt">意味は？</p><div class="word en">${esc(w.w)}</div><button class="speak" id="sp" aria-label="発音を聞く">🔊</button>`
      : q.kind === 'ja2en' ? `<p class="q-prompt">英語では？</p><div class="ja" style="font-size:26px">${esc(w.ja)}</div>`
      : `<p class="q-prompt">聞こえた単語は？</p><button class="mic" id="sp" aria-label="もう一度聞く" style="font-size:34px">🔊</button>`;
    const optCls = q.kind === 'en2ja' ? 'opt' : 'opt en';
    const opts = q.options.map((oid) => `<button class="${optCls}" data-id="${esc(oid)}">${esc(q.kind === 'en2ja' ? BYID[oid].ja : BYID[oid].w)}</button>`).join('');
    const bossBar = s.boss ? `<div class="boss"><span>👾 金曜ボス</span><div class="hp"><i style="width:${(100 * s.hp) / s.hpMax}%"></i></div><span class="num">${s.hp}</span></div>` : '';
    shell(`<p class="stagehead">${s.boss ? '⚡ ボス戦：今週の単語で倒しきれ' : s.practice ? '⚡ タイムアタック（練習：復習間隔は変わりません）' : '⚡ タイムアタック'}</p>${bossBar}${prompt}<div class="combo">${s.combo >= 3 ? `${s.combo} COMBO` : ''}</div><div class="opts">${opts}</div>`,
      { timer: `<div class="timer"><i style="width:${(100 * s.left) / s.total}%"></i></div>`, score: `${s.score}` });
    const sp = $('#sp', play); if (sp) sp.onclick = () => say(w.w, 0.85);
    if (q.kind === 'listen') say(w.w, 0.85);
    $('.opts', play).onclick = (e) => { const b = e.target.closest('.opt'); if (b && !s.locked) answer(b); };
  }
  async function answer(btn) {
    const s = session, q = s.q, ok = btn.dataset.id === q.answer;
    s.locked = true; s.answered++;
    const first = !s.graded.has(q.id);
    if (first) { if (!s.practice) KV.grade(S, q.id, ok, TODAY); s.graded.add(q.id); }
    if (ok) {
      btn.classList.add('right'); s.combo++;
      const gain = KV.XP.correct + (s.combo >= 5 ? KV.XP.combo : 0);
      s.score += KV.addXp(S, TODAY, gain);
      if (s.boss && first) s.hp = Math.max(0, s.hp - 1);
    } else {
      btn.classList.add('wrong'); s.combo = 0;
      play.querySelector(`.opt[data-id="${CSS.escape(q.answer)}"]`).classList.add('right');
      say(BYID[q.answer].w, 0.85);
      if (!s.requeued.has(q.id)) { s.requeued.add(q.id); s.queue.push(q.id); }
    }
    save();
    await sleep(ok ? 550 : 1500);
    s.locked = false;
    if (session !== s) return;
    if (s.boss && s.hp === 0) return finishStage1();
    nextQ();
  }
  function finishStage1() {
    const s = session; if (!s || s.stage !== 1 || s.finished) return;
    s.finished = true; clearInterval(s.timer);
    const extra = [];
    if (s.boss) {
      if (s.hp === 0) { S.stats.bossWins++; KV.addXp(S, TODAY, KV.XP.boss); extra.push(`👾 ボス撃破！ +${KV.XP.boss} XP`); }
      else extra.push(`ボスの残りHP ${s.hp}。来週リベンジ`);
    }
    extra.push(`${s.graded.size}語に回答`);
    if (s.answered > 0 || s.newIds.length) extra.push(...stageEvents(KV.completeStage(S, 1, TODAY)));
    save();
    result(1, S.xp - s.xp0, extra);
  }

  // ---------- stage 2: pronunciation ----------
  function voiceItems() {
    const ids = KV.introducedOn(S, TODAY);
    const recent = Object.entries(S.cards).filter(([id]) => !ids.includes(id)).sort((a, b) => (a[1].seen < b[1].seen ? 1 : -1)).map(([id]) => id);
    let list = [...ids, ...recent].slice(0, 5);
    if (!list.length) list = BANK.slice(0, 5).map((w) => w.id);
    return list.map((id) => BYID[id]).filter(Boolean);
  }
  function stage2() {
    session = { stage: 2, lvBefore: KV.levelOf(S.xp), xp0: S.xp, items: voiceItems(), i: 0, tries: 0, passed: 0 };
    voiceCard();
  }
  function voiceCard() {
    const s = session, w = s.items[s.i], target = w.col[0] || w.w;
    s.tries = 0;
    const canMic = !!SR && !micBlocked;
    shell(`<p class="stagehead">🎤 発音チャレンジ ${s.i + 1} / ${s.items.length}</p>
      <p class="q-prompt">聞いて、声に出して言ってみよう</p>
      <div class="word en" style="font-size:40px">${esc(target)}</div>
      <div class="ipa">${esc(w.w)} ${esc(w.ipa)}　<button class="speak" id="sp" aria-label="お手本を聞く">🔊</button></div>
      <div class="ja" style="font-size:16px;font-weight:600">${esc(w.ja)}</div>
      ${canMic ? `<button class="mic" id="mic" aria-label="話す">🎙</button><div class="heard" id="heard" aria-live="polite"></div><div class="verdict" id="vd"></div>`
        : `<p class="note" style="margin-top:20px">${micBlocked ? 'マイクが使えないため、自己判定モードです。' : 'この端末のブラウザは音声認識に対応していないため、自己判定モードです。'}🔊を聞いてから3回声に出したら「言えた」を押してください。</p>`}
      <div class="row">${canMic ? '' : '<button class="go" id="self">言えた</button>'}<button class="ghost" id="skip">スキップ</button></div>`, { score: `${s.passed}/${s.items.length}` });
    $('#sp', play).onclick = () => say(target, 0.85);
    say(target, 0.85);
    $('#skip', play).onclick = () => nextVoice(false);
    if (!canMic) { $('#self', play).onclick = () => nextVoice(true); return; }
    $('#mic', play).onclick = () => listen(target);
  }
  function listen(target) {
    const s = session, mic = $('#mic', play), heard = $('#heard', play), vd = $('#vd', play);
    if (s.rec) { try { s.rec.stop(); } catch { /* noop */ } return; }
    if (TTS) speechSynthesis.cancel();
    const r = new SR(); s.rec = r;
    r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 5;
    mic.classList.add('on'); mic.textContent = '■'; heard.textContent = '聞いています…'; vd.textContent = ''; vd.className = 'verdict';
    r.onresult = (e) => {
      const alts = Array.from(e.results[0]).map((a) => a.transcript);
      const score = KV.speechScore(target, alts);
      heard.textContent = `“${alts[0] || ''}”`;
      s.tries++;
      if (score >= KV.VOICE_PASS) { vd.textContent = `合格 ${Math.round(score * 100)}%`; vd.className = 'verdict ok'; setTimeout(() => session === s && nextVoice(true), 900); }
      else { vd.textContent = s.tries >= 3 ? `${Math.round(score * 100)}%。お手本をもう一度聞いて、またはスキップ` : `${Math.round(score * 100)}%。もう一回`; vd.className = 'verdict ng'; }
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { micBlocked = true; toast('マイクが許可されていません。自己判定モードに切り替えます'); voiceCard(); }
      else if (e.error === 'no-speech') { heard.textContent = '聞き取れませんでした。もう一回'; }
    };
    r.onend = () => { s.rec = null; const m = $('#mic', play); if (m) { m.classList.remove('on'); m.textContent = '🎙'; } if (heard.textContent === '聞いています…') heard.textContent = ''; };
    try { r.start(); } catch { s.rec = null; }
  }
  function nextVoice(ok) {
    const s = session;
    if (ok) { s.passed++; S.stats.spoken++; KV.addXp(S, TODAY, KV.XP.voice); save(); }
    s.i++;
    if (s.i < s.items.length) return voiceCard();
    const ev = stageEvents(KV.completeStage(S, 2, TODAY)); save();
    result(2, S.xp - s.xp0, [`${s.passed} / ${s.items.length} フレーズ合格`, ...ev]);
  }

  // ---------- stage 3: shadowing ----------
  function stage3() {
    const wk = KV.shadowWeek(SHADOW, TODAY);
    const steps = (SHADOW && SHADOW.steps) || ['字幕なしで見る', '口だけ動かす', '台本ありで2回', '台本なしで2回', '録音して聴き比べ'];
    session = { stage: 3, lvBefore: KV.levelOf(S.xp), xp0: S.xp, done: new Set() };
    const s = session;
    const clip = wk ? `<section class="card"><div class="clip"><span class="num">${fmtT(wk.start)}〜${fmtT(wk.end)}</span><span class="note">${esc(wk.wk)}　${esc(wk.title)}</span></div>
        <p class="note" style="margin:8px 0 0">今週の連結ポイント</p><div class="hint">${esc(wk.hint)}</div>
        <a class="yt" href="https://www.youtube.com/watch?v=${encodeURIComponent(wk.video)}&t=${wk.start}s" target="_blank" rel="noopener">▶ YouTubeで今週の区間を開く</a>
        <p class="note" style="margin:10px 0 0">台本：Obsidian の ${esc(wk.script)}</p></section>`
      : '<section class="card"><p style="margin:0">今週のクリップが未設定です。Obsidianの台本ノートの今週分で練習してください。</p></section>';
    shell(`<p class="stagehead">🎧 シャドーイング</p>${clip}
      <ol class="steps">${steps.map((t, i) => `<li><button aria-pressed="false" data-i="${i}"><span class="n">${i + 1}</span>${esc(t)}</button></li>`).join('')}</ol>
      <button class="go" id="fin" disabled>シャドーイング完了</button>`);
    $('.steps', play).onclick = (e) => {
      const b = e.target.closest('button[data-i]'); if (!b) return;
      const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on);
      on ? s.done.add(b.dataset.i) : s.done.delete(b.dataset.i);
      $('#fin', play).disabled = s.done.size < steps.length;
    };
    $('#fin', play).onclick = () => {
      const first = !rec().s3;
      if (first) KV.addXp(S, TODAY, KV.XP.shadow);
      const ev = stageEvents(KV.completeStage(S, 3, TODAY)); save();
      result(3, S.xp - s.xp0, ev);
    };
  }

  // ---------- sheets ----------
  const sheet = $('#sheet');
  function openSheet(html) { sheet.innerHTML = html; sheet.showModal(); sheet.querySelector('[data-close]')?.addEventListener('click', () => sheet.close()); }
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
  function wordSheet(id) {
    const w = BYID[id], c = S.cards[id];
    openSheet(`<div class="word en" style="font-size:42px">${esc(w.w)}</div>
      <div class="ipa">${esc(w.ipa)}　${esc(w.pos)}　<button class="speak" id="sp" aria-label="発音を聞く">🔊</button></div>
      <div class="ja">${esc(w.ja)}</div><p class="ex">${esc(w.ex)}</p><p class="exja">${esc(w.exja)}</p>
      <div class="cols">${w.col.map((x) => `<span>${esc(x)}</span>`).join('')}</div>
      <p class="note" style="margin-top:14px">${stars(c.stage)}　出会った日 ${esc(c.seen)}　次の出題 ${esc(c.due)}　正解${c.right} / 不正解${c.wrong}</p>
      <button class="ghost" data-close style="width:100%;margin-top:8px">閉じる</button>`);
    $('#sp', sheet).onclick = () => say(w.w, 0.85);
  }
  function settingsSheet() {
    const data = JSON.stringify(S);
    openSheet(`<h2>バックアップ</h2>
      <p class="note">記録はこの端末のブラウザに保存されています。機種変更やデータ削除に備えて、ときどき書き出しておくと安心です。ホーム画面に追加すると消えにくくなります。</p>
      <div class="row" style="margin-top:4px"><button class="ghost" id="copy">記録をコピー</button><button class="ghost" id="dl">ファイルに保存</button></div>
      <h2 style="margin-top:20px">復元</h2>
      <textarea id="imp" placeholder="コピーした記録をここに貼り付け"></textarea>
      <button class="ghost" id="doimp" style="width:100%;margin-top:8px">貼り付けた記録で上書きする</button>
      <h2 style="margin-top:20px">音声</h2>
      <p class="note">読み上げ：${TTS ? (voice ? esc(voice.name) : '既定の英語音声') : '非対応'}　音声認識：${SR ? '対応' : '非対応（自己判定モード）'}</p>
      <button class="ghost" id="tts" style="width:100%">読み上げテスト</button>
      <button class="ghost" data-close style="width:100%;margin-top:16px">閉じる</button>`);
    $('#copy', sheet).onclick = async () => { try { await navigator.clipboard.writeText(data); toast('記録をコピーしました'); } catch { $('#imp', sheet).value = data; toast('下の欄に表示しました。手動でコピーしてください'); } };
    $('#dl', sheet).onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = `keita-vocab-backup-${TODAY}.json`; a.click(); };
    $('#doimp', sheet).onclick = () => {
      try { const v = JSON.parse($('#imp', sheet).value); if (v.v !== 2) throw 0; S = KV.normalizeState(v); save(); sheet.close(); render(); toast('記録を復元しました'); }
      catch { toast('形式が違います。「記録をコピー」で書き出したものを貼り付けてください'); }
    };
    $('#tts', sheet).onclick = () => say('Good morning. Let us streamline the process.');
  }

  boot();
})();
