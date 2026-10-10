/* 서버가 보내는 본인용 상태만 렌더링합니다. 비밀 정보는 클라이언트에 없습니다. */
const $ = selector => document.querySelector(selector);
const app = $('#app');
const socket = io({ reconnection: true });
const STORAGE = 'kingdom.session.v1';
let state = null, rules = null, busy = false, replaced = false, actionMode = null, selected = new Set(), turnKey = '';
const labels = { king: '왕', citizen: '시민', rebel: '반란군', neutral: '중립' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nameOf = id => state.players.find(p => p.id === id)?.name || '플레이어';
function savedSession() { try { return JSON.parse(localStorage.getItem(STORAGE)); } catch { return null; } }
function toast(message) {
  $('#toast').textContent = message; $('#toast').classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('show'), 4200);
}
async function command(data) {
  if (busy) return false;
  if (!socket.connected) { toast('서버에 다시 연결하는 중입니다. 잠시 기다려주세요.'); return false; }
  busy = true; document.body.classList.add('busy');
  try {
    const result = await socket.timeout(15000).emitWithAck('command', data);
    if (!result.ok) { toast(result.error); return false; }
    if (result.session) localStorage.setItem(STORAGE, JSON.stringify(result.session));
    if (result.left) {
      localStorage.removeItem(STORAGE); state = null; selected.clear(); actionMode = null; render();
    }
    return true;
  } catch {
    toast('응답을 기다리지 못했습니다. 재연결 후 최신 상태를 확인합니다.');
    socket.disconnect(); socket.connect();
    return false;
  } finally { busy = false; document.body.classList.remove('busy'); }
}
socket.on('connect', async () => {
  $('#connection').innerHTML = '<i></i> 서버 연결됨'; $('#connection').classList.remove('offline');
  if (replaced) return;
  const session = savedSession();
  if (session) {
    try {
      const response = await socket.timeout(15000).emitWithAck('command', { type: 'resume', ...session });
      if (!response.ok) {
        state = null; localStorage.removeItem(STORAGE); render(); toast(response.error);
      }
    } catch { toast('방 복귀를 기다리고 있습니다. 연결이 복구되면 다시 시도합니다.'); socket.disconnect(); socket.connect(); }
  } else render();
});
socket.on('disconnect', () => {
  $('#connection').innerHTML = '<i></i> 재연결 중'; $('#connection').classList.add('offline');
});
socket.on('replaced', () => {
  replaced = true; state = null;
  app.innerHTML = '<section class="empty-screen"><span class="big-symbol">♛</span><h1>다른 창에서 접속했어요</h1><p>같은 플레이어의 자리는 가장 최근에 연결한 창에서 이어집니다.</p><button class="primary" onclick="location.reload()">이 창에서 다시 접속</button></section>';
});
socket.on('state', next => {
  const key = `${next.status}/${next.game?.day}/${next.game?.phase}/${next.game?.round}/${next.game?.current}/${next.game?.pending?.kind}/${next.game?.pending?.accepted}`;
  if (key !== turnKey) { selected.clear(); actionMode = null; turnKey = key; }
  state = next;
  const available = new Set(state.me.hand.map(c => c.id));
  selected = new Set([...selected].filter(id => available.has(id)));
  render();
});
fetch('/api/rules').then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => { rules = data; renderRules(); if (!replaced) render(); }).catch(() => toast('카드 정보를 불러오지 못했습니다. 새로고침해주세요.'));

