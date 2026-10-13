/* 서버가 보내는 본인용 상태만 렌더링합니다. 비밀 정보는 클라이언트에 없습니다. */
const $ = selector => document.querySelector(selector);
const app = $('#app');
const socket = io({ reconnection: true });
const STORAGE = 'kingdom.session.v1';
const RETURN_STORAGE = 'kingdom.returnSession.v1';
let state = null, rules = null, busy = false, replaced = false, actionMode = null, selected = new Set(), turnKey = '';
let freshCards = new Set(), freshTimer;
let aiInfo = null;
let expeditionTargets = new Set();
let targetPlayer = null;
let acknowledgedThefts;
try { acknowledgedThefts = new Set(JSON.parse(localStorage.getItem('kingdom.theftAcknowledgements') || '[]')); } catch { acknowledgedThefts = new Set(); }
const labels = { king: '왕', citizen: '시민', rebel: '반란군', neutral: '중립' };
const religionCard = type => ['church', 'evangelism'].includes(type);
const protectedCard = type => state.me.job !== 'bishop' && religionCard(type);
const playerLabel = p => p.job ? `${labels[p.role]} · ${rules.neutralJobs?.[p.job] || p.job}` : labels[p.role];
const recipeLabel = r => r.job ? (rules.neutralJobs?.[r.job] || r.job) + ' 전용' : r.role ? labels[r.role] + ' 전용' : '공통';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nameOf = id => state.players.find(p => p.id === id)?.name || '플레이어';
function savedSession(key = STORAGE) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
const resumeCommand = session => ({ type: session.device ? 'resumeDevice' : 'resume', ...session });
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
    if (!result.ok) {
      toast(result.error);
      if (['resume', 'resumeDevice'].includes(data.type) && !state) { localStorage.removeItem(RETURN_STORAGE); render(); }
      return false;
    }
    if (result.session) {
      localStorage.setItem(STORAGE, JSON.stringify(result.session));
      if (['resume', 'resumeDevice'].includes(data.type)) localStorage.removeItem(RETURN_STORAGE);
    }
    if (result.left) {
      if (result.resumeSession) localStorage.setItem(RETURN_STORAGE, JSON.stringify(result.resumeSession));
      localStorage.removeItem(STORAGE); state = null; selected.clear(); actionMode = null; freshCards.clear();
      window.kingdomEffects.handle(null, {status:'lobby'}); render();
      if (result.resumeSession) toast('홈으로 이동했습니다. 자리는 유지되며, 홈에서 원래 방으로 돌아갈 수 있습니다.');
    }
    if (result.personalResult) window.kingdomResults?.personal(result.personalResult);
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
      const response = await socket.timeout(15000).emitWithAck('command', resumeCommand(session));
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
  next = { ...next, neutralJobs: next.neutralJobs || [], game: next.game ? { shop: null, religiousRevolt: null, religiousSuccesses: 0, religiousGoal: next.players.length === 4 ? 1 : next.players.length === 5 ? 2 : 3, ...next.game } : null };
  const previous = state;
  const changedIdentity = previous?.me.id !== next.me.id;
  if (next.device && changedIdentity) { $('#rules').close?.(); if (typeof deviceSeatChoice !== 'undefined') deviceSeatChoice = null; }
  if (previous?.code === next.code && !changedIdentity) {
    const oldCards = new Set(previous.me.hand.map(c => c.id));
    const added = next.me.hand.filter(c => !oldCards.has(c.id));
    if (added.length) {
      freshCards = new Set(added.map(c => c.id));
      clearTimeout(freshTimer);
      freshTimer = setTimeout(() => {
        freshCards.clear();
        document.querySelectorAll('.card.new-card').forEach(el => {
          el.classList.remove('new-card');
          el.querySelector('.card-top>span').textContent = el.classList.contains('eternal') ? 'PERMANENT' : 'KINGDOM';
        });
      }, 6000);
    }
  } else freshCards.clear();
  const key = `${next.me.id}/${next.status}/${next.game?.day}/${next.game?.phase}/${next.game?.round}/${next.game?.current}/${next.game?.pending?.kind}/${next.game?.pending?.accepted}`;
  if (key !== turnKey) { selected.clear(); expeditionTargets.clear(); targetPlayer = null; actionMode = null; turnKey = key; }
  if (typeof shopStockId !== 'undefined' && (changedIdentity || !next.game?.shop?.some(item => item.id === shopStockId))) { shopStockId = null; shopQuantity = 1; }
  if (typeof shopStockId !== 'undefined' && shopStockId) shopQuantity = Math.min(shopQuantity,next.game.shop.find(item=>item.id===shopStockId).quantity);
  state = next;
  const available = new Set(state.me.hand.map(c => c.id));
  selected = new Set([...selected].filter(id => available.has(id)));
  render();
  window.kingdomEffects.handle(next.device && changedIdentity ? null : previous, next);
  window.kingdomResults?.handle(previous, next);
});
fetch('/api/rules', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => { rules = { ...data, neutralJobs: data.neutralJobs || {} }; renderRules(); if (!replaced) render(); }).catch(() => toast('카드 정보를 불러오지 못했습니다. 새로고침해주세요.'));
fetch('/api/ai').then(r => r.json()).then(data => { aiInfo = data; if (state?.status === 'lobby') render(); }).catch(() => { aiInfo = { available: false }; });

