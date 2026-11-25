// Full exam simulation in real Chromium: launch Full Exam A from the Exams tab,
const BASE = process.env.BASE_URL || 'http://localhost:8000/index.html';
// answer through the UI, flag, pause/resume, mid-exam review, submit, check the
// results screen against an independent recomputation, walk the post-exam review.
const { chromium } = require('playwright');
const OUT = process.argv[2] || require('os').tmpdir();
const TAG = process.argv[3] || 'sim';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.addInitScript({ path: require('path').join(__dirname, 'oracle.js') });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts\.g|net::/.test(m.text())) errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(BASE);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(800);
  const E = s => p.evaluate(s);

  // ---- launch Full Exam A through the UI
  await E(`location.hash='#/exam'`); await p.waitForTimeout(300);
  await p.click('.set-card.exam-set >> nth=0');
  await p.waitForTimeout(400);
  ok(await E(`document.getElementById('exam-screen').classList.contains('active')`), 'exam screen active');
  const total = await E(`window.eval('S.questions.length')`);
  ok(total === 90, 'Full exam has 90 items, got ' + total);
  ok(await E(`window.eval('S.timeRemaining')`) <= 5400 && await E(`window.eval('S.timeRemaining')`) >= 5395, 'timer ~5400');
  const pbqIdx = await E(`window.eval('S.questions.map((q,i)=>q.type.startsWith("pbq")?i:-1).filter(i=>i>=0)')`);
  ok(pbqIdx.length === 5, 'Form A has 5 PBQs, got ' + pbqIdx.length);
  ok(pbqIdx.join(',') === '0,1,2,3,4', 'PBQs open the form (default), got ' + pbqIdx.join(','));
  await p.screenshot({ path: `${OUT}/${TAG}-exam-q1.png` });

  // ---- answer every item through the UI
  const plan = []; // i -> 'right' | 'wrong' | 'skip'
  for (let i = 0; i < total; i++) plan.push(i % 7 === 3 ? 'wrong' : i % 11 === 5 ? 'skip' : 'right');
  let shotPbq = false;
  for (let i = 0; i < total; i++) {
    const info = await E(`window.eval('(()=>{const q=S.questions[S.currentIdx];return {i:S.currentIdx,type:q.type,opts:(q.options||[]).map(o=>({id:o.id,c:!!o.correct})),sel:q.selectCount||2}})()')`);
    ok(info.i === i, `index ${i} vs ${info.i}`);
    const want = plan[i];
    if (info.type === 'mcq-single' && want !== 'skip') {
      const target = want === 'right' ? info.opts.find(o => o.c) : info.opts.find(o => !o.c);
      await p.click(`#content-area .opt-row[data-opt="${target.id}"]`);
    } else if (info.type === 'mcq-multi' && want !== 'skip') {
      const corr = info.opts.filter(o => o.c).map(o => o.id);
      const pick = want === 'right' ? corr : [info.opts.find(o => !o.c).id, ...corr].slice(0, info.sel);
      for (const id of pick) await p.click(`#content-area .opt-row[data-opt="${id}"]`);
      // the cap must hold: clicking one more unselected option should be ignored
      const extra = info.opts.find(o => !pick.includes(o.id));
      if (extra) await p.click(`#content-area .opt-row[data-opt="${extra.id}"]`);
      const n = await E(`window.eval('S.answers[S.questions[S.currentIdx].id].length')`);
      ok(n === info.sel, `multi cap held at q${i + 1}: ${n}/${info.sel}`);
    } else if (info.type.startsWith('pbq')) {
      if (!shotPbq) { await p.screenshot({ path: `${OUT}/${TAG}-exam-pbq.png` }); shotPbq = true; }
      // drive whatever selects the PBQ offers through the UI (first non-placeholder option)
      const sels = await p.$$('#content-area select');
      for (const s of sels) {
        const vals = await s.$$eval('option', os => os.map(o => o.value).filter(v => v !== ''));
        if (vals.length) await s.selectOption(vals[vals.length > 1 ? 1 : 0]).catch(() => {});
      }
      if (want === 'right') {
        // whitebox: overwrite with the oracle answer so we can check full credit end to end
        await E(`window.eval(${JSON.stringify(`S.answers[S.questions[S.currentIdx].id]=ORACLE(S.questions[S.currentIdx]);renderQ();updateNavigator();`)})`.replace('ORACLE', 'window.__oracle'));
      }
    }
    if (i === 10 || i === 42) await p.click('#tb-flag-btn');
    if (i === 20) { // pause and resume with the button, then with the keyboard
      await p.click('#tb-pause-btn'); await p.waitForTimeout(150);
      ok(await E(`document.getElementById('pause-overlay').classList.contains('open')`), 'pause overlay opens');
      const t1 = await E(`window.eval('S.timeRemaining')`); await p.waitForTimeout(1300);
      ok(await E(`window.eval('S.timeRemaining')`) === t1, 'timer frozen while paused');
      await p.click('#pause-overlay button'); await p.waitForTimeout(100);
      ok(!(await E(`document.getElementById('pause-overlay').classList.contains('open')`)), 'resume by click');
      await p.keyboard.press('p'); await p.waitForTimeout(100);
      ok(await E(`window.eval('S.pauseStart!==null')`), 'P pauses');
      await p.keyboard.press('p'); await p.waitForTimeout(100);
      ok(await E(`window.eval('S.pauseStart===null')`), 'P resumes (keyboard)');
      if (await E(`window.eval('S.pauseStart!==null')`)) await p.click('#pause-overlay button');
    }
    if (i < total - 1) await p.click('#x-next');
  }
  // Next on the final item opens the mid-exam review grid
  await p.click('#x-next'); await p.waitForTimeout(200);
  ok(await E(`document.getElementById('exam-screen').dataset.ephase`) === 'review', 'mid-exam review grid opens after last item');
  await p.screenshot({ path: `${OUT}/${TAG}-midreview.png` });
  // mirror what we expect
  const exp = await E(`window.eval('(()=>{let c=0,pa=0,inc=0,un=0,pts=0,max=0;S.questions.forEach(q=>{const s=computeScore(q),w=q.type.startsWith("pbq")?2:1;pts+=s*w;max+=w;if(!isAnswered(q.id))un++;if(s>=0.999)c++;else if(s>0)pa++;});return {c,pa,un,raw:Math.round(pts/max*100),flags:S.flags.size}})()')`);
  ok(exp.flags === 2, 'two flags, got ' + exp.flags);

  // ---- end exam through the modal
  await E(`window.eval('triggerEndExam()')`); await p.waitForTimeout(150);
  ok(await E(`document.getElementById('modal-end').classList.contains('open')`), 'end-exam modal opens');
  const unText = await E(`document.getElementById('m-unanswered').textContent`);
  ok(+unText === exp.un, `modal incomplete count ${unText} vs ${exp.un}`);
  await p.click('#modal-end .btn-danger, #modal-end [onclick*="submitExam"]');
  await p.waitForTimeout(400);
  ok(await E(`document.getElementById('results-screen').classList.contains('active')`), 'results screen shows');
  await p.screenshot({ path: `${OUT}/${TAG}-results.png`, fullPage: true });
  const scaled = +(await E(`document.getElementById('r-score').textContent`));
  const expScaled = exp.raw < 70 ? Math.round(100 + exp.raw / 70 * 650) : Math.round(750 + (exp.raw - 70) / 30 * 150);
  ok(scaled === expScaled, `scaled ${scaled} vs ${expScaled}`);
  const stats = await E(`[...document.querySelectorAll('#r-stats .r-stat')].map(x=>x.querySelector('.r-stat-n').textContent)`);
  ok(+stats[0] === exp.c, `correct ${stats[0]} vs ${exp.c}`);
  ok(+stats[1] === exp.pa, `partial ${stats[1]} vs ${exp.pa}`);
  ok(+stats[3] === exp.un, `skipped ${stats[3]} vs ${exp.un}`);
  const att = await E(`JSON.parse(localStorage.getItem('sy0701_attempts_v2'))`);
  ok(att.length === 1 && att[0].total === 90 && att[0].mode === 'exam', 'one 90-item exam attempt recorded');
  ok(att[0].score === exp.raw, `attempt score ${att[0].score} vs raw ${exp.raw}`);
  ok(!(await E(`localStorage.getItem('sy0701_exam_snapshot')`)), 'snapshot discarded after submit');
  console.log(`  result: scaled ${scaled}, raw ${exp.raw}%, correct ${exp.c}, partial ${exp.pa}, skipped ${exp.un}`);

  // ---- post-exam review: open, walk every item with Next, filters
  await E(`window.eval('showReview("all")')`); await p.waitForTimeout(250);
  await p.screenshot({ path: `${OUT}/${TAG}-review-grid.png` });
  const cells = await E(`document.querySelectorAll('#exam-review-phase .xrev-item').length`);
  ok(cells >= 90, 'review grid lists all items: ' + cells);
  await E(`window.eval('openReviewItem(0)')`); await p.waitForTimeout(150);
  let seen = 0;
  for (let i = 0; i < 90; i++) {
    const v = await E(`!!document.querySelector('#content-area .qreview-verdict')`);
    if (v) seen++;
    if (i === pbqIdx[0]) await p.screenshot({ path: `${OUT}/${TAG}-review-pbq.png` });
    if (i === 3) await p.screenshot({ path: `${OUT}/${TAG}-review-item.png` });
    await p.keyboard.press('ArrowRight');
  }
  ok(seen === 90, 'every review item shows a verdict: ' + seen);
  ok(await E(`!document.querySelector('#content-area .opt-row:not(.readonly)')`), 'review options are read-only');
  for (const f of ['incorrect', 'flagged', 'pbq', 'correct', 'all']) {
    await E(`window.eval('showReview(${JSON.stringify(f)})')`);
  }
  // leave review
  await E(`window.eval('backToDashboardFromReview()')`); await p.waitForTimeout(300);
  ok(await E(`document.getElementById('screen-dashboard').classList.contains('active')`), 'back to dashboard');
  const sessions = await E(`document.querySelector('#dashboard-root .stat .v, #dashboard-root .kpi .v')?.textContent`);
  await p.screenshot({ path: `${OUT}/${TAG}-dash-after.png` });
  await E(`location.hash='#/analytics'`); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${TAG}-analytics-after.png`, fullPage: true });

  ok(errs.length === 0, 'no console errors: ' + errs.join(' | '));
  console.log(`exam sim: ${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