function render() {
  if (replaced) return;
  if (!state) { renderHome(); return; }
  if (!rules) { app.innerHTML = '<div class="loading">카드 정보를 불러오는 중…</div>'; return; }
  if (state.status === 'lobby') renderLobby();
  else renderGame();
}
function renderHome() {
  const params = new URLSearchParams(location.search);
  app.innerHTML = `
    <section class="home-layout">
      <div class="hero">
        <div class="eyebrow"><span class="line"></span> A GAME OF CROWNS & CONSPIRACY</div>
        <h1>왕관을 지킬 것인가,<br><em>왕국을 뒤집을 것인가.</em></h1>
        <p class="hero-description">충성은 보이지 않고, 반란은 밤에 시작된다.<br>친구들과 함께하는 비밀 카드 전략 게임.</p>
        <div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-star s1">✦</span><span class="art-star s2">✧</span><div class="art-crown">♛</div><div class="art-land"></div><span class="art-caption">ONE CROWN. MANY INTENTIONS.</span></div>
        <div class="home-facts"><span><b>3명 이상</b> 함께 플레이</span><span><b>5–7일</b> 운명의 라운드</span><span><b>4개 진영</b> 하나의 왕국</span></div>
      </div>
      <div class="entry-panel">
        <span class="eyebrow">ENTER THE KINGDOM</span><h2>당신의 자리를 준비하세요.</h2><p class="muted">같은 방 코드로, 어디서든 함께.</p>
        <form id="entry-form">
          <label for="nickname">플레이어 이름</label><input id="nickname" name="name" maxlength="16" placeholder="왕국에서 사용할 닉네임" required autocomplete="nickname" value="${esc(localStorage.getItem('kingdom.nickname') || '')}">
          <button type="submit" name="entry" value="create" class="primary full">새로운 왕국 만들기 <span>→</span></button>
          <div class="divider"><span>또는 초대받은 왕국에 입장</span></div>
          <label for="room-code">방 코드</label><input id="room-code" name="code" maxlength="6" placeholder="6자리 코드 입력" class="code-input" value="${esc(params.get('room') || '')}" autocomplete="off">
          <button type="submit" name="entry" value="join" class="secondary full">코드로 참가하기 <span>↗</span></button>
        </form>
        <div class="entry-note"><span>◉</span><p>PC 브라우저 전용 · 대화는 디스코드로<br>새로고침해도 같은 브라우저에서 자리가 유지됩니다.</p></div>
      </div>
    </section>
    <footer class="home-footer"><span>왕국과 반란 <span class="dot">·</span> ONLINE TABLETOP</span><span>누구의 편에 설 것인가?</span></footer>`;
}
function renderLobby() {
  const isHost = state.host === state.me.id;
  const total = Object.values(state.config).reduce((a, b) => a + b, 0);
  const valid = state.players.length >= 3 && total === state.players.length && state.config.king === 1 && state.config.citizen >= 1 && state.config.rebel >= 1 && (state.players.length < 4 || state.config.neutral >= 1);
  app.innerHTML = `
    <section class="page-heading"><div><span class="eyebrow">THE GATHERING</span><h1>왕국의 개막을 기다리며<span class="heading-dot">.</span></h1><p class="muted">친구들을 초대하고, 진영을 준비하세요. 직업은 시작할 때 무작위로 배정됩니다.</p></div><button class="quiet border" data-cmd="leave">대기실 나가기 ↗</button></section>
    <div class="lobby-grid">
      <section class="panel lobby-players"><div class="panel-heading"><h2>모인 사람들</h2><span class="pill">${state.players.length}명 / 최소 3명</span></div>
        <div class="lobby-seats">${state.players.map((p, i) => `<div class="lobby-seat"><div class="avatar avatar-${i % 4}">${esc(p.name.slice(0, 1))}</div><div><b>${esc(p.name)} ${p.id === state.me.id ? '<span class="you-tag">나</span>' : ''}</b><small>${p.host ? '방장 · ' : ''}${p.online ? '플레이 준비 완료' : '재접속 대기 중'}</small></div><span class="status-dot ${p.online ? '' : 'offline'}"></span></div>`).join('')}
        ${state.players.length < 3 ? Array.from({ length: 3 - state.players.length }, () => '<div class="lobby-seat empty-seat"><div class="avatar">＋</div><span>친구를 기다리고 있어요</span></div>').join('') : ''}</div>
        <div class="invite-box"><div><span class="eyebrow">INVITE CODE</span><strong>${state.code}</strong></div><div><button class="secondary" data-ui="copyCode">코드 복사</button><button class="quiet" data-ui="copyLink">초대 링크 복사 ↗</button></div></div>
      </section>
      <section class="panel faction-settings"><span class="eyebrow">BALANCE OF POWER</span><h2>진영 구성</h2><p class="muted">왕은 한 명. 나머지 운명은 무작위.</p>
        <div class="role-settings">${Object.entries(labels).map(([role, label]) => `<div class="role-setting"><span class="role-symbol ${role}">${roleIcon(role)}</span><div><b>${label}</b><small>${roleDescription(role)}</small></div><input aria-label="${label} 인원" data-role-count="${role}" type="number" min="${role === 'king' ? 1 : 0}" max="${role === 'king' ? 1 : state.players.length}" value="${state.config[role]}" ${!isHost || role === 'king' || state.players.length <= 4 ? 'disabled' : ''}></div>`).join('')}</div>
        <p class="config-summary ${valid ? '' : 'warn'}">진영 합계 ${total}명 · 참가자 ${state.players.length}명${!valid ? ' — 인원과 필수 진영을 확인하세요.' : ''}</p>
        ${isHost ? `<button class="primary full" data-cmd="start" ${valid ? '' : 'disabled'}>왕국의 첫날 시작하기 <span>→</span></button>` : '<div class="waiting-box">방장이 게임을 시작하면 입장합니다.</div>'}
        <p class="small muted">${state.players.length >= 5 ? '방장은 5인부터 추가 인원의 진영을 조정할 수 있습니다.' : '3인: 왕·시민·반란군 / 4인: 중립 추가'}<br>중립은 현재 별도 능력과 승리 조건이 없습니다.</p>
      </section>
    </div>
    <div class="lobby-tip"><span>✦</span><div><b>말은 자유롭게, 카드는 비밀스럽게.</b><p>손패와 낮 행동은 다른 사람에게 공개되지 않습니다. 반란군끼리는 서로의 진영을 알아봅니다.</p></div><button class="quiet" data-ui="guide">규칙 둘러보기 ↗</button></div>`;
}
function roleIcon(role) { return { king: '♛', citizen: '♟', rebel: '⚑', neutral: '◇' }[role] || '?'; }
function roleDescription(role) { return { king: '왕국을 다스리는 단 한 사람', citizen: '왕과 함께 왕국을 지킨다', rebel: '3일의 반란으로 왕관을 무너뜨린다', neutral: '어느 편에도 속하지 않는다' }[role]; }
function phaseLabel(phase) {
  if (['morning', 'mediationSupport', 'mediationKing', 'expeditionJoin', 'expeditionCards', 'redistribute'].includes(phase)) return '아침';
  if (phase === 'day') return '낮'; if (['evening', 'tax'].includes(phase)) return '저녁'; if (phase === 'night') return '밤'; return '종료';
}
function renderGame() {
  const g = state.game, me = state.me, phase = phaseLabel(g.phase), ended = state.status === 'finished';
  const acting = g.current === me.id;
  app.innerHTML = `
    <div class="game-heading"><div><span class="eyebrow">KINGDOM <span class="dot">/</span> ${state.code}</span><h1>${ended ? '왕국의 이야기가 끝났습니다.' : `${g.day}일 차, ${phase}의 왕국`}</h1></div><div class="day-count"><strong>${String(g.day).padStart(2, '0')}</strong><span>/ ${String(g.maxDays).padStart(2, '0')}<small>DAY</small></span></div></div>
    <div class="game-layout">
      <div class="game-main">
        <div class="phase-track">${['아침', '낮', '저녁', '밤'].map((p, i) => `<div class="phase-step ${phase === p ? 'active' : ''}"><span class="phase-icon">${['☀', '◉', '◒', '☾'][i]}</span><span>${p}</span>${p === '낮' && g.phase === 'day' ? `<small>${g.round}/3 바퀴</small>` : ''}</div>`).join('')}<div class="rebellion-track"><span>반란 성공</span>${[1, 2, 3].map(n => `<i class="${g.successes >= n ? 'filled' : ''}"></i>`).join('')}<b>${g.successes}/3</b></div></div>
        <div class="table-players">${state.players.map(p => `<div class="table-player ${p.id === g.current && !ended ? 'active' : ''} ${p.id === me.id ? 'self' : ''}"><div class="player-top"><span class="avatar small-avatar ${p.role || 'hidden'}">${p.role ? roleIcon(p.role) : '?'}</span><span class="status-dot ${p.online ? '' : 'offline'}" title="${p.online ? '연결됨' : '재접속 대기'}"></span></div><strong>${esc(p.name)} ${p.id === me.id ? '<small>나</small>' : ''}</strong><span class="player-role ${p.role || ''}">${p.role ? labels[p.role] : '비공개 진영'}</span>${g.current === p.id && !ended ? '<span class="turn-indicator">현재 차례</span>' : ''}</div>`).join('')}</div>
        <section class="action-panel ${acting ? 'your-turn' : ''}"><div class="action-kicker"><span class="eyebrow">${ended ? 'THE FINAL CHAPTER' : acting ? 'YOUR MOVE' : 'THE KINGDOM MOVES'}</span>${g.revolt !== null && g.revolt > 0 ? `<span class="revolt-alert">⚑ 반란력 ${g.revolt}</span>` : ''}</div>${renderAction()}</section>
        ${ended ? '' : `<section class="hand-section"><div class="hand-heading"><div><span class="eyebrow">FOR YOUR EYES ONLY</span><h2>나의 손패 <span>${me.hand.length}</span></h2></div><div class="hand-tools">${selectionContext() ? '<button class="quiet" data-ui="selectAll">가능한 카드 모두 선택</button><button class="quiet" data-ui="clearSelection">선택 해제</button>' : '<span class="private-label">◈ 나에게만 공개</span>'}</div></div>${me.hand.length > 23 ? '<div class="hand-warning">손패가 23장을 초과했습니다. 다음 아침 재분배 단계에서 무작위로 22장까지 줄어듭니다.</div>' : ''}<div class="hand-grid">${renderHand()}</div>${selectionContext() ? renderSelectionSummary() : '<p class="hand-hint">행동에 사용할 카드는 해당 행동을 선택한 뒤 고를 수 있습니다.</p>'}</section>`}
      </div>
      <aside class="game-sidebar"><section class="panel identity-panel ${me.role}"><span class="eyebrow">YOUR ALLEGIANCE</span><div class="identity-title"><span>${roleIcon(me.role)}</span><h2>${labels[me.role]}</h2><span class="pill">${me.role === 'king' ? '공개' : '비공개'}</span></div><p>${me.role === 'rebel' ? '반란을 3일 성공시키세요.<br>동료 반란군의 진영은 서로 보입니다.' : me.role === 'neutral' ? '현재 중립의 고유 능력과<br>별도 승리 조건은 없습니다.' : '정해진 마지막 날까지<br>반란 성공을 2일 이하로 막으세요.'}</p></section>
        <section class="panel journal"><div class="panel-heading"><h2>왕국의 기록</h2><span class="live-label">PUBLIC</span></div><div class="journal-scroll">${[...g.logs].reverse().map(l => `<div class="journal-entry"><span>DAY ${l.day}</span><p>${esc(l.text)}</p></div>`).join('')}</div></section>
        <section class="panel personal-notes"><div class="panel-heading"><h2>나의 비밀 기록</h2><span class="live-label">PRIVATE</span></div><div class="notes-scroll">${[...me.notes].reverse().map(n => `<p>${esc(n.text)}</p>`).join('') || '<p class="muted">아직 기록이 없습니다.</p>'}</div></section>
        <div class="sidebar-foot">방 코드 <button class="quiet" data-ui="copyCode">${state.code} ⧉</button><span>대화는 디스코드에서</span></div>
      </aside>
    </div>`;
}
const btn = (type, title, sub, extra = '', cls = '') => `<button class="action-choice ${cls}" data-cmd="${type}" ${extra}><strong>${title}<span>↗</span></strong><small>${sub}</small></button>`;
function targetSelect(label = '대상 선택') {
  return `<label class="target-label">${label}<select id="target">${state.players.filter(p => p.id !== state.me.id).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>`;
}
function wait(title, description) { return `<h2>${esc(title)}</h2><p class="action-description">${description}</p><div class="wait-indicator"><i></i><i></i><i></i><span>다른 플레이어의 선택을 기다리고 있습니다.</span></div>`; }
function renderAction() {
  const g = state.game, p = g.pending, me = state.me, isKing = g.king === me.id;
  if (state.status === 'finished') {
    const won = g.winner.players.includes(me.id);
    return `<div class="victory-symbol">${won ? '♛' : '⚑'}</div><h2>${g.winner.side === 'royal' ? '왕과 시민의 승리' : g.winner.side === 'rebel' ? '반란군의 승리' : '중립의 승리'}</h2><p class="action-description">${esc(g.winner.reason)}</p><p class="outcome ${won ? 'won' : ''}">${won ? '당신의 진영이 왕국의 역사를 썼습니다.' : me.role === 'neutral' ? '중립의 여정이 끝났습니다.' : '다음 왕국에서는 운명이 달라질지도 모릅니다.'}</p><div class="button-row">${state.host === me.id ? '<button class="primary" data-cmd="rematch">같은 사람들과 다시 준비하기 →</button>' : '<span class="muted">방장이 다시 시작할 수 있습니다.</span>'}<button class="secondary" data-cmd="leave">방 나가기</button></div>`;
  }
  if (g.phase === 'morning') {
    if (!isKing) return wait('왕의 아침 결정을 기다립니다.', `${esc(nameOf(g.king))}님이 왕국의 오늘을 결정합니다.${g.revolt > 0 ? ` 공개된 반란력은 <b>${g.revolt}점</b>입니다.` : ''}`);
    return `<h2>폐하, 어떤 길을 택하시겠습니까?</h2><p class="action-description">${g.revolt > 0 ? `반란력 <b>${g.revolt}점</b>. 중재하지 않으면 반란 성공 1일이 기록되고 점수는 초기화됩니다.` : '발생한 반란이 없습니다. 원정 또는 공개처형을 선택하세요.'}</p><div class="action-choices">${btn('mediate', '반란 중재', '지원 후 왕이 제출 · 동점도 성공', g.revolt > 0 ? '' : 'disabled')}${btn('expedition', '원정', '11점 이상 성공 · 21점 이상 대성공')}${btn('execute', '공개처형', '지목한 사람의 손패를 전부 버림', state.players.length >= 4 ? 'data-target="true"' : 'disabled')}</div>${state.players.length >= 4 ? targetSelect('공개처형 대상') : ''}<p class="small muted">중재 선포와 확정한 카드 제출은 되돌릴 수 없습니다.</p>`;
  }
  if (g.phase === 'mediationSupport') {
    if (isKing || p.myDone) return wait(isKing ? '플레이어들의 지원을 기다립니다.' : '지원 선택을 확정했습니다.', `지원 카드는 왕의 손패로 가지 않고 즉시 중재에 사용됩니다.<br>지원자: ${p.supporters.length ? p.supporters.map(id => esc(nameOf(id))).join(', ') : '아직 없음'} · 지원 점수는 비교 전까지 비공개입니다.`);
    return `<h2>왕국에 힘을 보태겠습니까?</h2><p class="action-description">보병·장교·병기를 골라 지원하세요. 지원하지 않으려면 0장으로 확정하세요. 제출 후 취소할 수 없습니다.</p>${submitCards('contribute', '중재 지원 확정')}`;
  }
  if (g.phase === 'mediationKing') {
    if (!isKing) return wait('왕이 마지막 중재 카드를 냅니다.', `지원자: ${p.supporters.map(id => esc(nameOf(id))).join(', ') || '없음'}<br>모든 제출이 끝나면 총 중재력과 반란력을 비교합니다.`);
    return `<h2>폐하의 중재 카드를 제출하세요.</h2><p class="action-description">플레이어 지원이 끝났습니다. 보병·장교·병기를 제출하세요. 총 중재력이 반란력 <b>${g.revolt}</b> 이상이면 성공합니다. 실패해도 낸 카드는 소모됩니다.</p>${submitCards('contribute', '카드 확정 · 반란 판정')}`;
  }
  if (g.phase === 'expeditionJoin') {
    if (isKing || p.myDone) return wait('원정대를 모으고 있습니다.', '왕은 반드시 참가합니다. 다른 사람들은 자유롭게 참가를 결정합니다.');
    return `<h2>왕의 원정에 동행하시겠습니까?</h2><p class="action-description">성공하면 불참자를 포함한 전원이 보상을 받습니다. 참가를 확정한 뒤 공격 카드를 제출합니다.</p><div class="button-row"><button class="primary" data-cmd="joinExpedition" data-join="true">원정 참가</button><button class="secondary" data-cmd="joinExpedition" data-join="false">왕국에 남기</button></div>`;
  }
  if (g.phase === 'expeditionCards') {
    if (!p.participants.includes(me.id) || p.myDone) return wait('원정대가 힘을 모으고 있습니다.', `참가자: ${p.participants.map(id => esc(nameOf(id))).join(', ')}<br>다른 사람이 제출한 카드 종류와 수량은 공개되지 않습니다.`);
    return `<h2>원정에 사용할 카드를 고르세요.</h2><p class="action-description">공격 카드와 보병(1점)·장교(3점)를 사용할 수 있습니다. 합계 <b>11점 이상</b>이면 전원 4장, <b>21점 이상</b>이면 전원 9장. 영구 카드는 남습니다.</p>${submitCards('contribute', '원정 카드 확정')}`;
  }
  if (g.phase === 'redistribute') {
    if (p.myDone) return wait('재분배 결정을 마쳤습니다.', '당신의 수락·거절 여부는 다른 플레이어에게 공개되지 않습니다.');
    return `<h2>새로운 손패를 받으시겠습니까?</h2><p class="action-description">수락하면 기존 카드를 <b>모두 버리고 12장</b>을 새로 받습니다. 영구 카드도 교체됩니다. 거절하면 현재 손패를 유지합니다. 선택은 비공개입니다.</p><div class="button-row"><button class="primary" data-cmd="redistribute" data-accept="true">재분배 수락 · 새로 12장</button><button class="secondary" data-cmd="redistribute" data-accept="false">거절 · 현재 손패 유지</button></div>`;
  }
  if (g.phase === 'day') {
    if (p?.kind === 'trade') {
      const other = p.from === me.id ? p.to : p.from;
      if (!p.accepted) {
        if (p.to === me.id) return `<h2>${esc(nameOf(p.from))}님이 거래를 신청했습니다.</h2><p class="action-description">상대가 무엇을 몇 장 줄지는 교환 전까지 알 수 없습니다. 상대가 아무 카드도 주지 않을 수 있습니다.</p><div class="button-row"><button class="primary" data-cmd="tradeAnswer" data-accept="true">거래 수락</button><button class="secondary" data-cmd="tradeAnswer" data-accept="false">거절 · 상대 차례 종료</button></div>`;
        return wait('거래 응답을 기다립니다.', `${esc(nameOf(other))}님이 거절하면 이번 차례는 끝납니다.`);
      }
      if (p.myDone) return wait('내 거래 카드를 확정했습니다.', '상대방도 확정하면 동시에 교환합니다. 제출한 카드는 수정할 수 없습니다.');
      return `<h2>${esc(nameOf(other))}님에게 무엇을 주시겠습니까?</h2><p class="action-description">내가 줄 카드만 고르세요. <b>0장도 가능</b>합니다. 상대의 카드와 장수는 교환이 끝나야 알 수 있습니다.</p>${submitCards('tradeSubmit', '비공개 거래 카드 확정')}`;
    }
    if (g.current !== me.id) return wait(`${nameOf(g.current)}님의 차례입니다.`, `${g.round}번째 바퀴를 진행하고 있습니다. 선택한 행동과 카드 변화는 비공개입니다.`);
    if (g.round === 1) return `<h2>첫 번째 선택, 오늘의 준비.</h2><p class="action-description">거래·채집·카드받기 중 하나를 선택하세요. 행동은 다른 사람에게 공개되지 않습니다.</p><div class="action-choices">${btn('trade', '비밀 거래', '상대 응답 후 서로 비공개로 교환', 'data-target="true"')}${btn('gather', '채집', '자원 카드 4장 확정 획득')}${btn('draw3', '카드받기', '무작위 카드 3장 획득')}</div>${targetSelect('거래 신청 대상')}`;
    if (g.round === 2) {
      if (p?.kind === 'craft') return `<h2>필요한 만큼 제작하세요.</h2><p class="action-description">같은 차례에 반복·연속 제작할 수 있습니다. 영구 칼은 일반 칼 재료로 사용할 수 없습니다.</p><div class="recipes">${rules.recipes.map((r, i) => {
        const available = Math.floor(me.hand.filter(c => c.type === r.input).length / r.count);
        return `<div class="recipe"><span>${rules.cards[r.input].icon}</span><div><b>${rules.cards[r.input].name} ${r.count} → ${rules.cards[r.output].name} 1</b><small>현재 최대 ${available}개 제작 가능</small></div><input type="number" id="recipe-count-${i}" aria-label="${rules.cards[r.output].name} 제작 수량" value="1" min="1" max="${available || 1}" ${available ? '' : 'disabled'}><button class="secondary compact" data-cmd="craft" data-recipe="${i}" ${available ? '' : 'disabled'}>제작</button></div>`;
      }).join('')}</div><button class="primary" data-cmd="craftDone">제작 완료 · 다음 차례 →</button>`;
      if (actionMode === 'hunt') return `<h2>사냥에 나설 카드를 고르세요.</h2><p class="action-description">공격력 <b>6점 이상</b>이면 카드 4장을 받습니다. 보병·장교는 사용할 수 없습니다. 영구 카드는 소모되지 않습니다.</p>${submitCards('hunt', '사냥 실행')}<button class="quiet" data-ui="cancelMode">선택으로 돌아가기</button>`;
      return `<h2>두 번째 선택, 힘을 갖출 시간.</h2><p class="action-description">제작 또는 사냥을 선택하세요. 사냥은 한 번이며, 제작은 원하는 만큼 가능합니다.</p><div class="action-choices two">${btn('beginCraft', '제작', '재료를 바꿔 새 카드와 영구 장비 제작')}<button class="action-choice" data-ui="hunt"><strong>사냥<span>↗</span></strong><small>공격력 6점 이상 · 보상 카드 4장</small></button></div>`;
    }
    return `<h2>세 번째 선택, 손패와 정보.</h2><p class="action-description">네 가지 중 하나를 선택하세요. 확인한 정보는 당신에게만 보입니다.</p><div class="action-choices four">${btn('replace', '손패 전체 교체', `현재 ${me.hand.length}장을 버리고 같은 장수로 교체`)}${btn('draw2', '카드 2장 받기', '기존 손패에 무작위 2장 추가')}${btn('counts', '전체 손패 수 확인', '지금 순간의 모든 사람 손패 장수')}${btn('inspect', '타인 카드 1장 확인', '지목한 사람의 무작위 카드 1장', 'data-target="true"')}</div>${targetSelect('카드 확인 대상')}`;
  }
  if (g.phase === 'evening') {
    if (!isKing) return wait('왕이 저녁 정책을 선택합니다.', '세금신설·지명수배·시민지원 중 한 가지 정책이 시행됩니다.');
    return `<h2>왕국의 저녁 정책을 결정하세요.</h2><p class="action-description">${g.day === g.maxDays ? '마지막 저녁입니다. 정책 시행 후 승패가 결정됩니다.' : '정책 시행이 끝나면 밤이 시작됩니다.'}</p><div class="action-choices">${btn('tax', '세금신설', '왕을 제외한 전원에게 카드 2장씩 받기')}${btn('wanted', '지명수배', '반란·선동이 있으면 대상 손패 전부 버림', 'data-target="true"')}${btn('aid', '시민지원', '왕을 제외한 전원에게 새 카드 3장')}</div>${targetSelect('지명수배 대상')}`;
  }
  if (g.phase === 'tax') {
    if (p.myDone) return wait(isKing ? '세금 납부를 기다립니다.' : '세금을 납부했습니다.', '낼 카드는 각자 선택합니다. 카드 종류는 다른 사람에게 공개되지 않습니다.');
    return `<h2>왕에게 세금을 납부하세요.</h2><p class="action-description">카드 <b>${Math.min(2, me.hand.length)}장</b>을 선택하세요. 손패가 2장보다 적다면 전부 납부합니다. 영구 카드도 낼 수 있습니다.</p>${submitCards('payTax', '선택한 카드 납부')}`;
  }
  if (g.phase === 'night') {
    if (me.role !== 'rebel' || p.myDone) return wait('왕국이 잠든 밤.', '밤의 행동은 비공개입니다. 쌓인 반란점수는 다음 날 아침에 공개됩니다.');
    return `<h2>어둠 속에서 반란을 준비하세요.</h2><p class="action-description">반란·선동·병기를 원하는 만큼 제출하세요. 내지 않으려면 0장으로 확정하세요. 다른 반란군의 점수와 합산됩니다.</p>${submitCards('revolt', '밤의 반란 카드 확정')}`;
  }
  return '';
}
function selectionContext() {
  if (!state?.game || state.status !== 'playing' || !rules) return null;
  const g = state.game, p = g.pending, id = state.me.id;
  if ((g.phase === 'mediationSupport' && id !== g.king || g.phase === 'mediationKing' && id === g.king) && !p.myDone) return { allowed: t => !!rules.cards[t].mediation, stat: 'mediation', label: '내 중재력' };
  if (g.phase === 'expeditionCards' && p.participants.includes(id) && !p.myDone) return { allowed: t => !!(rules.cards[t].attack || rules.cards[t].expedition), stat: 'expedition', label: '내 원정 공격력' };
  if (g.phase === 'day' && p?.kind === 'trade' && p.accepted && !p.myDone) return { allowed: () => true, label: '줄 카드' };
  if (g.phase === 'day' && g.current === id && g.round === 2 && actionMode === 'hunt') return { allowed: t => !!rules.cards[t].attack, stat: 'attack', label: '사냥 공격력' };
  if (g.phase === 'tax' && !p.myDone) return { allowed: () => true, label: '세금 카드', exact: Math.min(2, state.me.hand.length) };
  if (g.phase === 'night' && state.me.role === 'rebel' && !p.myDone) return { allowed: t => !!rules.cards[t].revolt, stat: 'revolt', label: '내 반란력' };
  return null;
}
function cardStats(def) {
  return [def.attack ? `공격 ${def.attack}` : '', def.revolt ? `반란 ${def.revolt}` : '', def.mediation ? `중재 ${def.mediation}` : '', def.expedition ? `원정 ${def.expedition}` : '', def.permanent ? '영구 · 재사용' : '', def.instantWin ? '획득 즉시 승리' : ''].filter(Boolean);
}
function renderHand() {
  if (!state.me.hand.length) return '<div class="empty-hand"><span>◇</span><p>지금은 손패가 없습니다.<br><small>카드받기나 채집으로 다시 준비하세요.</small></p></div>';
  const context = selectionContext();
  return Object.entries(rules.cards).filter(([type]) => state.me.hand.some(c => c.type === type)).map(([type, def]) => {
    const cards = state.me.hand.filter(c => c.type === type), count = cards.filter(c => selected.has(c.id)).length;
    const allowed = context?.allowed(type);
    return `<div class="card ${def.category} ${count ? 'selected' : ''} ${context && !allowed ? 'unusable' : ''}"><div class="card-top"><span>${def.permanent ? 'PERMANENT' : 'KINGDOM'}</span><b>×${cards.length}</b></div><div class="card-symbol">${def.icon}</div><h3>${def.name}</h3><div class="card-stats">${cardStats(def).map(s => `<span>${s}</span>`).join('') || '<span>제작 재료</span>'}</div>${allowed ? `<div class="card-stepper"><button data-ui="minusCard" data-card="${type}" aria-label="${def.name} 선택 줄이기" ${count ? '' : 'disabled'}>−</button><span>${count} / ${cards.length}</span><button data-ui="plusCard" data-card="${type}" aria-label="${def.name} 선택 늘리기" ${count === cards.length ? 'disabled' : ''}>＋</button></div>` : `<div class="card-bottom">${def.chance ? `DRAW RATE ${def.chance}%` : def.instantWin ? 'LEGENDARY' : 'CRAFT ONLY'}</div>`}</div>`;
  }).join('');
}
function selectionScore() {
  const c = selectionContext();
  if (!c?.stat) return selected.size;
  return state.me.hand.filter(card => selected.has(card.id)).reduce((s, card) => {
    const d = rules.cards[card.type]; return s + (c.stat === 'expedition' ? d.attack || d.expedition || 0 : d[c.stat] || 0);
  }, 0);
}
function renderSelectionSummary() {
  const c = selectionContext();
  return `<div class="selection-summary"><span>선택한 카드 <b>${selected.size}장</b></span><span>${c.label} <b>${selectionScore()}${c.stat ? '점' : '장'}</b></span>${c.exact !== undefined ? `<span>필요한 카드 ${c.exact}장</span>` : ''}</div>`;
}
function submitCards(type, text) {
  const c = selectionContext(), disabled = c?.exact !== undefined && selected.size !== c.exact;
  return `<div class="card-submit-row"><div class="selected-preview">${selected.size}장 선택${c?.stat ? ` · ${c.label} ${selectionScore()}점` : ''}</div><button class="primary" data-cmd="${type}" data-cards="true" ${disabled ? 'disabled' : ''}>${text} →</button></div><p class="small muted">아래 손패의 ＋ / −로 카드를 고르세요. 확정한 제출은 취소할 수 없습니다.</p>`;
}

