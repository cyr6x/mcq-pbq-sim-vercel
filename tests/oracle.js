// Builds the full-credit answer for any question, from the item's own key.
window.__oracle = function (q) {
  switch (q.type) {
    case 'mcq-single': return (q.options.find(o => o.correct) || {}).id;
    case 'mcq-multi': return q.options.filter(o => o.correct).map(o => o.id);
    case 'pbq-firewall': { const a = {}; q.rules.filter(r => !r.locked).forEach(r => a[r.id] = r.correct); return a; }
    case 'pbq-log': return { attackType: q.correctAttack, attackerIP: q.attackerIP, remediation: q.correctRemediation, affectedAsset: q.correctAsset };
    case 'pbq-sequence': {
      const valid = q.items.filter(i => !i.invalid).sort((a, b) => (a.correctPosition ?? 0) - (b.correctPosition ?? 0)).map(i => i.id);
      const inv = (q.items.find(i => i.invalid) || {}).id;
      return inv ? { order: valid, invalidId: inv } : { order: valid, invalidPlaced: true };
    }
    case 'pbq-placement': { const a = {}; q.items.forEach(it => { (a[it.correct] = a[it.correct] || []).push(it.id); }); return a; }
    case 'pbq-compliance': { const a = {}; q.pairs.forEach(p => a[p.id] = p.correct); return a; }
    case 'pbq-vulnscan': {
      const rem = {}; q.findings.filter(f => !q.correctPriority.includes(f.id)).forEach(f => rem[f.id] = f.correctAction);
      return { priorityQueue: q.correctPriority.slice(), remediations: rem };
    }
    case 'pbq-crypto': { const a = {}; q.nodes.forEach(n => a[n.id] = n.correct); return a; }
    case 'pbq-terminal': case 'pbq-packet': { const a = {}; (q.tasks || []).forEach(t => a[t.id] = t.correct); return a; }
  }
  return null;
};
