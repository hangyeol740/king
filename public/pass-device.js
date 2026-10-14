/* 공유 기기는 화면을 연 한 사람의 비공개 상태만 서버에서 받습니다. */
let deviceSeatChoice = null;
function deviceToolbar() {
  if (!state?.device) return '';
  return `<section class="device-toolbar"><div><b>한 기기로 ${state.device.players.length}명 참가</b><small>${state.device.active ? `${esc(state.me.name)}님의 화면` : '비공개 화면이 가려져 있습니다.'}</small></div>${state.status !== 'lobby' && state.device.active ? '<button class="secondary" data-cmd="lockSeat">화면 가리고 다음 사람에게 넘기기</button>' : ''}</section>`;
}
function localPlayerControls() {
  return `<section class="local-player-controls"><h3>오프라인 · 이 기기로 함께 참가하기</h3><p>다른 기기와 관전자는 참가할 수 없습니다. 게스트는 자동 이름이 배정됩니다.</p><label for="local-player-name">추가할 플레이어 이름 (로그인한 경우)</label><div><input id="local-player-name" maxlength="16" placeholder="이름 또는 게스트 자동 배정" autocomplete="off"><button class="secondary" data-ui="addLocalPlayer">플레이어 추가</button></div>${state.device ? `<p class="small">${state.device.players.map(p => `${esc(p.name)}${p.id!==state.host?` <button class="quiet" data-cmd="removeLocalPlayer" data-bot-target="${p.id}">삭제</button>`:''}`).join(' · ')}</p>` : ''}</section>`;
}
function renderDeviceGate() {
  const device = state.device, g = state.game, ended = state.status === 'finished';
  const ready = device.players.filter(p => ended || p.ready);
  const chosen = ready.find(p => p.id === deviceSeatChoice);
  if (!chosen) deviceSeatChoice = null;
  app.innerHTML = `${deviceToolbar()}<section class="handoff-panel"><span class="eyebrow">PASS THE DEVICE</span><div class="handoff-symbol">◈</div><h1>${ended ? '왕국의 이야기가 끝났습니다.' : '다음 사람에게 기기를 넘겨주세요.'}</h1><p>손패와 직업은 가려져 있습니다. 본인의 이름을 선택하고 확인한 뒤 화면을 여세요.${device.checkOnly ? ' 비공개 행동 단계에서는 직업과 지명 여부를 숨기기 위해 모든 이름을 표시합니다. 본인 역할·차례에 맞춰 확인하세요.' : ''}</p>${g ? `<p class="handoff-phase">${g.day}일 차 · ${phaseLabel(g.phase)}${g.current ? ` · 현재 차례 ${esc(nameOf(g.current))}` : ''}</p>` : ''}<div class="seat-grid">${ready.map(p => `<button class="seat-choice ${chosen?.id === p.id ? 'chosen' : ''}" data-ui="chooseSeat" data-seat="${p.id}"><strong>${esc(p.name)}</strong><span>${ended ? '종료 결과 확인' : device.checkOnly ? '비공개 행동 확인' : '행동할 차례'}</span></button>`).join('') || '<div class="waiting-box">이 기기의 참가자가 행동할 차례를 기다립니다.</div>'}</div>${chosen ? `<div class="seat-confirm"><h2>${esc(chosen.name)}님이 맞나요?</h2><p>다른 사람이 화면을 보지 않도록 확인하세요.</p><button class="primary full" data-cmd="openSeat" data-seat="${chosen.id}">네, ${esc(chosen.name)}입니다 · 내 화면 열기</button><button class="quiet" data-ui="cancelSeat">이름 다시 선택</button></div>` : ''}<div class="button-row">${ended && device.players.some(p => p.id === state.host) ? '<button class="primary" data-cmd="rematch">같은 사람들과 다시 준비</button>' : ''}<button class="quiet border" data-cmd="leave">이 기기 참가자 모두 방 나가기</button></div></section>${ended ? `<section class="major-result"><h2>${esc(g.winner.reason)}</h2></section>` : ''}${typeof renderMajorResults === 'function' ? renderMajorResults() : ''}<section class="panel public-device-journal"><h2>왕국의 공개 기록</h2>${(g?.logs || []).slice(-8).reverse().map(l => `<p>${esc(l.text)}</p>`).join('')}</section>`;
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-ui="chooseSeat"]');
 if(button&&state?.mode==='offline')command({type:'openSeat',player:button.dataset.seat});
});