app.addEventListener('submit', async event => {
  if (event.target.id !== 'entry-form') return;
  event.preventDefault();
  const form = new FormData(event.target), type = event.submitter?.value || 'create', name = String(form.get('name')).trim();
  if (type === 'join' && !String(form.get('code')).trim()) { toast('초대받은 방 코드를 입력하세요.'); $('#room-code').focus(); return; }
  localStorage.setItem('kingdom.nickname', name);
  await command({ type, name, code: String(form.get('code')) });
});
app.addEventListener('change', async event => {
  if (!event.target.matches('[data-role-count]') || !state) return;
  const roles = { ...state.config };
  document.querySelectorAll('[data-role-count]').forEach(el => { roles[el.dataset.roleCount] = Number(el.value); });
  await command({ type: 'config', roles });
});
app.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button || button.disabled || busy) return;
  const ui = button.dataset.ui;
  if (ui) {
    if (ui === 'copyCode' || ui === 'copyLink') {
      const text = ui === 'copyCode' ? state.code : `${location.origin}/?room=${state.code}`;
      try { await navigator.clipboard.writeText(text); toast(ui === 'copyCode' ? '방 코드를 복사했습니다.' : '초대 링크를 복사했습니다.'); }
      catch { toast(`복사할 내용: ${text}`); }
    } else if (ui === 'guide') $('#rules').showModal();
    else if (ui === 'hunt') { actionMode = 'hunt'; selected.clear(); render(); }
    else if (ui === 'cancelMode') { actionMode = null; selected.clear(); render(); }
    else if (ui === 'clearSelection') { selected.clear(); render(); }
    else if (ui === 'selectAll') {
      const c = selectionContext();
      if (c) { const candidates = state.me.hand.filter(card => c.allowed(card.type)); selected = new Set(candidates.slice(0, c.exact ?? candidates.length).map(c => c.id)); render(); }
    } else if (ui === 'plusCard' || ui === 'minusCard') {
      const c = selectionContext(), type = button.dataset.card;
      if (!c?.allowed(type)) return;
      if (ui === 'plusCard') {
        if (c.exact !== undefined && selected.size >= c.exact) { toast(`${c.exact}장만 선택할 수 있습니다.`); return; }
        const card = state.me.hand.find(card => card.type === type && !selected.has(card.id)); if (card) selected.add(card.id);
      } else { const card = state.me.hand.find(card => card.type === type && selected.has(card.id)); if (card) selected.delete(card.id); }
      render();
    }
    return;
  }
  const type = button.dataset.cmd;
  if (!type) return;
  const data = { type };
  if (button.dataset.target) data.target = $('#target').value;
  if (button.dataset.cards) data.cards = [...selected];
  if (button.dataset.accept !== undefined) data.accept = button.dataset.accept === 'true';
  if (button.dataset.join !== undefined) data.join = button.dataset.join === 'true';
  if (button.dataset.recipe !== undefined) {
    data.recipe = Number(button.dataset.recipe); data.count = Number($(`#recipe-count-${data.recipe}`).value);
  }
  await command(data);
});
$('#rules-open').addEventListener('click', () => $('#rules').showModal());
$('#rules-close').addEventListener('click', () => $('#rules').close());
$('#rules').addEventListener('click', event => { if (event.target === $('#rules')) { const r = $('#rules').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('#rules').close(); } });
function renderRules() {
  $('#rules-content').innerHTML = `
    <div class="guide-banner">왕은 공개, 나머지 진영과 손패는 비밀. 반란군끼리는 서로를 압니다.</div>
    <h3>승리와 하루의 흐름</h3><p>3인은 7일, 4인은 6일, 5인 이상은 5일. 반란이 누적 3일 성공하면 즉시 반란군 승리. 마지막 저녁까지 2일 이하이면 왕·시민 승리. 마지막 날에는 밤이 없습니다. 중립은 현재 별도 승리 조건이 없습니다.</p>
    <div class="guide-phases"><div><b>☀ 아침</b><p>반란력 공개 → 왕의 중재 / 공개처형(4인 이상) / 원정 → 비공개 재분배. 첫날과 반란력 0인 날은 중재 불가.</p></div><div><b>◉ 낮</b><p>왕부터 고정 순서로 3바퀴. ① 거래 / 채집 / 3장 받기 ② 제작 / 사냥 ③ 전체 교체 / 2장 받기 / 손패 수 / 카드 1장 확인. 패스 버튼은 없습니다.</p></div><div><b>◒ 저녁</b><p>왕이 세금(각자 2장 납부) / 지명수배(반란·선동 발견 시 전부 버림) / 지원(왕 제외 전원 3장)을 선택.</p></div><div><b>☾ 밤</b><p>반란군이 반란·선동·병기를 비공개 제출. 다음 아침에 총 반란력만 공개. 0장 제출도 가능.</p></div></div>
    <h3>중재 · 사냥 · 원정</h3><p>중재는 선포 → 다른 플레이어들의 지원 → 왕의 제출 → 판정. 중재력이 반란력 이상이면 성공. 중재하지 않거나 실패하면 반란 성공 1일. 판정 후 반란력은 초기화됩니다. 선포와 제출은 취소 불가.</p><p>사냥은 공격력 6점 이상이면 본인에게 4장. 원정은 11점 이상이면 전원 4장, 21점 이상이면 전원 9장. 원정에만 보병 1점·장교 3점 사용 가능. 원정 왕 필참, 보상은 불참자도 지급.</p>
    <h3>손패 · 비밀 거래</h3><p>시작 카드 5장. 아침 재분배는 기존 손패 전부 버리고 12장 받기 또는 거절. 낮의 전체 교체는 기존 장수만큼 새로 받기. 23장을 초과한 손패는 다음 아침 재분배 선택 전에 무작위로 22장까지 줄어듭니다. 23장은 유지됩니다.</p><p>거래를 상대가 거절하면 차례 종료. 수락하면 양쪽이 줄 카드만 비공개로 선택하고 동시에 교환. 0장도 가능하며 교환 전에는 상대 카드 종류·장수가 보이지 않습니다. 낮 행동·평소 타인 손패 장수는 비공개입니다.</p>
    <h3>카드 도감</h3><div class="guide-card-list">${Object.values(rules.cards).map(c => `<div><span>${c.icon}</span><b>${c.name}</b><small>${c.chance}%</small><p>${cardStats(c).join(' · ') || '제작 재료'}</p></div>`).join('')}</div>
    <h3>제작법</h3><div class="guide-recipes">${rules.recipes.map(r => `<p>${rules.cards[r.input].name} ${r.count}장 <span>→</span> ${rules.cards[r.output].name} 1장</p>`).join('')}</div><p>반복·연속 제작 가능. 일반 카드는 모두 일회용. 영구 칼·영구 마법은 사냥·원정 한 번에 각각 한 번 사용하고 손패에 남습니다. 영구 칼은 일반 칼 제작 재료로 취급하지 않습니다. 영구 카드도 재분배·몰수·제작 재료 사용 시에는 사라집니다.</p><p class="small muted">철혈의 검은 가진 즉시 해당 진영 승리지만 획득 경로가 아직 정해지지 않아 현재는 나오지 않습니다. 중립 직업 능력도 추후 추가 예정입니다. 행동 시간 제한은 없습니다.</p>`;
}
render();