function render() {
  if (replaced) return;
  if(rules)renderRules();
  if (!state) { renderHome(); return; }
  if (!rules) { app.innerHTML = '<div class="loading">카드 정보를 불러오는 중…</div>'; return; }
  if (state.device && state.status !== 'lobby' && !state.device.active) {
    if (typeof renderDeviceGate === 'function') renderDeviceGate();
    else app.innerHTML = '<div class="loading">공유 기기 화면을 불러오지 못했습니다. 새로고침해주세요.</div>';
    return;
  }
  if (state.status === 'lobby') renderLobby();
  else renderGame();
}
function renderHome() {
  const params = new URLSearchParams(location.search);
  const returnSession = savedSession(RETURN_STORAGE);
  app.innerHTML = `
    <section class="home-layout">
      <div class="hero">
        <div class="eyebrow"><span class="line"></span> A GAME OF CROWNS & CONSPIRACY</div>
        <h1>왕관을 지킬 것인가,<br><em>왕국을 뒤집을 것인가.</em></h1>
        <p class="hero-description">충성은 보이지 않고, 반란은 밤에 시작된다.<br>친구들과 함께하는 비밀 카드 전략 게임.</p>
        <div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-star s1">✦</span><span class="art-star s2">✧</span><div class="art-crown">♛</div><div class="art-land"></div><span class="art-caption">ONE CROWN. MANY INTENTIONS.</span></div>
        <div class="home-facts"><span><b>3명 이상</b> 함께 플레이</span><span><b>6–10일</b> 운명의 라운드</span><span><b>4개 진영</b> 하나의 왕국</span></div>
      </div>
      <div class="entry-panel">
        <span class="eyebrow">ENTER THE KINGDOM</span><h2>당신의 자리를 준비하세요.</h2><p class="muted">같은 방 코드로, 어디서든 함께.</p>
        ${returnSession ? `<div class="return-room"><strong>이전 방 ${esc(returnSession.code)}</strong><p>직업과 손패가 유지됩니다. 본인 차례에는 복귀를 기다립니다.</p><button class="secondary full" data-ui="returnRoom">원래 방으로 돌아가기 →</button></div>` : ''}
        <form id="entry-form">
          <label for="nickname">플레이어 이름</label><input id="nickname" name="name" maxlength="16" placeholder="왕국에서 사용할 닉네임" required autocomplete="nickname" value="${esc(localStorage.getItem('kingdom.nickname') || '')}">
          <button type="submit" name="entry" value="create" class="primary full">새로운 왕국 만들기 <span>→</span></button>
          <div class="divider"><span>또는 초대받은 왕국에 입장</span></div>
          <label for="room-code">방 코드</label><input id="room-code" name="code" maxlength="6" placeholder="6자리 코드 입력" class="code-input" value="${esc(params.get('room') || '')}" autocomplete="off">
          <button type="submit" name="entry" value="join" class="secondary full">코드로 참가하기 <span>↗</span></button>
        </form>
        <div class="entry-note"><span>◉</span><p>폰·PC 모두 플레이 가능 · 대화는 자유롭게<br>한 기기로 여러 명: 방 참가 → 이 기기의 플레이어 추가<br>혼자 플레이: 방 만들기 → AI 추가 2명 → 시작</p></div>
      </div>
    </section>
    <footer class="home-footer"><span>왕국과 반란 <span class="dot">·</span> ONLINE TABLETOP</span><span>누구의 편에 설 것인가?</span></footer>`;
}
function renderLobby() {
  const isHost = state.host === state.me.id;
  const total = Object.values(state.config).reduce((a, b) => a + b, 0);
  const neutralLimit = state.players.length === 5 && Object.keys(rules.neutralJobs || {}).length < 2 ? 1 : state.players.length;
  const valid = state.players.length >= 3 && total === state.players.length && state.config.king === 1 && state.config.citizen >= 1 && state.config.rebel >= 1 && state.config.neutral <= neutralLimit && (state.players.length < 4 || state.config.neutral >= 1);
  app.innerHTML = `
    <section class="page-heading"><div><span class="eyebrow">THE GATHERING</span><h1>왕국의 개막을 기다리며<span class="heading-dot">.</span></h1><p class="muted">친구들을 초대하고, 진영을 준비하세요. 직업은 시작할 때 무작위로 배정됩니다.</p></div><button class="quiet border" data-cmd="leave">대기실 나가기 ↗</button></section>
    <div class="lobby-grid">
      <section class="panel lobby-players"><div class="panel-heading"><h2>모인 사람들</h2><span class="pill">${state.players.length}명 / 최소 3명</span></div>
        <div class="ai-controls"><div><b>강화학습 AI와 함께 플레이</b><p>${aiInfo?.available ? `PPO 셀프플레이 ${Number(aiInfo.episodes).toLocaleString()}판 학습 · 서버에서 자동 판단` : aiInfo ? '학습 모델이 없습니다. models/policy.json을 서버에 포함하세요.' : 'AI 모델을 확인하는 중…'}</p></div>${isHost ? `<button class="secondary compact" data-cmd="addBot" ${aiInfo?.available && state.players.filter(p => p.bot).length < 8 ? '' : 'disabled'}>AI 추가 ＋</button>` : ''}</div>
        <div class="lobby-seats">${state.players.map((p, i) => `<div class="lobby-seat"><div class="avatar avatar-${i % 4}">${p.bot ? '⚙' : esc(p.name.slice(0, 1))}</div><div><b>${esc(p.name)} ${p.id === state.me.id ? '<span class="you-tag">나</span>' : ''}</b><small>${p.bot ? '학습된 신경망 · 자동 플레이' : `${p.host ? '방장 · ' : ''}${p.online ? '플레이 준비 완료' : '재접속 대기 중'}`}</small></div>${p.bot && isHost ? `<button class="quiet remove-bot" data-cmd="removeBot" data-bot-target="${p.id}" aria-label="${esc(p.name)} 제거">✕</button>` : `<span class="status-dot ${p.online ? '' : 'offline'}"></span>`}</div>`).join('')}
        ${state.players.length < 3 ? Array.from({ length: 3 - state.players.length }, () => '<div class="lobby-seat empty-seat"><div class="avatar">＋</div><span>친구를 기다리고 있어요</span></div>').join('') : ''}</div>
        <div class="invite-box"><div><span class="eyebrow">INVITE CODE</span><strong>${state.code}</strong></div><div><button class="secondary" data-ui="copyCode">코드 복사</button><button class="quiet" data-ui="copyLink">초대 링크 복사 ↗</button></div></div>
        ${typeof localPlayerControls === 'function' ? localPlayerControls() : ''}
      </section>
      <section class="panel faction-settings"><span class="eyebrow">BALANCE OF POWER</span><h2>진영 구성</h2><p class="muted">왕은 한 명. 나머지 운명은 무작위.</p>
        <div class="role-settings">${Object.entries(labels).map(([role, label]) => `<div class="role-setting"><span class="role-symbol ${role}">${roleIcon(role)}</span><div><b>${label}</b><small>${roleDescription(role)}</small></div><input aria-label="${label} 인원" data-role-count="${role}" type="number" min="${role === 'king' ? 1 : 0}" max="${role === 'king' ? 1 : state.players.length}" value="${state.config[role]}" ${!isHost || role === 'king' || state.players.length <= 4 ? 'disabled' : ''}></div>`).join('')}</div>
        <p class="config-summary ${valid ? '' : 'warn'}">진영 합계 ${total}명 · 참가자 ${state.players.length}명${!valid ? ' — 인원과 필수 진영을 확인하세요.' : ''}</p>
        ${isHost ? `<button class="primary full" data-cmd="start" ${valid ? '' : 'disabled'}>왕국의 첫날 시작하기 <span>→</span></button>` : '<div class="waiting-box">방장이 게임을 시작하면 입장합니다.</div>'}
        <div class="neutral-job-settings"><h3>중립 직업 선택</h3><p class="small muted">선택한 직업 중 무작위 배정 · 같은 직업은 최대 1명. 선택한 직업보다 중립 인원이 많으면 나머지는 일반 중립입니다.</p>${Object.entries(rules.neutralJobs || {}).map(([job, label]) => `<label><input type="checkbox" data-neutral-job="${job}" ${(state.neutralJobs || []).includes(job) ? 'checked' : ''} ${!isHost || state.players.length < 4 ? 'disabled' : ''}> ${label}</label>`).join('')}</div>
        <p class="small muted">${state.players.length >= 5 ? '5인의 추가 자리는 시민·반란군·중립 중 선택 가능합니다. 주교·상인 직업은 중복 배정되지 않습니다.' : '3인: 왕·시민·반란군 / 4인: 중립 추가'}<br>3인 게임에는 중립 직업이 없습니다.</p>
      </section>
    </div>
    <div class="lobby-tip"><span>✦</span><div><b>말은 자유롭게, 카드는 비밀스럽게.</b><p>손패와 낮 행동은 다른 사람에게 공개되지 않습니다. 반란군끼리는 서로의 진영을 알아봅니다.</p></div><button class="quiet" data-ui="guide">규칙 둘러보기 ↗</button></div>`;
}
function roleIcon(role) { return { king: '♛', citizen: '♟', rebel: '⚑', neutral: '◇' }[role] || '?'; }
function roleDescription(role) { return { king: '왕국을 다스리는 단 한 사람', citizen: '왕과 함께 왕국을 지킨다', rebel: '인원별 반란 목표를 달성한다', neutral: '어느 편에도 속하지 않는다' }[role]; }
function phaseLabel(phase) {
  if (['morning', 'executionVote', 'mediationSupport', 'mediationKing', 'expeditionVote', 'expeditionSelect', 'expeditionJoin', 'expeditionCards', 'redistribute'].includes(phase)) return '아침';
   if (['day','market'].includes(phase)) return '낮'; if (['evening', 'tax','merchantEvening'].includes(phase)) return '저녁'; if (['night', 'bishopNight'].includes(phase)) return '밤'; return '종료';
}
function renderGame() {
  const g = state.game, me = state.me, phase = phaseLabel(g.phase), ended = state.status === 'finished';
  const acting = g.current === me.id || (g.phase === 'morning' && g.king === me.id) || (g.phase === 'executionVote' && !g.pending.myDone);
  app.innerHTML = `
    ${typeof deviceToolbar === 'function' ? deviceToolbar() : ''}
    <div class="game-heading"><div><span class="eyebrow">KINGDOM <span class="dot">/</span> ${state.code}</span><h1>${ended ? '왕국의 이야기가 끝났습니다.' : `${g.day}일 차, ${phase}의 왕국`}</h1></div><div class="game-heading-actions"><button class="quiet border" data-cmd="leave">방 나가기 ↗</button><div class="day-count"><strong>${String(g.day).padStart(2, '0')}</strong><span>/ ${String(g.maxDays).padStart(2, '0')}<small>DAY</small></span></div></div></div>
    <div class="game-layout">
      <div class="game-main">
        <div class="phase-track">${['아침', '낮', '저녁', '밤'].map((p, i) => `<div class="phase-step ${phase === p ? 'active' : ''}"><span class="phase-icon">${['☀', '◉', '◒', '☾'][i]}</span><span>${p}</span>${p === '낮' && g.phase === 'day' ? `<small>${g.round}/3 바퀴</small>` : ''}</div>`).join('')}<div class="score-tracks">${state.neutralJobs.includes('bishop') ? `<div class="rebellion-track religion-track"><span>✝ 종교반란 성공</span>${Array.from({length:g.religiousGoal},(_,i)=>i+1).map(n => `<i class="${g.religiousSuccesses >= n ? 'filled' : ''}"></i>`).join('')}<b>${g.religiousSuccesses}/${g.religiousGoal}</b></div>` : ''}<div class="rebellion-track"><span>반란 성공</span>${Array.from({length:g.revoltGoal},(_,i)=>i+1).map(n => `<i class="${g.successes >= n ? 'filled' : ''}"></i>`).join('')}<b>${g.successes}/${g.revoltGoal}</b></div></div></div>
        ${renderRevoltBanner()}
        ${renderReligiousBanner()}
        ${renderTheftAlert()}
        ${renderMajorResults()}
        <div class="table-players">${state.players.map(p => `<div class="table-player ${p.id === g.current && !ended ? 'active' : ''} ${p.id === me.id ? 'self' : ''}"><div class="player-top"><span class="avatar small-avatar ${p.role || 'hidden'}">${p.job === 'bishop' ? '✝' : p.role ? roleIcon(p.role) : '?'}</span><span class="status-dot ${p.online ? '' : 'offline'}" title="${p.online ? '연결됨' : '재접속 대기'}"></span></div><strong>${esc(p.name)} ${p.id === me.id ? '<small>나</small>' : ''}</strong><span class="player-role ${p.role || ''}">${p.role ? playerLabel(p) : '비공개 진영'}</span>${g.current === p.id && !ended ? '<span class="turn-indicator">현재 차례</span>' : ''}</div>`).join('')}</div>
        <section class="action-panel ${acting ? 'your-turn' : ''}"><div class="action-kicker"><span class="eyebrow">${ended ? 'THE FINAL CHAPTER' : acting ? 'YOUR MOVE' : 'THE KINGDOM MOVES'}</span>${g.revolt !== null && g.revolt > 0 ? `<span class="revolt-alert">⚑ 반란력 ${g.revolt}</span>` : ''}</div>${renderAssistance()}${renderAction()}</section>
        <section class="hand-section"><div class="hand-heading"><div><span class="eyebrow">FOR YOUR EYES ONLY</span><h2>${ended ? '종료 시 나의 손패' : '나의 손패'} <span>${me.hand.length}</span></h2></div><div class="hand-tools">${selectionContext() ? '<button class="quiet" data-ui="selectAll">가능한 카드 모두 선택</button><button class="quiet" data-ui="clearSelection">선택 해제</button>' : '<span class="private-label">◈ 나에게만 공개</span>'}</div></div>${me.hand.length > 30 && !ended ? '<div class="hand-warning">다음 아침에 30장까지 줄어듭니다. 자원 → 나머지 일반 카드 → 보호되는 교단·전도 순서로 버립니다.</div>' : ''}<div class="hand-grid">${renderHand()}</div>${selectionContext() ? renderSelectionSummary() : '<p class="hand-hint">행동에 사용할 카드는 해당 행동을 선택한 뒤 고를 수 있습니다.</p>'}</section>
        <section class="recipe-reference"><h2>나의 제작법 <span>${myRecipes().length}종</span></h2><p class="small muted">공통 제작과 본인 진영·직업의 특수 제작만 표시합니다.</p><div class="guide-recipes">${myRecipes().map(r => `<p><b>${recipeLabel(r)}</b> · ${recipeMaterials(r)} <span>→</span> ${rules.cards[r.output].name} ${r.amount || 1}장</p>`).join('')}</div><p class="small muted">화염대검 + 북부의 검 → 철혈의 검 · 두 검의 재료는 영구 칼·영구 마법이며 제작 시 소모됩니다.</p></section>
      </div>
      <aside class="game-sidebar"><section class="panel identity-panel ${me.role}"><span class="eyebrow">YOUR ALLEGIANCE</span><div class="identity-title"><span>${me.job === 'merchant' ? '◆' : me.job === 'bishop' ? '✝' : roleIcon(me.role)}</span><h2>${playerLabel(me)}</h2><span class="pill">${me.role === 'king' ? '공개' : '비공개'}</span></div><p>${me.job === 'merchant' ? '돈 100점을 모으면 승리합니다.<br>비밀거래 불가 · 원정 자동 0장 · 돈으로 중재.' : me.job === 'bishop' ? `종교반란을 ${g.religiousGoal}일 성공시키세요.<br>반란군 행동 후 밤 행동이 가능합니다.` : me.role === 'rebel' ? `반란을 ${g.revoltGoal}일 성공시키세요.<br>동료 반란군의 진영은 서로 보입니다.` : me.role === 'neutral' ? '철혈의 검 획득으로 승리하세요.' : `마지막 날까지 일반 반란 ${g.revoltGoal}일${state.neutralJobs.includes('bishop') ? `,<br>종교반란 ${g.religiousGoal}일` : ''} 성공을 막으세요.`}</p>${me.job === 'bishop' ? `<div class="influence-counter"><span>교단영향력 · 나에게만 공개</span><strong>${me.churchInfluence}점</strong></div>` : me.job==='merchant'?`<div class="money-counter"><span>나에게만 공개 · 보유 돈</span><strong>${me.money} / 100점</strong></div>`:''}</section>
        <section class="panel journal"><div class="panel-heading"><h2>왕국의 기록</h2><span class="live-label">PUBLIC</span></div><div class="journal-scroll">${[...g.logs].reverse().map(l => `<div class="journal-entry"><span>DAY ${l.day}</span><p>${esc(l.text)}</p></div>`).join('')}</div></section>
        <section class="panel personal-notes"><div class="panel-heading"><h2>나의 비밀 기록</h2><span class="live-label">PRIVATE</span></div><div class="notes-scroll">${[...me.notes].reverse().map(renderNote).join('') || '<p class="muted">아직 기록이 없습니다.</p>'}</div></section>
        <div class="sidebar-foot">방 코드 <button class="quiet" data-ui="copyCode">${state.code} ⧉</button><span>대화는 디스코드에서</span></div>
      </aside>
    </div>`;
}
function renderRevoltBanner() {
  const g = state.game;
  if (g.revolt !== null) return `<section class="revolt-banner ${g.revolt ? 'danger' : 'peace'}" aria-label="아침 반란점수"><div class="revolt-emblem">${g.revolt ? '⚑' : '☀'}</div><div><span class="eyebrow">DAY ${g.day} · MORNING REPORT</span><h2>${g.revolt ? '밤사이 반란이 일어났습니다' : '발생한 반란이 없습니다'}</h2><p>${g.revolt ? '이 점수 이상의 중재력이 필요합니다. 동점이면 방어 성공.' : '왕이 오늘의 아침 행동을 선택합니다.'}</p></div><div class="revolt-number"><strong>${g.revolt}</strong><span>반란점수</span></div></section>`;
  const result = g.lastRevolt;
  if (result?.day !== g.day) return '';
  return `<section class="revolt-result ${result.blocked ? 'blocked' : 'breached'}"><span>${result.blocked ? '♜' : '⚑'}</span><div><h2>${result.blocked ? '반란을 막았습니다!' : '반란을 막지 못했습니다!'}</h2><p>반란력 ${result.revolt} · ${result.strength === null ? '중재 미선택' : `중재력 ${result.strength}`} · 지원 ${result.helperCount || 0}명(왕 제외) · 반란 성공 누적 ${g.successes}/${g.revoltGoal}일${result.bombs ? ` · 폭탄 ${result.bombs}장 ${result.blocked ? '폭발 저지' : '폭발 — 왕·시민 손패 몰수'}` : ''}</p></div></section>`;
}
function renderTheftAlert() {
  const unread=state.me.notes.filter(n=>n.effect==='stolen'&&!acknowledgedThefts.has(n.id));
  if(!unread.length)return '';
  const count=unread.reduce((s,n)=>s+(n.details?.count||0),0);
  return `<section class="theft-alert" role="alert"><span>⚑</span><div><h2>카드 ${count}장을 빼앗겼습니다!</h2><p>미확인 도난 알림 ${unread.length}건 · 손패와 비밀 기록을 확인하세요.</p></div><button class="secondary" data-ui="acknowledgeTheft">확인</button></section>`;
}
function renderReligiousBanner() {
  const g = state.game;
  if (g.religiousRevolt !== null) return `<section class="revolt-banner religion-report"><div class="revolt-emblem">✝</div><div><span class="eyebrow">RELIGIOUS REBELLION</span><h2>종교반란이 일어났습니다</h2><p>동점 이상이면 방어 성공. 교단·전도카드는 사용할 수 없습니다.${g.revolt > 0 ? ' 왕은 두 반란 중 하나만 중재할 수 있습니다.' : ''}</p></div><div class="revolt-number"><strong>${g.religiousRevolt}</strong><span>종교반란력</span></div></section>`;
  const result = g.lastReligiousRevolt;
  if (result?.day !== g.day) return '';
  return `<section class="revolt-result ${result.blocked ? 'blocked' : 'breached'}"><span>✝</span><div><h2>${result.blocked ? '종교반란을 막았습니다!' : '종교반란 성공!'}</h2><p>종교반란력 ${result.revolt} · ${result.strength === null ? '중재 미선택' : `중재력 ${result.strength}`} · 종교반란 성공 누적 ${g.religiousSuccesses}/${g.religiousGoal}일</p></div></section>`;
}
function renderAssistance() {
  const g=state.game,p=g.pending;
  if(['mediationSupport','mediationKing'].includes(g.phase))return `<div class="assistance-counter"><b>중재 지원 ${p.helperCount || 0}명</b><span>왕 제외 · 카드 또는 돈으로 지원한 사람</span></div>`;
  if(g.phase==='expeditionCards')return `<div class="assistance-counter"><b>원정 카드 제출 ${p.contributorCount || 0}명</b><span>왕 포함 · 0장 제출 제외 · 참가자 ${p.participantCount}명</span></div>`;
  if(g.lastExpedition?.day===g.day)return `<div class="assistance-counter"><b>원정 카드 제출 ${g.lastExpedition.contributorCount}명</b><span>참가자 ${g.lastExpedition.participantCount}명 · 카드 종류·수량은 비공개</span></div>`;
  return '';
}
function renderNote(n) {
  if (n.details?.kind !== 'hand') return `<p>${esc(n.text)}</p>`;
  const d=n.details, groups={}; d.cardTypes.forEach(t=>{groups[t]=(groups[t]||0)+1;});
  return `<div class="private-inspection"><p>${esc(d.name)} · ${d.day}일 차 확인 당시 손패 ${d.cardTypes.length}장</p><button class="secondary" data-ui="inspectNote" data-note="${n.id}">손패 크게 보기</button><div class="private-cards">${Object.entries(groups).map(([t,count])=>`<span>${rules.cards[t].icon} ${rules.cards[t].name} ×${count}</span>`).join('') || '<span>손패 없음</span>'}</div></div>`;
}
function renderMajorResults() {
  const g = state.game;
  if (!g) return '';
  let html = '';
  if (g.lastExecution?.day === g.day) {
    const result = g.lastExecution;
    html += `<section class="major-result execution-result"><span>${result.target ? '†' : '⚖'}</span><div><h2>${result.target ? `${esc(nameOf(result.target))}님이 처형되었습니다` : '동률 — 아무도 처형되지 않았습니다'}</h2><p>${result.target ? '모든 카드 몰수 · 당일 아침·낮 행동 금지 · 재분배 자동 수락' : '최다 득표자가 여러 명이므로 처형하지 않습니다.'}</p></div></section>`;
  }
  if (g.lastExpedition?.day === g.day && g.lastExpedition.result) {
    const r = g.lastExpedition;
    html += `<section class="major-result expedition-result ${r.result}"><span>${r.result === 'failure' ? '◇' : '✦'}</span><div><h2>${r.difficulty === 'high' ? '상급' : '하급'} 원정 ${r.result === 'great' ? '대성공!' : r.result === 'success' ? '성공!' : '실패'}</h2><p>총 공격력 ${r.score}점${r.reward ? ` · 카드 ${r.reward}장 보상` : ''}</p></div></section>`;
  }
  return html;
}
const btn = (type, title, sub, extra = '', cls = '') => `<button class="action-choice ${cls}" data-cmd="${type}" ${extra} ${extra.includes('data-target=')&&!targetPlayer?'disabled':''}><strong>${title}<span>↗</span></strong><small>${sub}</small></button>`;
function myRecipes() { return state?.me?.recipes || rules.recipes; }
function recipeMaterials(recipe) {
  return (recipe.ingredients || [recipe]).map(m => `${rules.cards[m.input].name} ${m.count}장`).join(' + ');
}
function recipeAvailable(recipe, hand) {
  if (recipe.role && recipe.role !== state.me.role) return 0;
  if (recipe.job && recipe.job !== state.me.job) return 0;
  return Math.min(...(recipe.ingredients || [recipe]).map(m => Math.floor(hand.filter(c => c.type === m.input).length / m.count)));
}
function expeditionValue(type) {
  const d=rules.cards[type], role=state.me.role;
  if(type === 'church') return 2;
  if(d.sabotage) return ['rebel','neutral'].includes(role) ? d.sabotage : null;
  if(d.expedition) return ['king','citizen','neutral'].includes(role) ? d.expedition : null;
  return d.attack || null;
}
function targetSelect(label = '대상 선택', candidates = null) {
  const others=candidates || state.players.filter(p=>p.id!==state.me.id),chosen=others.find(p=>p.id===targetPlayer);
  return `<fieldset class="target-picker"><legend>${label}</legend><p>행동할 플레이어를 아래에서 선택하세요.</p><div class="target-grid">${others.map(p=>`<label class="target-option ${p.id===targetPlayer?'chosen':''}"><input type="radio" name="action-target" data-target-player="${p.id}" ${p.id===targetPlayer?'checked':''}><span class="target-avatar">${p.role?roleIcon(p.role):'?'}</span><b>${esc(p.name)}</b><small>${p.role?labels[p.role]:'진영 비공개'}</small></label>`).join('')}</div><div class="target-preview">${chosen?`선택한 플레이어 <strong>${esc(chosen.name)}</strong>`:'아직 대상이 선택되지 않았습니다.'}</div><input type="hidden" id="target" value="${chosen?.id||''}"></fieldset>`;
}
function wait(title, description) { return `<h2>${esc(title)}</h2><p class="action-description">${description}</p><div class="wait-indicator"><i></i><i></i><i></i><span>다른 플레이어의 선택을 기다리고 있습니다.</span></div>`; }
function renderAction() {
  const g = state.game, p = g.pending, me = state.me, isKing = g.king === me.id;
  if (state.status === 'finished') {
    const won = g.winner.players.includes(me.id);
    return `<div class="victory-symbol">${won ? '♛' : '⚑'}</div><h2>${g.winner.side === 'royal' ? '왕과 시민의 승리' : g.winner.side === 'rebel' ? '반란군의 승리' : g.winner.side === 'bishop' ? '주교의 승리' : g.winner.side === 'merchant' ? '상인의 승리' : g.winner.side === 'rebel+bishop' ? '반란군과 주교의 공동 승리' : '중립의 승리'}</h2><p class="action-description">${esc(g.winner.reason)}</p><p class="outcome ${won ? 'won' : ''}">${won ? '당신의 진영이 왕국의 역사를 썼습니다.' : me.role === 'neutral' ? '중립의 여정이 끝났습니다.' : '다음 왕국에서는 운명이 달라질지도 모릅니다.'}</p><div class="button-row">${state.host === me.id ? '<button class="primary" data-cmd="rematch">같은 사람들과 다시 준비하기 →</button>' : '<span class="muted">방장이 다시 시작할 수 있습니다.</span>'}<button class="secondary" data-cmd="leave">방 나가기</button></div>`;
  }
  if (me.executed && ['morning', 'redistribute', 'day','market'].includes(g.phase)) return wait('처형 당일 아침·낮에는 행동할 수 없습니다.', '아침 재분배는 자동 수락합니다. 저녁 세금 납부와 밤 행동은 가능하며 다음 날부터 정상 참여합니다.');
  if(g.phase==='market')return renderMarket();
  if(g.phase==='merchantEvening')return renderMerchantEvening();
  if (g.phase === 'morning') {
    if (!isKing) return wait('왕의 아침 결정을 기다립니다.', `${esc(nameOf(g.king))}님이 왕국의 오늘을 결정합니다.${g.revolt > 0 ? ` 공개된 반란력은 <b>${g.revolt}점</b>입니다.` : ''}`);
    return `<h2>폐하, 어떤 길을 택하시겠습니까?</h2><p class="action-description">${g.revolt > 0 || g.religiousRevolt !== null ? '중재하지 않은 반란은 자동 성공합니다. 두 반란이 동시에 발생하면 하나만 중재할 수 있습니다.' : '발생한 반란이 없습니다. 원정 또는 사형 투표를 선택하세요.'}</p><div class="action-choices">${btn('mediate', '반란 중재', '지원 후 왕이 제출 · 동점도 성공', `data-revolt-type="rebel" ${g.revolt > 0 ? '' : 'disabled'}`)}${g.religiousRevolt !== null ? btn('mediate', '종교반란 중재', '반란군도 지원 가능 · 교단·전도 사용 불가', 'data-revolt-type="religion"') : ''}${btn('expedition', '원정', '전원 투표로 하급·상급 결정')}${btn('execute', '사형 투표', g.canExecute === false ? '5인 이하 · 어제 처형하여 오늘은 불가' : '최다 득표 동률이면 아무도 처형하지 않음', g.canExecute === false ? 'disabled' : '')}</div><p class="small muted">중재 선포와 확정한 카드 제출은 되돌릴 수 없습니다.</p>`;
  }
  if (g.phase === 'executionVote') {
    if (p.myDone) return wait('사형 투표를 마쳤습니다.', `당신은 ${esc(nameOf(p.myVote))}님에게 투표했습니다. ${p.voteCount}/${state.players.length}명 투표 완료 · 전원의 투표를 기다립니다.`);
    return `<h2>사형 대상을 투표하세요.</h2><p class="action-description">왕을 포함한 전원이 한 표씩 투표합니다. 왕은 사형할 수 없습니다. 최다 득표 동률이면 아무도 처형하지 않습니다. 처형 시 교단·전도·영구 카드까지 <b>모든 카드를 몰수</b>하고 당일 아침·낮 행동이 금지됩니다.<br>${p.voteCount}/${state.players.length}명 투표 완료</p>${targetSelect('사형 투표 대상', state.players.filter(p => p.id !== g.king))}<div class="action-choices">${btn('voteExecution', '사형 투표 확정', '전원 완료 후 득표 합계와 결과 공개', 'data-target="true"')}</div>`;
  }
  if (g.phase === 'mediationSupport') {
    if(me.role==='rebel' && p.revoltType !== 'religion')return wait('반란군은 일반 반란 중재에 참여할 수 없습니다.', '카드 지원과 0장 제출 모두 불가합니다. 왕과 다른 진영의 중재 결과를 기다립니다.');
    if (isKing || p.myDone) return wait(isKing ? '플레이어들의 지원을 기다립니다.' : '지원 선택을 확정했습니다.', `지원 카드는 왕의 손패로 가지 않고 즉시 중재에 사용됩니다.<br>지원자: ${p.supporters.length ? p.supporters.map(id => esc(nameOf(id))).join(', ') : '아직 없음'} · 지원 점수는 비교 전까지 비공개입니다.`);
    if(me.job==='merchant')return renderMoneySupport();
    return `<h2>${p.revoltType === 'religion' ? '종교반란 중재에 지원하세요.' : '왕국에 힘을 보태겠습니까?'}</h2><p class="action-description">중재력이 있는 카드를 골라 지원하세요.${p.revoltType === 'religion' ? ' 교단·전도카드는 사용 불가합니다.' : ' 교단·전도카드 사용 시 주교의 영향력이 증가합니다.'} 지원하지 않으려면 0장으로 확정하세요. 영구 카드는 소모되지 않으며 제출은 취소할 수 없습니다.</p>${submitCards('contribute', '중재 지원 확정')}`;
  }
  if (g.phase === 'mediationKing') {
    if (!isKing) return wait('왕이 마지막 중재 카드를 냅니다.', `지원자: ${p.supporters.map(id => esc(nameOf(id))).join(', ') || '없음'}<br>모든 제출이 끝나면 총 중재력과 반란력을 비교합니다.`);
    return `<h2>폐하의 중재 카드를 제출하세요.</h2><p class="action-description">지원이 끝났습니다. 총 중재력이 ${p.revoltType === 'religion' ? '종교반란력' : '반란력'} <b>${p.revoltType === 'religion' ? g.religiousRevolt : g.revolt}</b> 이상이면 성공합니다. 일회용 카드는 실패해도 소모됩니다.</p>${submitCards('contribute', '카드 확정 · 반란 판정')}`;
  }
  if (g.phase === 'expeditionVote') {
    if(p.myDone) return wait(`${p.myVote === 'high' ? '상급' : '하급'}에 투표했습니다.`, '전원의 투표를 기다립니다. 표는 마감 후 합계만 공개합니다. 동률은 하급입니다.');
    return `<h2>원정 난이도를 투표하세요.</h2><p class="action-description">왕을 포함한 전원의 다수결입니다. 동률은 하급으로 결정합니다.</p><div class="action-choices two">${btn('voteExpedition','하급','15점 성공 / 25점 대성공 · 전원 4/9장 · 실패 페널티 없음','data-difficulty="low"')}${btn('voteExpedition','상급','20점 성공 / 40점 대성공 · 반란군 제외 15/25장 · 실패 시 보호 카드 외 몰수','data-difficulty="high"')}</div>`;
  }
  if (g.phase === 'expeditionSelect') {
    if(!isKing) return wait('왕이 상급 원정 동행자를 지명합니다.', `왕 자신과 다른 ${p.required}명이 강제 참가합니다. 거절할 수 없습니다.`);
    return `<h2>상급 원정에 동행할 ${p.required}명을 지명하세요.</h2><p class="action-description">지명 명단은 왕과 각 당사자에게만 알려집니다. 당사자는 다른 지명자를 알 수 없습니다.</p><div class="expedition-targets">${state.players.filter(t=>t.id!==me.id).map(t=>`<label><input type="checkbox" data-expedition-target="${t.id}" ${expeditionTargets.has(t.id)?'checked':''}> ${esc(t.name)}</label>`).join('')}</div><div class="expedition-selection-summary" data-selection-summary>${expeditionTargets.size?[...expeditionTargets].map(id=>esc(nameOf(id))).join(' · '):'함께 갈 플레이어를 선택하세요.'}</div><div class="button-row"><span data-selection-counter>${expeditionTargets.size}/${p.required}명 선택</span><button class="primary" data-cmd="selectExpedition" data-targets="true" ${expeditionTargets.size===p.required?'':'disabled'}>강제 원정대 확정 →</button></div>`;
  }
  if (g.phase === 'expeditionJoin') {
    if (isKing || p.myDone) return wait('원정대를 모으고 있습니다.', '왕은 반드시 참가합니다. 다른 사람들은 자유롭게 참가를 결정합니다.');
    return `<h2>하급 원정에 동행하시겠습니까?</h2><p class="action-description">15점 이상 성공: 전원 4장 / 25점 이상 대성공: 전원 9장. 불참자도 보상을 받습니다. 교단카드는 원정 공격력 2점이며 사용 시 주교 영향력 +2입니다. 실패 페널티는 없습니다.</p><div class="button-row"><button class="primary" data-cmd="joinExpedition" data-join="true">원정 참가</button><button class="secondary" data-cmd="joinExpedition" data-join="false">왕국에 남기</button></div>`;
  }
  if (g.phase === 'expeditionCards') {
    if(me.job==='merchant'&&p.isParticipant)return wait('상인의 원정 제출은 자동 0장입니다.','하급·상급 원정 모두 카드 제출 없이 다른 참가자의 결과를 기다립니다.');
    if (!p.isParticipant || p.myDone) return wait('원정대가 힘을 모으고 있습니다.', `${p.difficulty==='high' ? isKing ? `왕이 지명한 사람: ${p.participants.filter(id=>id!==g.king).map(id=>esc(nameOf(id))).join(', ')}` : p.isParticipant ? '당신은 상급 원정에 지명되었습니다. 다른 지명자는 비공개입니다.' : '당신은 지명되지 않았습니다. 왕의 지명 명단은 비공개입니다.' : `참가자: ${p.participants.map(id => esc(nameOf(id))).join(', ')}`}<br>다른 사람이 제출한 카드 종류와 수량은 공개되지 않습니다.`);
    return `<h2>${p.difficulty==='high'?'상급':'하급'} 원정 카드를 제출하세요.</h2><p class="action-description">${p.difficulty==='high'?'20점 성공 / 40점 대성공. 반란군 제외 전원 15/25장 지급. 실패 시 보호 카드 외 손패 몰수.':'15점 성공 / 25점 대성공. 전원 4/9장 지급. 실패 페널티 없음.'}<br>${me.role==='rebel'?'반란 -2점·선동 -6점으로 방해 가능. 보병·장교 사용 불가.':me.role==='neutral'?'반란 -2점·선동 -6점과 보병 1점·장교 3점 모두 사용 가능.':'보병 1점·장교 3점 사용 가능. 반란·선동 사용 불가.'} 교단카드는 모든 진영이 2점으로 사용하며 소모되고 주교 영향력 +2. 공격·영구 카드는 모든 진영이 사용할 수 있습니다.</p>${submitCards('contribute', '원정 카드 확정')}`;
  }
  if (g.phase === 'redistribute') {
    if (p.myDone) return wait('재분배 결정을 마쳤습니다.', '당신의 수락·거절 여부는 다른 플레이어에게 공개되지 않습니다.');
    return `<h2>새로운 손패를 받으시겠습니까?</h2><p class="action-description">수락하면 보호 카드를 제외한 기존 손패를 버리고 <b>새 카드 12장</b>을 받습니다. 영구 카드도 교체됩니다. 주교 이외의 교단·전도카드는 유지됩니다. 거절하면 현재 손패를 유지하고, <b>8장 미만이면 부족한 만큼 무작위 카드를 받아 8장</b>으로 채웁니다. 선택은 비공개입니다.</p><div class="button-row"><button class="primary" data-cmd="redistribute" data-accept="true">재분배 수락 · 새로 12장</button><button class="secondary" data-cmd="redistribute" data-accept="false">거절 · 손패 유지${me.hand.length < 8 ? ` +${8 - me.hand.length}장 보충` : ''}</button></div>`;
  }
  if (g.phase === 'day') {
    if (p?.kind === 'royalSupport') {
      if (p.from === me.id) return wait('왕국지원 응답을 기다립니다.', `${esc(nameOf(p.to))}님이 거절하면 왕의 차례가 바로 끝납니다.`);
      if (!p.accepted) return `<h2>왕이 왕국지원을 요청했습니다.</h2><p class="action-description">수락하면 왕에게 카드 3~5장을 제공합니다. 손패가 3장 미만이면 거절만 가능합니다.</p><div class="button-row"><button class="primary" data-cmd="supportAnswer" data-accept="true" ${me.hand.length < 3 ? 'disabled' : ''}>왕국지원 수락</button><button class="secondary" data-cmd="supportAnswer" data-accept="false">거절 · 왕의 차례 종료</button></div>`;
      return `<h2>왕에게 줄 카드 3~5장을 선택하세요.</h2><p class="action-description">선택한 카드는 왕의 손패로 이전됩니다.</p>${submitCards('supportSubmit', '왕국지원 카드 확정')}`;
    }
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
    if (g.round === 1) return `<h2>첫 번째 선택, 오늘의 준비.</h2><p class="action-description">${me.job==='merchant'?'상인은 비밀거래를 할 수 없습니다. 채집 또는 카드받기를 선택하세요.':'거래·채집·카드받기 중 하나를 선택하세요.'}</p><div class="action-choices">${me.job==='merchant'?'':btn('trade', '비밀 거래', '상대 응답 후 서로 비공개로 교환', 'data-target="true"')}${btn('gather', '채집', '자원 카드 6장 확정 획득')}${btn('draw3', '카드받기', '무작위 카드 4장 획득')}</div>${me.job==='merchant'?'':targetSelect('거래 신청 대상', state.players.filter(p => p.id !== me.id && !p.executed))}`;
    if (g.round === 2) {
      if (p?.kind === 'craft') return `<h2>필요한 만큼 제작하세요.</h2><p class="action-description">공통 제작과 자신의 진영 제작만 가능합니다. 영구 카드는 제작 재료로 쓰면 소모됩니다.</p><div class="recipes">${myRecipes().map(r => {
        const i=r.id;
        const available = recipeAvailable(r, me.hand);
        return `<div class="recipe"><span>${rules.cards[r.output].icon}</span><div><b>${recipeMaterials(r)} → ${rules.cards[r.output].name} ${r.amount || 1}장</b><small>${recipeLabel(r)} · 현재 최대 ${available}회 제작 가능${rules.cards[r.output].instantWin ? ' · 제작 즉시 진영 승리' : ''}</small></div><input type="number" id="recipe-count-${i}" aria-label="${rules.cards[r.output].name} 제작 수량" value="1" min="1" max="${available || 1}" ${available ? '' : 'disabled'}><button class="secondary compact" data-cmd="craft" data-recipe="${i}" ${available ? '' : 'disabled'}>제작</button></div>`;
      }).join('')}</div><button class="primary" data-cmd="craftDone">제작 완료 · 다음 차례 →</button>`;
      if (actionMode === 'hunt') return `<h2>사냥에 나설 카드를 고르세요.</h2><p class="action-description">공격력 <b>10점 이상</b>이면 카드 7장을 받습니다. 보병·장교는 사용할 수 없습니다. 영구 카드는 소모되지 않습니다.</p>${submitCards('hunt', '사냥 실행')}<button class="quiet" data-ui="cancelMode">선택으로 돌아가기</button>`;
      return `<h2>두 번째 선택, 힘을 갖출 시간.</h2><p class="action-description">제작 또는 사냥을 선택하세요. 사냥은 한 번이며, 제작은 원하는 만큼 가능합니다.</p><div class="action-choices two">${btn('beginCraft', '제작', `나의 ${myRecipes().length}종 제작법 · 반복·연속 제작`)}<button class="action-choice" data-ui="hunt"><strong>사냥<span>↗</span></strong><small>공격력 10점 이상 · 보상 카드 7장</small></button></div>`;
    }
    if(actionMode==='refresh') return `<h2>5장 받기 · 일부 손패 교체</h2><p class="action-description">기존 손패에서 교체할 카드를 최대 5장 선택하세요. 선택한 카드를 버리고 새 카드 5장을 받습니다.<br>0장 선택 → +5장 / 3장 선택 → 교체 3장 + 추가 2장 / 5장 선택 → 교체만 5장.</p>${submitCards('refresh','5장 받기 확정')}<button class="quiet" data-ui="cancelMode">선택으로 돌아가기</button>`;
    return `<h2>세 번째 선택, 손패와 정보.</h2><p class="action-description">${isKing ? '왕은 손패 확인·카드 뺏기 대신 왕국지원을 요청합니다.' : '행동과 확인한 정보는 비공개입니다.'}</p><div class="action-choices four">${btn('replace', '손패 전체 교체', '보호 카드는 유지 · 나머지는 같은 장수로 교체')}<button class="action-choice" data-ui="refresh"><strong>5장 받기·일부 교체<span>↗</span></strong><small>교단·전도는 교체 불가 · 최대 5장 교체</small></button>${isKing ? btn('royalSupport', '왕국지원 요청', '수락 시 3~5장 받기 · 거절 시 즉시 차례 종료', 'data-target="true"') : btn('revealHand', '타인 손패 전체 보기', '선택한 한 명의 모든 카드 크게 확인', 'data-target="true"') + btn('steal', '타인 카드 2장 가져오기', '선택한 한 명에게서 무작위로 가져옴', 'data-target="true"')}</div>${targetSelect(isKing ? '왕국지원 요청 대상' : '확인·가져오기 대상', isKing ? state.players.filter(p => p.id !== me.id && !p.executed) : null)}`;
  }
  if (g.phase === 'evening') {
    if (!isKing) return wait('왕이 저녁 정책을 선택합니다.', '세금징수·지명수배·시민지원 중 한 가지 정책이 시행됩니다.');
    return `<h2>왕국의 저녁 정책을 결정하세요.</h2><p class="action-description">${g.day === g.maxDays ? '마지막 저녁입니다. 정책 시행 후 승패가 결정됩니다.' : '정책 시행이 끝나면 밤이 시작됩니다.'}</p><div class="action-choices">${btn('tax', '세금징수', '전원 확정 후 동시에 납부')}${btn('wanted', '지명수배', '처형 당일인 플레이어는 지목 불가', 'data-target="true"')}${btn('aid', '시민지원', '왕을 제외한 전원에게 새 카드 6장')}</div>${targetSelect('지명수배 대상', state.players.filter(p => p.id !== me.id && !p.executed))}`;
  }
  if (g.phase === 'tax') {
    if (p.myDone) return wait(isKing ? '전원의 세금 납부를 기다립니다.' : '세금 카드를 확정했습니다.', '전원이 납부를 확정하면 선택한 카드가 동시에 왕에게 이전됩니다. 카드 종류는 다른 사람에게 공개되지 않습니다.');
    return `<h2>왕에게 세금을 납부하세요.</h2><p class="action-description">카드 <b>${Math.min(3, me.hand.length)}장</b>을 선택하세요. 손패가 3장보다 적다면 전부 납부합니다. 영구 카드도 낼 수 있습니다.</p>${submitCards('payTax', '선택한 카드 납부')}`;
  }
  if (g.phase === 'night') {
    if (me.role !== 'rebel' || p.myDone) return wait('왕국이 잠든 밤.', '밤의 행동은 비공개입니다. 쌓인 반란점수는 다음 날 아침에 공개됩니다.');
    return `<h2>어둠 속에서 반란을 준비하세요.</h2><p class="action-description">반란력이 있는 카드를 제출하세요. 폭탄은 +5점이며 반란 실패 시 왕·시민의 손패를 전부 버립니다. 설치 여부는 판정 전까지 비공개입니다. 영구 카드는 유지됩니다.</p>${submitCards('revolt', '밤의 반란 카드 확정')}`;
  }
  if (g.phase === 'bishopNight') {
    if (me.job !== 'bishop') return wait('왕국이 잠든 밤.', '밤의 행동은 비공개이며 다음 아침에 반란력이 공개됩니다.');
    const churches = me.hand.filter(c => c.type === 'church').length;
    const evangelisms = me.hand.filter(c => c.type === 'evangelism').length;
    return `<h2>주교의 밤 · 교단의 길을 선택하세요.</h2><p class="action-description">원하는 행동을 여러 번 할 수 있습니다. 종교반란은 한 밤에 한 번만 선언 가능합니다.<br>교단 ${churches}장 · 전도 ${evangelisms}장 · 교단영향력 <b>${me.churchInfluence}점</b>${g.religiousScheduled ? '<br>다음 아침 종교반란이 예약되어 있습니다.' : ''}</p><div class="action-choices">${btn('evangelize', '종교전도', '교단 3장 소모 · 무작위 1장 가져오기 + 전도 1장 전달', `data-target="true" ${churches < 3 ? 'disabled' : ''}`)}${btn('religiousRevolt', '종교반란', '교단 6장 소모 · 다음 아침 종교반란', churches < 6 || g.religiousScheduled ? 'disabled' : '')}${btn('reform', '종교개혁', '전도 3장 소모 · 타인 교단만 몰수 · 타인 전도 유지 · 교단 1장당 영향력 +2', evangelisms < 3 ? 'disabled' : '')}${btn('reclaimChurch', '교단회수', '전도 1장 소모 · 선택한 사람의 교단카드 전부 가져오기', `data-target="true" ${evangelisms < 1 ? 'disabled' : ''}`)}</div>${targetSelect('종교전도·교단회수 대상')}<button class="primary" data-cmd="bishopDone">밤 행동 완료 · 다음 아침 →</button>`;
  }
  return '';
}
function selectionContext() {
  if (!state?.game || state.status !== 'playing' || !rules) return null;
  const g = state.game, p = g.pending, id = state.me.id;
  if(g.phase==='market'&&!p.myDone&&state.me.job!=='merchant')return marketSelection();
  if(g.phase==='merchantEvening'&&state.me.job==='merchant'&&actionMode==='display'&&p.kind!=='craft')return {allowed:()=>true,min:1,label:'진열할 카드'};
  if(state.me.job==='merchant'&&['mediationSupport','mediationKing','expeditionCards'].includes(g.phase))return null;
  if ((state.me.role!=='rebel' || p?.revoltType === 'religion') && (g.phase === 'mediationSupport' && id !== g.king || g.phase === 'mediationKing' && id === g.king) && !p.myDone) return { allowed: t => !!rules.cards[t].mediation && (p.revoltType !== 'religion' || !religionCard(t)), stat: 'mediation', label: '내 중재력' };
  if (g.phase === 'expeditionCards' && p.isParticipant && !p.myDone) return { allowed: t => expeditionValue(t)!==null, stat: 'expedition', label: '내 원정 기여점수' };
  if (g.phase === 'day' && p?.kind === 'trade' && p.accepted && !p.myDone) return { allowed: () => true, label: '줄 카드' };
  if (g.phase === 'day' && g.current === id && g.round === 2 && actionMode === 'hunt') return { allowed: t => !!rules.cards[t].attack, stat: 'attack', label: '사냥 공격력' };
  if (g.phase === 'day' && g.current===id && g.round===3 && actionMode==='refresh') return {allowed:t=>!religionCard(t),label:'교체할 카드',max:5};
  if (g.phase === 'day' && p?.kind === 'royalSupport' && p.accepted && p.to === id) return {allowed:()=>true,label:'왕국지원 카드',min:3,max:5};
  if (g.phase === 'tax' && !p.myDone) return { allowed: () => true, label: '세금 카드', exact: Math.min(3, state.me.hand.length) };
  if (g.phase === 'night' && state.me.role === 'rebel' && !p.myDone) return { allowed: t => !!rules.cards[t].revolt, stat: 'revolt', label: '내 반란력' };
  return null;
}
function cardStats(def) {
  return [def.attack ? `공격 ${def.attack}` : '', def.revolt ? `반란 ${def.revolt}` : '', def.mediation ? `중재 ${def.mediation}` : '', def.expedition ? `원정 ${def.expedition}` : '', def.sabotage ? `원정 방해 ${def.sabotage}` : '', def.bomb ? '실패 시 왕·시민 몰수' : '', def.permanent ? '영구 · 재사용' : '', def.instantWin ? '획득 즉시 승리' : ''].filter(Boolean);
}
function renderHand() {
  if (!state.me.hand.length) return '<div class="empty-hand"><span>◇</span><p>지금은 손패가 없습니다.<br><small>카드받기나 채집으로 다시 준비하세요.</small></p></div>';
  const context = selectionContext();
  return Object.entries(rules.cards).filter(([type]) => state.me.hand.some(c => c.type === type)).map(([type, def]) => {
    const cards = state.me.hand.filter(c => c.type === type), count = cards.filter(c => selected.has(c.id)).length;
    const allowed = context?.allowed(type);
    const newCount = cards.filter(c => freshCards.has(c.id)).length;
    return `<div class="card ${def.category} ${newCount ? 'new-card' : ''} ${count ? 'selected' : ''} ${context && !allowed ? 'unusable' : ''}"><div class="card-top"><span>${newCount ? `NEW +${newCount}` : def.permanent ? 'PERMANENT' : 'KINGDOM'}</span><b>×${cards.length}</b></div><div class="card-symbol">${def.icon}</div><h3>${def.name}</h3><div class="card-stats">${cardStats(def).map(s => `<span>${s}</span>`).join('') || '<span>제작 재료</span>'}</div>${allowed ? `<div class="card-stepper"><button data-ui="minusCard" data-card="${type}" aria-label="${def.name} 선택 줄이기" ${count ? '' : 'disabled'}>−</button><span>${count} / ${cards.length}</span><button data-ui="plusCard" data-card="${type}" aria-label="${def.name} 선택 늘리기" ${count === cards.length ? 'disabled' : ''}>＋</button></div>` : `<div class="card-bottom">${def.chance ? `DRAW RATE ${def.chance}%` : def.instantWin ? 'LEGENDARY' : 'CRAFT ONLY'}</div>`}</div>`;
  }).join('');
}
function selectionScore() {
  const c = selectionContext();
  if (!c?.stat) return selected.size;
  return state.me.hand.filter(card => selected.has(card.id)).reduce((s, card) => {
    const d = rules.cards[card.type]; return s + (c.stat === 'expedition' ? expeditionValue(card.type) || 0 : d[c.stat] || 0);
  }, 0);
}
function renderSelectionSummary() {
  const c = selectionContext();
  return `<div class="selection-summary"><span>선택한 카드 <b>${selected.size}장</b></span><span>${c.label} <b>${selectionScore()}${c.stat ? '점' : '장'}</b></span>${c.exact !== undefined ? `<span>필요한 카드 ${c.exact}장</span>` : ''}</div>`;
}
function submitCards(type, text) {
  const c = selectionContext(), disabled = c?.exact !== undefined && selected.size !== c.exact || c?.min !== undefined && selected.size < c.min;
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
  if(event.target.matches('[data-shop-quantity]')){
    const item=selectedShopItem(),quantity=Number(event.target.value);
    if(!item||!Number.isInteger(quantity)||quantity<1||quantity>item.quantity){toast('재고 안에서 구매 수량을 선택하세요.');event.target.value=shopQuantity;return;}
    shopQuantity=quantity;selected.clear();render();return;
  }
  if (event.target.matches('[data-neutral-job]')) {
    const jobs = [...document.querySelectorAll('[data-neutral-job]:checked')].map(el => el.dataset.neutralJob);
    await command({ type: 'neutralJobs', jobs }); return;
  }
  if(event.target.matches('[data-target-player]')) { targetPlayer=event.target.dataset.targetPlayer;render();return; }
  if(event.target.matches('[data-expedition-target]')){
    const id=event.target.dataset.expeditionTarget, required=state.game.pending.required;
    if(event.target.checked){if(expeditionTargets.size>=required){event.target.checked=false;toast(`${required}명만 지명할 수 있습니다.`);return;}expeditionTargets.add(id);}else expeditionTargets.delete(id);
    $('[data-selection-counter]').textContent=`${expeditionTargets.size}/${required}명 선택`;
    $('[data-selection-summary]').textContent=expeditionTargets.size?[...expeditionTargets].map(nameOf).join(' · '):'함께 갈 플레이어를 선택하세요.';
    $('[data-cmd="selectExpedition"]').disabled=expeditionTargets.size!==required;return;
  }
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
    if(ui==='shopPick'){shopStockId=button.dataset.stock;shopQuantity=1;selected.clear();render();return;}
    if(ui==='displayMode'){actionMode='display';selected.clear();render();return;}
    if (ui === 'addLocalPlayer') {
      const name = $('#local-player-name').value.trim();
      if (!name) { toast('추가할 플레이어 이름을 입력하세요.'); return; }
      await command({ type: 'addLocalPlayer', name }); return;
    }
    if (ui === 'chooseSeat' || ui === 'cancelSeat') { deviceSeatChoice = ui === 'chooseSeat' ? button.dataset.seat : null; render(); return; }
    if (ui === 'inspectNote') { const note = state.me.notes.find(n => n.id === button.dataset.note && n.details?.kind === 'hand'); if (note) window.kingdomResults?.inspection(note, state.me.name); return; }
    if(ui==='acknowledgeTheft'){
      state.me.notes.filter(n=>n.effect==='stolen').forEach(n=>acknowledgedThefts.add(n.id));
      localStorage.setItem('kingdom.theftAcknowledgements',JSON.stringify([...acknowledgedThefts].slice(-100)));render();
    }else if (ui === 'returnRoom') {
      const session = savedSession(RETURN_STORAGE);
      if (session) await command(resumeCommand(session));
    } else if (ui === 'copyCode' || ui === 'copyLink') {
      const text = ui === 'copyCode' ? state.code : `${location.origin}/?room=${state.code}`;
      try { await navigator.clipboard.writeText(text); toast(ui === 'copyCode' ? '방 코드를 복사했습니다.' : '초대 링크를 복사했습니다.'); }
      catch { toast(`복사할 내용: ${text}`); }
    } else if (ui === 'guide') $('#rules').showModal();
    else if (ui === 'hunt') { actionMode = 'hunt'; selected.clear(); render(); }
    else if (ui === 'refresh') { actionMode = 'refresh'; selected.clear(); render(); }
    else if (ui === 'cancelMode') { actionMode = null; selected.clear(); render(); }
    else if (ui === 'clearSelection') { selected.clear(); render(); }
    else if (ui === 'selectAll') {
      const c = selectionContext();
      if (c) { const candidates = state.me.hand.filter(card => c.allowed(card.type)); selected = new Set(candidates.slice(0, c.exact ?? c.max ?? candidates.length).map(c => c.id)); render(); }
    } else if (ui === 'plusCard' || ui === 'minusCard') {
      const c = selectionContext(), type = button.dataset.card;
      if (!c?.allowed(type)) return;
      if (ui === 'plusCard') {
        const limit=c.exact ?? c.max;
        if (limit !== undefined && selected.size >= limit) { toast(`최대 ${limit}장만 선택할 수 있습니다.`); return; }
        const card = state.me.hand.find(card => card.type === type && !selected.has(card.id)); if (card) selected.add(card.id);
      } else { const card = state.me.hand.find(card => card.type === type && selected.has(card.id)); if (card) selected.delete(card.id); }
      render();
    }
    return;
  }
  const type = button.dataset.cmd;
  if (!type) return;
  const data = { type };
  if(type==='marketBuy'){data.stock=shopStockId;data.quantity=shopQuantity;}
  if(type==='displayGoods')data.price=Number($('#display-price').value);
  if(button.dataset.stock)data.stock=button.dataset.stock;
  if(button.dataset.priceInput)data.price=Number(document.getElementById(button.dataset.priceInput).value);
  if(button.dataset.quantityInput)data.quantity=Number(document.getElementById(button.dataset.quantityInput).value);
  if(button.dataset.product)data.product=button.dataset.product;
  if(button.dataset.money){data.money=Number($('#mediation-money').value);data.cards=[];}
  if (button.dataset.seat) data.player = button.dataset.seat;
  if (button.dataset.target) { if(!targetPlayer){toast('행동할 플레이어를 선택하세요.');return;}data.target = targetPlayer; }
  if (button.dataset.botTarget) data.target = button.dataset.botTarget;
  if (button.dataset.cards) data.cards = [...selected];
  if (button.dataset.targets) data.targets = [...expeditionTargets];
  if (button.dataset.difficulty) data.difficulty = button.dataset.difficulty;
  if (button.dataset.revoltType) data.revoltType = button.dataset.revoltType;
  if (button.dataset.accept !== undefined) data.accept = button.dataset.accept === 'true';
  if (button.dataset.join !== undefined) data.join = button.dataset.join === 'true';
  if (button.dataset.recipe !== undefined) {
    data.recipe = Number(button.dataset.recipe); data.count = Number($(`#recipe-count-${data.recipe}`).value);
  }
  await command(data);
});
document.addEventListener?.('visibilitychange', () => {
  if (document.hidden && state?.device?.active && state.status === 'playing') {
    window.kingdomResults?.close();
    command({ type: 'lockSeat' });
  }
});
$('#rules-open').addEventListener('click', () => $('#rules').showModal());
$('#rules-close').addEventListener('click', () => $('#rules').close());
$('#rules').addEventListener('click', event => { if (event.target === $('#rules')) { const r = $('#rules').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('#rules').close(); } });
function renderRules() {
  $('#rules-content').innerHTML = `
    <div class="guide-banner">왕은 공개, 나머지 진영과 손패는 비밀. 반란군끼리는 서로를 압니다.</div>
    <h3>승리와 하루의 흐름</h3><p>게임 기간: 3인 10일·4인 9일·5인 7일·6인 이상 6일. 일반 반란은 3인 1일·4인 2일·5인 이상 3일 성공하면 반란군이 즉시 승리합니다. 종교반란은 4인 1일·5인 2일·6인 이상 3일 성공하면 주교가 승리합니다. 마지막 저녁까지 두 반란의 승리 목표를 막으면 왕·시민 승리. 마지막 날에는 밤이 없습니다. 철혈의 검 획득 시 즉시 승리합니다.</p>
    <h3>강화학습 AI</h3><p>대기실의 AI 추가로 혼자 또는 친구와 함께 학습된 AI를 상대할 수 있습니다. AI도 무작위 진영 배정과 동일한 규칙을 적용받으며, 자기 손패와 공개 정보만 보고 서버에서 행동합니다. 사람과 AI를 합쳐 3명 이상이면 시작할 수 있습니다. 학습된 초기 모델이라 진영별 실력 차이가 있으며, 디스코드 대화를 듣지는 않습니다.</p>
    <div class="guide-phases"><div><b>☀ 아침</b><p>반란력 공개 → 왕의 중재 / 사형 투표 / 원정 → 비공개 재분배. 발생한 반란이 있어야 중재 가능. 3인과 첫날에도 사형 투표 가능.</p></div><div><b>◉ 낮</b><p>왕부터 고정 순서로 3바퀴. ① 거래 / 채집(자원 6장) / 4장 받기 ② 제작 / 사냥 ③ 전체 교체 / 5장 받기·일부 교체 / 타인 손패 전체 보기 / 타인 카드 2장 가져오기.</p></div><div><b>◒ 저녁</b><p>세금징수: 왕 제외 각자 3장 납부(부족하면 전부). 시민지원: 왕 제외 전원 6장. 지명수배: 정확히 반란카드가 있으면 반란·선동·병기·폭탄만 전부 몰수. 선동·폭탄만 있으면 몰수하지 않음.</p></div><div><b>☾ 밤</b><p>반란군이 카드를 비공개 제출한 뒤 주교가 행동합니다. 다음 아침 반란력을 공개합니다. 폭탄은 판정 전 비공개, 일반 반란 성공 시 왕·시민 손패 몰수(보호 카드 유지).</p></div></div>
    <h3>사형 투표</h3><p>왕이 사형을 선택하면 왕을 포함한 전원이 왕 이외의 사람에게 한 표씩 투표합니다. 최다 득표 동률이면 아무도 처형하지 않습니다. 처형 시 교단·전도·영구 카드까지 모두 몰수하고 당일 아침·낮 행동은 금지됩니다. 재분배는 자동 수락하며 저녁 세금과 밤 행동은 가능합니다. 처형 당일은 지명수배 대상이 될 수 없습니다. 5인 이하에서는 실제 처형을 2일 연속 할 수 없습니다. 동률로 처형하지 않은 날은 다음 날 투표할 수 있습니다. 결과는 크게 표시합니다.</p>
    <h3>중재 · 사냥</h3><p>일반 반란 중재에는 반란군이 참여할 수 없습니다. 종교반란 중재에는 반란군도 참여할 수 있지만 교단·전도카드는 사용할 수 없습니다. 왕 선포 → 지원 → 왕 제출 → 판정. 중재력이 반란력 이상이면 성공. 1장 이상 지원한 인원수(왕 제외)를 표시합니다. 중재 실패·미선택 시 해당 반란 성공 1일. 사냥은 공격력 10점 이상이면 본인에게 7장.</p>
    <h3>중립 직업 · 주교</h3><p>방장이 원하는 중립 직업을 선택하면 선택한 직업 중 무작위 배정합니다. 같은 직업은 중복되지 않으며 주교는 최대 1명입니다. 3인은 중립 직업이 없습니다. 선택한 직업보다 중립 인원이 많으면 남은 자리는 일반 중립입니다. 주교는 종교반란 4인 1일·5인 2일·6인 이상 3일 성공 시 혼자 승리합니다. 종교반란 성공 트랙은 일반 반란 트랙 위에 표시됩니다.</p>
    <h3>중립 직업 · 상인과 익명 상점</h3><p>상인은 시작 돈0·진열장 없음, 돈100점 이상이면 즉시 혼자 승리합니다. 상인의 이름과 보유 돈은 비공개이며 상품 종류·수량·가격만 공개합니다. 상인은 비밀거래 불가. 낮 시작에 상인 이외의 플레이어가 동시에 구매하며 먼저 확정한 주문부터 재고를 차감합니다. 구매 완료를 누르면 재구매할 수 없고 전원 완료 뒤 기존 낮을 진행합니다. 대금은 직접 선택한 카드이며 주교만 교단·전도를 지불할 수 있습니다. 지불한 카드는 소멸하고 상인은 카드 수×2의 돈을 받습니다. 상점에서 전도를 받아도 즉시 전파 효과는 발동하지 않습니다.</p>
    <p>왕의 저녁 정책·세금 완료 후 상인이 준비합니다. 제작창은 저녁마다 한 번 열고 내부 제작은 무제한, 닫은 뒤에는 다음 저녁까지 다시 열 수 없습니다. 제작창을 닫아도 진열·가격 변경·구매는 계속할 수 있습니다. 진열장은 최대5종·종류당30장, 회수·종류 교체 불가. 같은 종류 추가는 가능하며 한 종류가 모두 팔려 사라져야 다른 종류를 진열할 수 있습니다. 가격은 상품1장당 카드1~5장입니다. 진열물은 모든 손패 효과·제한과 별개입니다.</p>
    <p>상인은 돈2점→자원1장, 돈3점→보병1장 또는 반란1장, 돈10점→랜덤5장을 반복 구매합니다. 하급·상급 원정은 자동0장 제출합니다. 두 반란 중재 모두 카드 제출 불가, 돈2점당 중재력1을 지원하고 돈은 소모됩니다. 상인만 마법·영구 마법·고위 마법 제작법이 없습니다. 해당 카드 자체는 존재하며 소지·판매할 수 있습니다. 상인 전용 강화된 영구 칼은 공격력3·영구, 빛날검은 공격력7·영구입니다. 5인의 추가 중립 자리도 선택 가능합니다.</p>
    <p>교단·전도카드는 랜덤 확률 0%. 교단 중재력 3, 전도 중재력 7. 일반 반란 중재에서 교단 1장당 영향력 +2, 전도 1장당 +6을 얻습니다. 교단은 모든 진영이 원정 공격력 2점으로 사용할 수 있으며 소모되고 영향력 +2입니다. 주교만 보병 1장 또는 반란 1장 → 교단 1장, 장교 1장 또는 선동 1장 → 전도 1장을 제작할 수 있습니다.</p>
    <p>누구끼리의 거래·카드 뺏기든 전도카드를 받은 사람은 받은 전도카드 수만큼 일반 카드를 무작위 교단카드로 바꿉니다. 바꿀 일반 카드가 부족하면 부족한 수만큼 교단카드를 추가 지급합니다. 주교가 받으면 발동하지 않습니다. 매일 아침 주교 이외의 사람은 가진 전도카드 수만큼 교단카드를 받으며 이후 손패 제한을 적용합니다.</p>
    <p>주교 이외의 교단·전도카드는 중재 사용·거래·카드 뺏기와 사형·종교 정리 효과 외에는 버려지지 않습니다. 재분배 수락은 보호 카드를 유지하고 새 12장을 추가하며, 전체 교체는 나머지 카드만 같은 장수로 교체합니다. 손패 제한은 일반 카드를 먼저 버린 뒤 필요한 만큼 보호 카드를 버립니다. 주교 자신의 카드는 보호되지 않습니다.</p>
    <div class="guide-phases"><div><b>종교전도</b><p>교단 3장 소모. 다른 사람의 카드 1장을 무작위로 가져온 뒤 그 사람에게 전도 1장을 넣습니다. 여러 번 가능.</p></div><div><b>종교반란</b><p>교단 6장 소모. 한 밤에 1번 선언 가능, 다음 밤 다시 가능. 다음 아침 밤 행동 종료 시의 교단영향력으로 반란합니다.</p></div><div><b>종교개혁</b><p>자신의 전도 3장 소모. 자신 이외의 교단만 버리고 전도는 유지합니다. 버린 교단 1장당 영향력 +2. 여러 번 가능.</p></div><div><b>교단회수</b><p>전도 1장 소모. 선택한 다른 한 사람의 교단카드를 전부 자신의 손패로 가져옵니다. 전도·일반 카드는 유지되며 여러 번 가능합니다.</p></div></div>
    <p>두 반란이 동시에 발생하면 왕은 하나만 중재하며 나머지는 자동 성공합니다. 둘 다 승리 목표에 도달하면 왕이 중재하지 않은 쪽이 이깁니다. 왕이 두 쪽 모두 중재하지 않았다면 두 쪽이 공동 승리합니다. 종교반란 종료 후 성공·실패와 관계없이 교단영향력은 0. 종교반란을 막으면 주교 이외의 모든 교단·전도카드를 버립니다.</p>
    <h3>원정 투표와 난이도</h3><p>전원 난이도 투표, 동률은 하급. 원정 결과는 크게 표시합니다.</p><div class="guide-phases"><div><b>하급 원정</b><p>왕 필참, 나머지 자유 참가. 15점 성공: 전원 4장 / 25점 대성공: 전원 9장. 실패 페널티 없음.</p></div><div><b>상급 원정</b><p>왕이 3인에서는 1명, 4인에서는 2명, 5인 이상에서는 3명 강제 지명. 지명 명단은 비공개. 20점 성공: 반란군 제외 15장 / 40점 대성공: 반란군 제외 25장. 실패 시 반란군 제외 손패 몰수하되 주교를 포함한 모든 교단·전도카드는 남습니다.</p></div></div><p>왕·시민은 보병 +1·장교 +3, 반란군은 반란 -2·선동 -6, 중립은 둘 다 가능. 교단은 모든 진영이 원정 공격력2로 사용합니다.</p>
    <h3>손패 · 비밀 거래</h3><p>시작 카드12장. 아침 시작에 손패6장 이하는 +5장 지급합니다. 손패31장 이상이면 자원 → 나머지 일반 → 보호되는 교단·전도 순서로 30장까지 줄입니다. 주교 본인의 종교카드는 일반 순위입니다. 재분배 수락 시 보호 카드 외 버리고 새12장, 거절 시 최소8장 보충. 낮 행동과 거래 카드는 비공개입니다. 확정한 거래는 양쪽 카드를 동시에 교환합니다.</p>
    <h3>방 나가기</h3><p>게임 상단의 방 나가기로 홈으로 이동할 수 있습니다. 진행 중인 게임에서는 직업·손패·자리를 유지하고 연결만 해제합니다. 본인 차례에는 복귀를 기다리며, 홈의 원래 방으로 돌아가기로 재입장할 수 있습니다. 대기실에서는 참가자 명단에서 나가고 방장 권한을 넘깁니다.</p>
    <h3>낮 마지막 바퀴 · 왕국지원</h3><p>5장 받기·일부 교체에서는 주교도 교단·전도를 교체할 수 없습니다. 왕은 타인 손패 확인과 뺏기 불가. 왕국지원을 요청하면 상대가 거절할 수 있으며 거절 즉시 왕 차례 종료. 수락하면 상대가3~5장을 제공하고3장 미만이면 거절만 가능합니다. 다른 진영은 손패 전체 확인(크게 표시)·무작위2장 뺏기가 가능합니다.</p>
    <h3>세금 · 한 기기 돌려쓰기</h3><p>세금은 전원이 납부를 확정하면 동시에 왕에게 이전됩니다. 같은 폰·PC 참가자는 대기실에서 이름을 추가하세요. 다른 기기와 함께 참가할 수 있습니다. 다음 사람에게 넘기기 → 이름 확인 → 내 화면 열기로 전환하고 본인 차례에만 손패·직업이 공개됩니다. 재접속 시에도 화면이 가려진 상태로 복구됩니다.</p>
    <h3>카드 도감</h3><div class="guide-card-list">${Object.values(rules.cards).map(c => `<div><span>${c.icon}</span><b>${c.name}</b><small>${c.chance}%</small><p>${cardStats(c).join(' · ') || '제작 재료'}</p></div>`).join('')}</div>
    <h3>나의 공통·특수 제작법</h3><div class="guide-recipes">${myRecipes().map(r => `<p><b>${recipeLabel(r)}</b> · ${recipeMaterials(r)} <span>→</span> ${rules.cards[r.output].name} ${r.amount||1}장</p>`).join('')}</div><p>영구 칼·영구 마법·전쟁병기는 사용할 때 남지만 제작 재료로 사용하면 소모됩니다. 화염대검과 북부의 검은 영구 칼·영구 마법을 재료로 제작합니다. 다른 진영·직업의 특수 제작법은 표시하지 않습니다.</p><p class="small muted">철혈의 검은 화염대검+북부의 검으로 제작하며 즉시 승리. 주교는 혼자 승리합니다.</p>`;
}
render();
