/* 개인 효과는 서버가 본인에게 보낸 notes만 사용합니다. */
(() => {
  const panel = document.querySelector('#action-effect');
  const toggle = document.querySelector('#sound-toggle');
  let enabled = localStorage.getItem('kingdom.sound') !== 'off';
  let audio, timer, queue = [], playing = false;
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
  function sound(kind) {
    if (!enabled || !audio || audio.state !== 'running' || document.hidden) return;
    const frequencies = (themes[kind] || themes.notice)[2];
    frequencies.forEach((frequency, index) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      const start = audio.currentTime + index * .105;
      oscillator.type = ['breached', 'failure', 'loss'].includes(kind) ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(.065, start + .015);
      gain.gain.exponentialRampToValueAtTime(.001, start + .24);
      oscillator.connect(gain); gain.connect(audio.destination); voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start); oscillator.stop(start + .26);
    });
  }
  toggle.addEventListener('click', () => {
    enabled = !enabled; localStorage.setItem('kingdom.sound', enabled ? 'on' : 'off');
    if (!enabled) for (const oscillator of voices) { try { oscillator.stop(); } catch {} }
    updateToggle(); unlock(); if (enabled) sound('submit');
  });
  function nextEffect() {
    clearTimeout(timer);
    const event = queue.shift();
    if (!event) { playing = false; panel.hidden = true; return; }
    playing = true;
    const kind = Object.hasOwn(themes, event.effect) ? event.effect : 'notice';
    const [icon, title] = themes[kind];
    panel.className = `action-effect effect-${kind}`;
    panel.innerHTML = `<div class="effect-seal">${icon}</div><div><span class="eyebrow">${event.private ? 'PRIVATE · 나에게만 표시' : 'KINGDOM EVENT'}</span><h2>${title}</h2><p>${escape(event.text)}</p></div><button type="button" class="icon-button" aria-label="효과 알림 닫기">✕</button>`;
    panel.hidden = false;
    panel.querySelector('button').onclick = nextEffect;
    sound(kind);
    timer = setTimeout(nextEffect, ['blocked', 'breached', 'victory'].includes(kind) ? 4800 : 2700);
  }
  window.kingdomEffects = {
    handle(previous, current) {
      if (!previous || previous.code !== current.code || current.status === 'lobby') {
        queue = []; clearTimeout(timer); playing = false; panel.hidden = true; return;
      }
      const known = new Set([...(previous.game?.logs || []), ...previous.me.notes].map(e => e.id));
      const publicEvents = (current.game?.logs || []).filter(e => e.effect && !known.has(e.id));
      const privateEvents = current.me.notes.filter(e => !known.has(e.id)).map(e => ({ ...e, private: true }));
      if (publicEvents.some(e => ['blocked', 'breached', 'victory', 'dawn'].includes(e.effect))) {
        // 반란 결과와 아침 공개는 이전 행동 알림보다 먼저 보여줍니다.
        queue = []; clearTimeout(timer); playing = false;
      }
      // 같은 업데이트의 공개 결과와 개인 수령을 순서대로 표시합니다.
      queue.push(...publicEvents, ...privateEvents.slice(-2));
      if (current.game?.current === current.me.id && previous.game?.current !== current.me.id) {
        queue.push({ effect: 'turn', text: `낮 ${current.game.round}번째 바퀴의 행동을 선택하세요.`, private: true });
      }
      if (queue.length > 8) queue = queue.slice(-8);
      if (!playing) nextEffect();
    }
  };
  updateToggle();
})();
