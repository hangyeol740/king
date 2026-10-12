(() => {
  const dialog = document.querySelector('#result-dialog');
  let privateOwner = null;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function close() { if (dialog.open) dialog.close(); privateOwner = null; }
  function show(title, body, owner = null) {
    privateOwner = owner;
    dialog.querySelector('[data-result-title]').textContent = title;
    dialog.querySelector('[data-result-body]').innerHTML = body;
    if (!dialog.open) dialog.showModal();
  }
  function inspection(note, owner) {
    const d = note.details, groups = {};
    d.cardTypes.forEach(t => { groups[t] = (groups[t] || 0) + 1; });
    show(`${d.name}님의 손패 전체 확인`, `<p class="result-private">${esc(owner)}님에게만 공개 · ${d.day}일 차 확인 당시 ${d.cardTypes.length}장</p><div class="inspection-grid">${Object.entries(groups).map(([type, count]) => `<article class="inspection-card ${rules.cards[type].category}"><span>${rules.cards[type].icon}</span><h3>${esc(rules.cards[type].name)}</h3><strong>× ${count}</strong></article>`).join('') || '<p>손패가 없습니다.</p>'}</div>`, owner);
  }
  dialog.querySelector('[data-result-close]').addEventListener('click', close);
  dialog.addEventListener('close', () => { privateOwner = null; });
  window.kingdomResults = {
    close,
    inspection,
    personal(result) { const note = result?.notes?.find(n => n.details?.kind === 'hand'); if (note) inspection(note, result.owner); },
    handle(previous, next) {
      if (privateOwner && (previous?.me.id !== next.me.id || next.device && !next.device.active)) close();
      if (!previous || previous.code !== next.code) return;
      const execution = next.game?.lastExecution, beforeExecution = previous.game?.lastExecution;
      if (execution && execution.day !== beforeExecution?.day) {
        const victim = next.players.find(p => p.id === execution.target);
        show(victim ? `${victim.name}님이 처형되었습니다` : '동률 — 아무도 처형되지 않았습니다', `<p class="result-big-icon">${victim ? '†' : '⚖'}</p><p>${victim ? '교단·전도·영구 카드를 포함한 모든 카드가 몰수됩니다. 당일 아침·낮 행동은 금지되며 재분배는 자동 수락합니다.' : '최다 득표자가 여러 명이므로 처형하지 않습니다. 다음 날 사형 투표를 할 수 있습니다.'}</p><div class="result-tallies">${execution.tallies.map(t => `<p>${esc(next.players.find(p => p.id === t.id)?.name)} <b>${t.count}표</b></p>`).join('')}</div>`);
      }
      const expedition = next.game?.lastExpedition;
      if (expedition && expedition.day !== previous.game?.lastExpedition?.day && expedition.result) {
        show(`${expedition.difficulty === 'high' ? '상급' : '하급'} 원정 ${expedition.result === 'great' ? '대성공!' : expedition.result === 'success' ? '성공!' : '실패'}`, `<p class="result-score">${expedition.score}점</p><p>${expedition.reward ? `보상 카드 ${expedition.reward}장 지급` : expedition.difficulty === 'high' ? '반란군 제외 손패 몰수 · 보호되는 교단·전도카드는 유지' : '추가 페널티 없음'}</p>`);
      }
      if (previous.me.id && previous.me.id === next.me.id) {
        const known = new Set(previous.me.notes.map(n => n.id));
        const note = next.me.notes.find(n => !known.has(n.id) && n.details?.kind === 'hand');
        if (note) inspection(note, next.me.name);
      }
    }
  };
})();
