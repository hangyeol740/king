/* 개인 효과는 서버가 본인에게 보낸 notes만 사용합니다. */
(() => {
  const panel = document.querySelector('#action-effect');
  const toggle = document.querySelector('#sound-toggle');
  let enabled = localStorage.getItem('kingdom.sound') !== 'off';
  let audio, timer, lastSoundAt = -Infinity;
  const voices = new Set();
  const themes = {
    blocked: ['♜', '반란 방어 성공', [262, 330, 392, 523]],
    breached: ['⚑', '반란 방어 실패', [220, 196, 165, 110]],
    success: ['✦', '작전 성공', [330, 440, 554, 660]],
    failure: ['◇', '작전 실패', [262, 220, 175]],
    gain: ['＋', '카드가 도착했습니다', [523, 659, 784]],
    craft: ['⚒', '제작 완료', [196, 392, 587]],
    trade: ['⇄', '비밀 거래 완료', [392, 523, 392]],
    royal: ['♛', '왕의 명령', [262, 392, 523]],
    dawn: ['☀', '왕국의 새로운 아침', [392, 494, 587]],
    loss: ['†', '왕국의 처분', [196, 147]],
    victory: ['♛', '승패가 결정되었습니다', [262, 330, 392, 523, 659]],
    submit: ['✓', '제출 완료', [440, 554]],
    turn: ['◉', '당신의 차례입니다', [523, 698]],
    notice: ['◈', '나의 행동 결과', [440, 523]]
  };
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function updateToggle() {
    toggle.textContent = enabled ? '효과음 켜짐 ♪' : '효과음 꺼짐';
    toggle.setAttribute('aria-pressed', String(enabled));
  }
  function unlock() {
    if (!enabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!audio && Audio) audio = new Audio();
      if (audio?.state === 'suspended') audio.resume().catch(() => {});
    } catch { /* 오디오 미지원 환경에서도 게임은 계속 진행합니다. */ }
  }
  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock);
  function stopSound() {
    for (const oscillator of voices) { try { oscillator.stop(); } catch {} }
  }
  function sound(kind, important = false) {
    if (!enabled || !audio || audio.state !== 'running' || document.hidden) return;
    const now = performance.now();
    if (!important && now - lastSoundAt < 70) return;
    lastSoundAt = now;
    stopSound(); // 이전 예약 음을 중단하고 최신 행동을 즉시 재생합니다.
    const frequencies = (themes[kind] || themes.notice)[2];
    frequencies.forEach((frequency, index) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      const start = audio.currentTime + index * .065;
      oscillator.type = ['breached', 'failure', 'loss'].includes(kind) ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(.065, start + .015);
      gain.gain.exponentialRampToValueAtTime(.001, start + .14);
      oscillator.connect(gain); gain.connect(audio.destination); voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start); oscillator.stop(start + .16);
    });
  }
  toggle.addEventListener('click', () => {
    enabled = !enabled; localStorage.setItem('kingdom.sound', enabled ? 'on' : 'off');
    if (!enabled) stopSound();
    updateToggle(); unlock(); if (enabled) sound('submit');
  });
  function show(events) {
    clearTimeout(timer);
    if (!events.length) return;
    const priorities = { victory: 100, breached: 90, blocked: 90, success: 70, failure: 70, dawn: 60, royal: 50, loss: 45, craft: 40, trade: 40, gain: 40, notice: 30, turn: 20, submit: 10 };
    const event = [...events].sort((a, b) => (priorities[b.effect] || 0) - (priorities[a.effect] || 0))[0];
    const kind = Object.hasOwn(themes, event.effect) ? event.effect : 'notice';
    const [icon, title] = themes[kind];
    const message = e => e.details?.kind === 'hand' ? `${e.details.name}님의 손패 ${e.details.cardTypes.length}장을 확인했습니다. 비밀 기록에서 확인하세요.` : e.text;
    const texts = [...new Set([message(event), ...events.filter(e => e !== event).slice(-2).map(message)])];
    panel.className = `action-effect effect-${kind}`;
    panel.innerHTML = `<div class="effect-seal">${icon}</div><div><span class="eyebrow">${events.some(e => e.private) ? 'PRIVATE · 나에게만 표시' : 'KINGDOM EVENT'}</span><h2>${title}</h2><p>${texts.map(t => escape(t.length > 260 ? `${t.slice(0, 260)}…` : t)).join('<br>')}</p></div><button type="button" class="icon-button" aria-label="효과 알림 닫기">✕</button>`;
    panel.hidden = false;
    panel.querySelector('button').onclick = () => { clearTimeout(timer); panel.hidden = true; };
    panel.getAnimations().forEach(animation => animation.cancel());
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) panel.animate([{ opacity: .5, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 160 });
    const important = ['blocked', 'breached', 'victory'].includes(kind);
    sound(kind, important);
    timer = setTimeout(() => { panel.hidden = true; }, important ? 3600 : 1600);
  }
  window.kingdomEffects = {
    handle(previous, current) {
      if (!previous || previous.code !== current.code || current.status === 'lobby') {
        clearTimeout(timer); stopSound(); panel.hidden = true; return;
      }
      const known = new Set([...(previous.game?.logs || []), ...previous.me.notes].map(e => e.id));
      const publicEvents = (current.game?.logs || []).filter(e => e.effect && !known.has(e.id));
      const privateEvents = current.me.notes.filter(e => !known.has(e.id)).map(e => ({ ...e, private: true }));
      const events = [...publicEvents, ...privateEvents];
      if (current.game?.current === current.me.id && previous.game?.current !== current.me.id) {
        events.push({ effect: 'turn', text: `낮 ${current.game.round}번째 바퀴의 행동을 선택하세요.`, private: true });
      }
      // 큐 없이 최신 상태의 결과를 표시합니다. 빠른 연속 행동에도 밀리지 않습니다.
      show(events);
    }
  };
  updateToggle();
})();
