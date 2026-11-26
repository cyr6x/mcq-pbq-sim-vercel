// Whitebox suite: runs the page's own engine in Chromium and checks invariants.
const BASE = process.env.BASE_URL || 'http://localhost:8000/index.html';
const { chromium } = require('playwright');
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const section = s => console.log('# ' + s);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.addInitScript({ path: path.join(__dirname, 'oracle.js') });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|net::|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(BASE);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(600);
  const W = src => p.evaluate(s => window.eval(s), src);

  section('bank integrity');
  const bank = await W(`(()=>{
    const ids=new Set(),dup=[],bad=[],perDom={};
    const stems=new Map(),dupStem=[];
    SEED_QUESTIONS.forEach(q=>{
      if(ids.has(q.id))dup.push(q.id);ids.add(q.id);
      perDom[q.domain]=(perDom[q.domain]||0)+1;
      const c=(q.options||[]).filter(o=>o.correct).length;
      if(!q.stem||!q.options||q.options.length<2)bad.push(q.id+':shape');
      if(q.type==='mcq-single'&&c!==1)bad.push(q.id+':single has '+c);
      if(q.type==='mcq-multi'&&c!==(q.selectCount||2))bad.push(q.id+':multi '+c+'/'+q.selectCount);
      if(new Set(q.options.map(o=>o.id)).size!==q.options.length)bad.push(q.id+':dup opt id');
      if(new Set(q.options.map(o=>o.text.trim().toLowerCase())).size!==q.options.length)bad.push(q.id+':dup opt text');
      if(!DOMAINS[q.domain])bad.push(q.id+':domain '+q.domain);
      if(q.obj&&q.obj.split('.')[0]+'.0'!==q.domain)bad.push(q.id+':obj/domain '+q.obj+'/'+q.domain);
      if(!q.explanation)bad.push(q.id+':no explanation');
      const k=q.stem.trim().toLowerCase(); if(stems.has(k))dupStem.push(q.id+'='+stems.get(k)); stems.set(k,q.id);
    });
    const pids=new Set(),pdup=[];
    PBQ_SEEDS.forEach(q=>{if(pids.has(q.id)||ids.has(q.id))pdup.push(q.id);pids.add(q.id);});
    return {n:SEED_QUESTIONS.length,p:PBQ_SEEDS.length,dup,bad,perDom,dupStem,pdup};
  })()`);
  ok(bank.n === 450, 'MCQ bank 450, got ' + bank.n);
  ok(bank.p === 70, 'PBQ bank 70, got ' + bank.p);
  ok(!bank.dup.length && !bank.pdup.length, 'unique ids ' + bank.dup.concat(bank.pdup));
  ok(Object.values(bank.perDom).every(n => n === 90), '90 per domain ' + JSON.stringify(bank.perDom));
  ok(!bank.bad.length, 'MCQ shape issues: ' + bank.bad.slice(0, 20).join(', ') + (bank.bad.length > 20 ? ` (+${bank.bad.length - 20})` : ''));
  ok(!bank.dupStem.length, 'duplicate stems: ' + bank.dupStem.join(', '));

  section('every PBQ: oracle = 1.0, blank = 0, renders live + review');
  const pbqRes = await W(`(()=>{
    const out=[];
    const all=[...PBQ_SEEDS,...SY801_PBQS];
    S.mode='exam';
    all.forEach(q0=>{
      const q=_shuffleQuestion(q0);
      S.questions=[q];S.currentIdx=0;S.answers={};S.reviewMode=false;
      let err='';
      try{renderQ();}catch(e){err='render:'+e.message;}
      const blank=computeScore(q);
      S.answers[q.id]=__oracle(q);
      const full=computeScore(q);
      S.reviewMode=true;
      try{renderQ();}catch(e){err+=' review:'+e.message;}
      const hasSol=!!document.querySelector('#content-area .qreview-verdict');
      S.reviewMode=false;
      if(err||blank!==0||Math.abs(full-1)>1e-9||!hasSol)out.push({id:q.id,type:q.type,err,blank,full,hasSol});
    });
    S.questions=[];S.answers={};
    return {n:all.length,out};
  })()`);
  ok(pbqRes.n === 74, 'PBQ count incl. 801 = 74, got ' + pbqRes.n);
  ok(!pbqRes.out.length, 'PBQ oracle/blank/render problems: ' + JSON.stringify(pbqRes.out.slice(0, 8)));

  section('every MCQ: render + review + oracle');
  const mcqRes = await W(`(()=>{
    const out=[];
    [...SEED_QUESTIONS,...SY801_MCQS].forEach(q0=>{
      const q=_shuffleQuestion(q0);
      S.questions=[q];S.currentIdx=0;S.answers={};S.reviewMode=false;
      try{renderQ();}catch(e){out.push(q.id+':'+e.message);return;}
      if(document.querySelectorAll('#content-area .opt-row').length!==q.options.length)out.push(q.id+':opt count');
      if(/\\*\\*/.test(document.getElementById('content-area').textContent))out.push(q.id+':raw **');
      S.answers[q.id]=__oracle(q);
      if(computeScore(q)!==1)out.push(q.id+':oracle '+computeScore(q));
      if(q.whyWrong){const cor=q.options.filter(o=>o.correct).map(o=>o.id);
        Object.keys(q.whyWrong).forEach(k=>{if(cor.includes(k))out.push(q.id+':whyWrong on correct '+k); if(!q.options.some(o=>o.id===k))out.push(q.id+':whyWrong key '+k);});}
    });
    S.questions=[];S.answers={};
    return out;
  })()`);
  ok(!mcqRes.length, 'MCQ problems: ' + mcqRes.slice(0, 15).join(', ') + (mcqRes.length > 15 ? ` (+${mcqRes.length - 15})` : ''));

  section('five full forms');
  const forms = await W(`(()=>{
    const res=[];const allP=new Set();let cross=0;
    EXAM_VARIANTS.forEach(v=>{
      _resetForLaunch({mode:'exam',variant:v.id,label:v.label});buildExamQuestions();
      const ids=S.questions.map(q=>q.id);const p=S.questions.filter(q=>q.type.startsWith('pbq'));
      p.forEach(q=>{if(allP.has(q.id))cross++;allP.add(q.id);});
      const dom={};S.questions.filter(q=>!q.type.startsWith('pbq')).forEach(q=>dom[q.domain]=(dom[q.domain]||0)+1);
      res.push({id:v.id,n:ids.length,uniq:new Set(ids).size,pbq:p.length,first:S.questions[0].type,last:S.questions[89].type,dom,t:S.timeRemaining});
    });
    S.questions=[];
    return {res,cross};
  })()`);
  const distr = [5, 4, 6, 5, 4];
  forms.res.forEach((f, i) => {
    ok(f.n === 90 && f.uniq === 90, `form ${f.id}: 90 unique (${f.n}/${f.uniq})`);
    ok(f.pbq === distr[i], `form ${f.id}: ${distr[i]} PBQs, got ${f.pbq}`);
    ok(f.first.startsWith('pbq') && !f.last.startsWith('pbq'), `form ${f.id}: PBQs open the form by default`);
    ok(f.t === 5400, `form ${f.id}: 5400 s`);
    const w = { '1.0': 12, '2.0': 22, '3.0': 18, '4.0': 28, '5.0': 20 }, mc = 90 - f.pbq;
    Object.entries(w).forEach(([d, pc]) => ok(Math.abs((f.dom[d] || 0) - mc * pc / 100) <= 2, `form ${f.id} domain ${d} ${f.dom[d]} vs ~${(mc * pc / 100).toFixed(1)}`));
  });
  ok(forms.cross === 0, 'no PBQ shared across forms');

  section('PBQ placement setting');
  const place = await W(`(()=>{const r={};
    PREFS.pbqFirst=true;_resetForLaunch({mode:'exam',variant:3,label:'C'});buildExamQuestions();
    const n=S.questions.filter(q=>q.type.startsWith('pbq')).length;
    r.first=S.questions.slice(0,n).every(q=>q.type.startsWith('pbq'));
    PREFS.pbqFirst=false;_resetForLaunch({mode:'exam',variant:3,label:'C'});buildExamQuestions();
    const idx=S.questions.map((q,i)=>q.type.startsWith('pbq')?i:-1).filter(i=>i>=0);
    r.spread=idx.length===n&&idx[0]>0&&idx[idx.length-1]<89&&idx[idx.length-1]-idx[0]>40;
    r.domInter=!domainExamIds('4.0',1).slice(0,3).every(id=>/^pbq/.test(id));
    PREFS.pbqFirst=true;r.domFirst=domainExamIds('4.0',1).slice(0,3).every(id=>/^pbq/.test(id));
    S.questions=[];return r;})()`);
  ok(place.first, 'pbqFirst=true: all PBQs lead the form');
  ok(place.spread, 'pbqFirst=false: PBQs spread through the form');
  ok(place.domFirst && place.domInter, 'domain exams follow the setting in both modes');

  section('realism: PBQ size, scope, MCQ stems, distractors');
  const real = await W(`(()=>{
    const over=PBQ_SEEDS.filter(q=>pbqDecisions(q)>PBQ_MAX_DECISIONS).map(q=>q.id+':'+pbqDecisions(q));
    const under=PBQ_SEEDS.filter(q=>pbqDecisions(q)<3).map(q=>q.id);
    const oosInForms=pbqForms().flat().filter(q=>q.outOfScope).map(q=>q.id);
    const oosInDomain=['1.0','2.0','3.0','4.0','5.0'].flatMap(d=>[1,2,3].flatMap(k=>domainExamIds(d,k))).filter(id=>PBQ_OUT_OF_SCOPE[id]);
    const wc=s=>String(s).split('**').filter((_,i)=>i%2===0).join(' ').trim().split(' ').filter(Boolean).length;
    const stems=SEED_QUESTIONS.map(q=>wc(q.stem)).sort((a,b)=>a-b);
    const shortStems=SEED_QUESTIONS.filter(q=>wc(q.stem)<12).map(q=>q.id);
    const joke=SEED_QUESTIONS.filter(q=>q.options.some(o=>/cafeteria|lunch|menu|cable management|office supply|parking|gut feeling|holiday|power distribution|marketing materials/i.test(o.text))).map(q=>q.id);
    const countWords=PBQ_SEEDS.filter(q=>q._trimmedFrom&&new RegExp('(^|[^a-z])'+_NUMW[q._trimmedFrom]+'([^a-z]|$)','i').test(q.scenario||'')).map(q=>q.id);
    return {over,under,oosInForms,oosInDomain,median:stems[stems.length>>1],shortStems,joke,countWords};})()`);
  ok(!real.over.length, 'no PBQ above the decision cap: ' + real.over.join(','));
  ok(!real.under.length, 'no PBQ trimmed below 3 decisions: ' + real.under.join(','));
  ok(!real.oosInForms.length && !real.oosInDomain.length, 'out-of-scope PBQs never drawn into exams');
  ok(real.median >= 22, 'MCQ median stem is scenario length (>=22 words), got ' + real.median);
  ok(!real.shortStems.length, 'no MCQ stem under 12 words: ' + real.shortStems.join(','));
  ok(!real.joke.length, 'no throwaway distractors: ' + real.joke.join(','));
  ok(!real.countWords.length, 'PBQ scenario counts match trimmed items: ' + real.countWords.join(','));

  section('full-credit and blank exams via the engine');
  for (const v of [1, 3]) {
    const r = await W(`(()=>{_doLaunch({mode:'exam',variant:${v},label:'Full Exam'});
      S.questions.forEach(q=>S.answers[q.id]=__oracle(q));submitExam();
      return {scaled:+document.getElementById('r-score').textContent,pf:document.getElementById('r-pf').textContent,
        stats:[...document.querySelectorAll('#r-stats .r-stat-n')].map(x=>x.textContent)};})()`);
    ok(r.scaled === 900 && /PASS/.test(r.pf), `form ${v} all-correct → 900 PASS (${r.scaled} ${r.pf})`);
    ok(r.stats[0] === '90' && r.stats[2] === '0', `form ${v} all-correct stats ${r.stats.join(',')}`);
    await W(`exitReviewMode();restartExam()`);
  }
  const blank = await W(`(()=>{_doLaunch({mode:'exam',variant:2,label:'Full Exam B'});submitExam();
    const m=reviewMetrics();
    return {scaled:+document.getElementById('r-score').textContent,stats:[...document.querySelectorAll('#r-stats .r-stat-n')].map(x=>x.textContent),m};})()`);
  ok(blank.scaled < 750, 'blank exam fails: ' + blank.scaled);
  ok(+blank.stats[0] + +blank.stats[1] + +blank.stats[2] + +blank.stats[3] === 90, 'results tiles sum to 90: ' + blank.stats.slice(0, 4).join('+'));
  ok(+blank.stats[2] === blank.m.incorrect && +blank.stats[3] === blank.m.incomplete, `results Incorrect/Skipped match review metrics (${blank.stats[2]}/${blank.stats[3]} vs ${blank.m.incorrect}/${blank.m.incomplete})`);
  await W(`exitReviewMode();restartExam()`);

  section('mid-exam review must not leak correctness');
  const leak = await W(`(()=>{_doLaunch({mode:'exam',variant:1,label:'Full Exam A'});
    const q=S.questions.find(q=>q.type==='mcq-single');S.answers[q.id]=q.options.find(o=>!o.correct).id;
    openExamReview();const t=document.getElementById('exam-review-phase').textContent;
    const r={correct:/\\bCorrect\\b/.test(t),incorrect:/\\bIncorrect\\b/.test(t),pct:/\\d+%/.test(t),cls:!!document.querySelector('#exam-review-phase .xrev-item.incorrect, #exam-review-phase .xrev-item.correct')};
    closeExamReview();return r;})()`);
  ok(!leak.correct && !leak.incorrect && !leak.pct && !leak.cls, 'live review grid hides grading ' + JSON.stringify(leak));
  const navLeak = await W(`document.querySelectorAll('#q-grid .q-chip.correct, #q-grid .q-chip.incorrect').length`);
  ok(navLeak === 0, 'navigator hides grading while live');
  await W(`abandonLiveExam();S.endTime=Date.now();restartExam()`);

  section('domain exams');
  const dx = await W(`(()=>{const out=[];
    ['1.0','2.0','3.0','4.0','5.0'].forEach(d=>{const seen=new Set();
      for(let k=1;k<=3;k++){const ids=domainExamIds(d,k);
        _doLaunch({mode:'exam',timeLimit:1800,explain:false,label:'D',launchOpts:{explicitIds:ids}});
        const n=S.questions.length,pb=S.questions.filter(q=>q.type.startsWith('pbq')).length;
        const wrongDom=S.questions.filter(q=>q.domain!==d).length;let overlap=0;
        ids.forEach(id=>{if(seen.has(id))overlap++;seen.add(id);});
        out.push({d,k,n,pb,wrongDom,overlap,t:S.timeRemaining,ex:S.showExplanations});
        abandonLiveExam();S.endTime=Date.now();}
    });S.questions=[];S.endTime=null;return out;})()`);
  dx.forEach(x => ok(x.n === 30 && x.pb === 3 && x.wrongDom === 0 && x.overlap === 0 && x.t === 1800 && !x.ex, 'domain exam ' + JSON.stringify(x)));

  section('SY0-801 preview');
  const s8 = await W(`(()=>{const out=[];for(let v=1;v<=3;v++){
    _doLaunch({mode:'exam',track:'801',variant:v,label:'SY0-801 Preview'});
    const n=S.questions.length,ids=new Set(S.questions.map(q=>q.id)).size,pb=S.questions.filter(q=>q.type.startsWith('pbq')).length;
    const chip=document.getElementById('x-mode-chip').textContent,track=document.getElementById('exam-screen').dataset.track;
    S.questions.forEach(q=>S.answers[q.id]=__oracle(q));submitExam();
    out.push({n,ids,pb,chip,track,score:+document.getElementById('r-score').textContent,sub:document.getElementById('r-sub').textContent});
    exitReviewMode();restartExam();}return out;})()`);
  s8.forEach((x, i) => ok(x.n === 90 && x.ids === 90 && x.pb === 6 && x.track === '801' && /801/.test(x.chip) && x.score === 900 && /SY0-801/.test(x.sub), `801 v${i + 1} ${JSON.stringify(x)}`));

  section('study mode');
  const st = await W(`(()=>{_doLaunch({mode:'study',count:20,explain:true});
    const n=S.questions.length;const danger=document.querySelectorAll('#q-grid .danger-unanswered').length;
    const timer=document.getElementById('timer').textContent;const wrapRed=document.getElementById('timer-wrap').classList.contains('red');
    const q=S.questions.find(q=>q.type==='mcq-single');const i=S.questions.indexOf(q);goTo(i);
    const hint=document.querySelector('#content-area .hint-btn');const hintText=hint?hint.textContent:'';
    if(hint)hint.click();
    const hintShown=document.querySelector('#content-area .hint-panel.visible')?.textContent||'';
    document.querySelector('#content-area .opt-row[data-opt="'+q.options.find(o=>o.correct).id+'"]').click();
    const exp=!!document.querySelector('#content-area .review-explanation');
    const hintAfter=document.querySelector('#content-area .hint-panel.visible')?.textContent||'';
    return {n,danger,timer,wrapRed,exp,hintText,hintShown,hintAfter};})()`);
  ok(st.n === 20, 'study 20 items');
  ok(st.timer === '∞', 'untimed study shows ∞');
  ok(st.danger === 0, 'untimed study: no "time running out" chips, got ' + st.danger);
  ok(!st.wrapRed, 'untimed study: timer not red');
  ok(st.exp, 'study shows explanation after answering');
  ok(!/penalty/i.test(st.hintText), 'hint button does not promise a penalty that is never applied: ' + st.hintText);
  ok(st.hintShown && st.hintAfter === st.hintShown, 'hint stays visible after answering');
  await W(`submitExam()`); await p.waitForTimeout(200);
  const att = await W(`JSON.parse(localStorage.getItem('sy0701_attempts_v2')||'[]').slice(-1)[0]`);
  ok(att && att.mode === 'study' && att.total === 20, 'study attempt recorded');
  await W(`exitReviewMode&&exitReviewMode();restartExam()`);

  section('keyboard');
  await W(`_doLaunch({mode:'exam',variant:4,label:'Full Exam D'})`);
  await p.keyboard.press('ArrowRight'); ok(await W(`S.currentIdx`) === 1, 'ArrowRight next');
  await p.keyboard.press('f'); ok(await W(`S.flags.size`) === 1, 'F flags');
  const qt = await W(`S.questions[1].type`);
  if (qt === 'mcq-single') { await p.keyboard.press('1'); ok(await W(`S.answers[S.questions[1].id]===S.questions[1].options[0].id`), '1 picks first option'); }
  await p.keyboard.press('p'); ok(await W(`S.pauseStart!==null`), 'P pauses');
  await p.keyboard.press('ArrowRight'); ok(await W(`S.currentIdx`) === 1, 'no navigation while paused');
  await p.keyboard.press('p'); ok(await W(`S.pauseStart===null`), 'P resumes');
  await W(`openModal('modal-end')`); await p.keyboard.press('ArrowRight');
  ok(await W(`S.currentIdx`) === 1, 'arrow keys do not move the exam behind an open modal');
  await W(`closeModal('modal-end')`);

  section('snapshot + reload resume');
  await W(`S.answers[S.questions[0].id]=__oracle(S.questions[0]);goTo(5);togglePause();`);
  await p.waitForTimeout(1200);
  await W(`saveExamSnapshot()`);
  const before = await W(`({idx:S.currentIdx,t:S.timeRemaining,flags:S.flags.size,ans:Object.keys(S.answers).length,paused:S.pausedMs+(Date.now()-S.pauseStart)})`);
  p.removeAllListeners('dialog'); p.on('dialog', d => d.accept());
  await p.reload(); await p.waitForTimeout(600);
  await W(`location.hash='#/exam'`); await p.waitForTimeout(200);
  await W(`launchSession({mode:'exam',variant:1,label:'Full Exam A'})`); await p.waitForTimeout(100);
  ok(await W(`document.getElementById('modal-resume').classList.contains('open')`), 'resume modal after reload');
  await W(`resumeFromModal()`);
  const after = await W(`({idx:S.currentIdx,t:S.timeRemaining,flags:S.flags.size,ans:Object.keys(S.answers).length,label:S.sessionLabel,elapsed:Date.now()-S.startTime})`);
  ok(after.idx === before.idx && after.t === before.t && after.flags === before.flags && after.ans === before.ans && after.label === 'Full Exam D', 'resume restores state ' + JSON.stringify([before, after]));
  ok(after.elapsed < 1000, 'paused time is not billed as working time after resume (elapsed ' + after.elapsed + 'ms)');
  await W(`abandonLiveExam();S.endTime=Date.now();discardExamSnapshot();restartExam()`);

  section('results actions');
  const ra = await W(`(()=>{_doLaunch({mode:'exam',variant:2,label:'Full Exam B'});submitExam();
    retakeExam();const r={live:isExamLive(),label:S.sessionLabel,variant:S.examVariant,n:S.questions.length,t:S.timeRemaining};
    abandonLiveExam();S.endTime=Date.now();restartExam();
    _doLaunch({mode:'exam',timeLimit:1800,explain:false,label:'Domain 2 · Exam 1',launchOpts:{explicitIds:domainExamIds('2.0',1)}});submitExam();
    retakeExam();r.dl=S.sessionLabel;r.dn=S.questions.length;r.dt=S.timeRemaining;
    abandonLiveExam();S.endTime=Date.now();submitExam();backToDashboardFromReview();
    r.dash=document.getElementById('screen-dashboard').classList.contains('active');r.rm=S.reviewMode;return r;})()`);
  ok(ra.live && ra.label === 'Full Exam B' && ra.variant === 2 && ra.n === 90 && ra.t === 5400, 'Retake relaunches the same full form ' + JSON.stringify(ra));
  ok(ra.dl === 'Domain 2 · Exam 1' && ra.dn === 30 && ra.dt === 1800, 'Retake relaunches the same domain exam');
  ok(ra.dash && !ra.rm, 'Dashboard button leaves review and routes home');

  section('pass threshold consistency');
  const pr = await W(`(()=>{localStorage.setItem('sy0701_attempts_v2',JSON.stringify([{mode:'exam',at:Date.now(),key:'t1',total:90,correct:65,score:72,dur:3000,items:[]}]));
    location.hash='#/analytics';route();const t=document.getElementById('analytics-root').textContent;
    return {scaled:calcScaledScore(72),hundred:/100%/.test(t)};})()`);
  ok(pr.scaled >= 750 && pr.hundred, 'a raw-72 exam (scaled ' + pr.scaled + ') counts as a pass in analytics');
  await W(`localStorage.removeItem('sy0701_attempts_v2')`);

  section('XSS / escaping');
  const x = await W(`(()=>{const q={id:'xss1',type:'mcq-single',domain:'1.0',obj:'1.1',stem:'<img src=x onerror=window.__x=1> **bold**',options:[{id:'A',text:'<b>a</b>',correct:true},{id:'B',text:'b'}],explanation:'<script>x</script>'};
    S.mode='study';S.questions=[q];S.currentIdx=0;S.answers={xss1:'A'};S.showExplanations=true;S.reviewMode=false;renderQ();
    const r={img:!!document.querySelector('#content-area img'),bold:!!document.querySelector('#content-area .q-stem strong'),x:window.__x};S.questions=[];return r;})()`);
  ok(!x.img && x.bold && !x.x, 'stems escaped, **bold** formatted');

  section('routes: no errors and no horizontal overflow (desktop + phone)');
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await p.setViewportSize(vp);
    for (const h of ['#/', '#/exam', '#/study', '#/lab', '#/sy801', '#/review', '#/analytics', '#/settings']) {
      await W(`location.hash=${JSON.stringify(h)}`); await p.waitForTimeout(150);
      const ov = await p.evaluate(() => { const a = document.querySelector('.screen.active'); return a.scrollWidth - a.clientWidth; });
      ok(ov <= 1, `${h} @${vp.width}: horizontal overflow ${ov}px`);
    }
    await W(`_doLaunch({mode:'exam',variant:5,label:'Full Exam E'})`);
    for (let i = 0; i < 90; i++) {
      const isP = await W(`S.questions[${i}].type.startsWith('pbq')`);
      if (!isP && i % 15) continue;
      await W(`goTo(${i})`);
      const ov = await p.evaluate(() => { const c = document.getElementById('content-area'); return c.scrollWidth - c.clientWidth; });
      ok(ov <= 1, `exam item ${i + 1} @${vp.width}: horizontal overflow ${ov}px`);
    }
    await W(`abandonLiveExam();S.endTime=Date.now();restartExam()`);
  }

  ok(errs.length === 0, 'console errors: ' + errs.slice(0, 5).join(' | '));
  console.log(`whitebox: ${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
