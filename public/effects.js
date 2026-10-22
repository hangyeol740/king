/* 개인 효과는 서버가 본인에게 보낸 notes만 사용합니다. */
(() => {
  const panel = document.querySelector('#action-effect');
  const toggle = document.querySelector('#sound-toggle');
  let enabled = localStorage.getItem('kingdom.sound') !== 'off';
  // 알람 설정: 각 채널별로 알림 켜기/끄기 (localStorage에 저장)
  const alarmChannels = {
    public: localStorage.getItem('kingdom.alarm.public') !== 'false',
    pair: localStorage.getItem('kingdom.alarm.pair') !== 'false'
  };
  // 비밀방 개별 설정: 최대 3개까지 지원, basic는 basic2, basic3으로 저장
  for (let i = 1; i <= 3; i++) {
    const val = localStorage.getItem(`kingdom.alarm.secret${i}`);
    if (val !== null) alarmChannels[`secret${i}`] = val !== 'false';
  }
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
    stolen: ['⚑', '카드를 빼앗겼습니다!', [196, 147, 110]],
    victory: ['♛', '승패가 결정되었습니다', [262, 330, 392, 523, 659]],
    submit: ['✓', '제출 완료', [440, 554]],
    turn: ['◉', '당신의 차례입니다', [523, 698]],
    notice: ['◈', '나의 행동 결과', [440, 523]],
    cardHover: ['◇', '카드 확인', [660]],
    cardFlip: ['◇', '카드 넘김', [740, 660, 554]],
    cardClick: ['◇', '카드 선택', [310, 260]]
  };
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
  const interactionTimes = {};
  const interactionVoices=new Set();
  let interactionBusyUntil=0;
  function stopInteractions(){
    for(const source of interactionVoices){try{source.stop();}catch{}}
    interactionVoices.clear();
  }
  function paperSound(kind) {
    if(!enabled || document.hidden)return;
    unlock();
    if(!audio || audio.state!=='running')return;
    const now=performance.now(),interval=kind==='flip'?140:kind==='hover'?90:35;
    if(kind==='hover'&&now<interactionBusyUntil)return;
    if(now-(interactionTimes[kind]??-Infinity)<interval)return;
    interactionTimes[kind]=now;
    stopInteractions();
    interactionBusyUntil=now+(kind==='flip'?350:kind==='click'?100:60);
    const pulses=kind==='flip'?5:kind==='click'?2:1;
    for(let i=0;i<pulses;i++){
      const duration=kind==='flip'?.055:kind==='click'?.018:.045;
      const buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate);
      const data=buffer.getChannelData(0);
      for(let j=0;j<data.length;j++)data[j]=(Math.random()*2-1)*Math.pow(1-j/data.length,1.6);
      const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();
      source.buffer=buffer;filter.type='bandpass';filter.frequency.value=kind==='click'?2400:kind==='flip'?1400+i*220:1800;
      filter.Q.value=.65;gain.gain.value=kind==='flip'?.16:kind==='click'?.22:.07;
      source.connect(filter);filter.connect(gain);gain.connect(audio.destination);voices.add(source);interactionVoices.add(source);
      source.onended=()=>{voices.delete(source);interactionVoices.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};
      source.start(audio.currentTime+i*(kind==='flip'?.028:.022));
    }
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(button&&!button.disabled&&button!==toggle)paperSound('click');
  },true);
  function stopSound() {
    for (const oscillator of voices) { try { oscillator.stop(); } catch {} }
  }
  function sound(kind, important = false) {
    if (!enabled || !audio || audio.state !== 'running' || document.hidden) return;
    const now = performance.now();
    if (!important && now - lastSoundAt < 70) return;
    lastSoundAt = now;
    stopSound();
    const frequencies = (themes[kind] || themes.notice)[2];
    frequencies.forEach((frequency, index) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      const start = audio.currentTime + index * .065;
      oscillator.type = ['breached', 'failure', 'loss', 'stolen'].includes(kind) ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(kind === 'notice' ? .055 : .065, start + .015);
      gain.gain.exponentialRampToValueAtTime(.001, start + .14);
      oscillator.connect(gain); gain.connect(audio.destination); voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start); oscillator.stop(start + .16);
    });
  }
  toggle.addEventListener('click', () => {
    enabled = !enabled; localStorage.setItem('kingdom.sound', enabled ? 'on' : 'off');
    if (!enabled) {stopSound();window.kingdomCardAudio?.stop();}
    updateToggle(); unlock(); if (enabled) sound('submit');
  });
  const alarmTogglePublic = document.querySelector('#alarm-toggle-public');
  const alarmTogglePair = document.querySelector('#alarm-toggle-pair');
  const alarmToggleSecret = document.querySelector('#alarm-toggle-secret');
  function updateAlarmButton(button, key) {
    const isOn = alarmChannels[key];
    button.textContent = isOn ? '알림 끔' : '알림 켜짐';
    button.setAttribute('aria-pressed', String(isOn));
  }
  if (alarmTogglePublic) {
    alarmTogglePublic.addEventListener('click', () => {
      alarmChannels.public = !alarmChannels.public;
      localStorage.setItem('kingdom.alarm.public', alarmChannels.public ? 'on' : 'false');
      updateAlarmButton(alarmTogglePublic, 'public');
    });
    updateAlarmButton(alarmTogglePublic, 'public');
  }
  if (alarmTogglePair) {
    alarmTogglePair.addEventListener('click', () => {
      alarmChannels.pair = !alarmChannels.pair;
      localStorage.setItem('kingdom.alarm.pair', alarmChannels.pair ? 'on' : 'false');
      updateAlarmButton(alarmTogglePair, 'pair');
    });
    updateAlarmButton(alarmTogglePair, 'pair');
  }
  if (alarmToggleSecret) {
    let secretEnabled = false;
    for (let i = 1; i <= 3; i++) {
      if (alarmChannels[`secret${i}`]) secretEnabled = true;
    }
    alarmToggleSecret.textContent = secretEnabled ? '알림 끔' : '알림 켜짐';
    alarmToggleSecret.setAttribute('aria-pressed', String(secretEnabled));
    alarmToggleSecret.addEventListener('click', () => {
      for (let i = 1; i <= 3; i++) {
        alarmChannels[`secret${i}`] = !alarmChannels[`secret${i}`];
        localStorage.setItem(`kingdom.alarm.secret${i}`, alarmChannels[`secret${i}`] ? 'on' : 'false');
      }
      let secretEnabled = false;
      for (let i = 1; i <= 3; i++) {
        if (alarmChannels[`secret${i}`]) secretEnabled = true;
      }
      alarmToggleSecret.textContent = secretEnabled ? '알림 끔' : '알림 켜짐';
      alarmToggleSecret.setAttribute('aria-pressed', String(secretEnabled));
    });
  }
   const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function show(events) {
    if (!events.length) return;
    clearTimeout(timer);
    const priorities = { victory: 100, breached: 90, blocked: 90, stolen: 80, success: 70, failure: 70, dawn: 60, royal: 50, loss: 45, craft: 40, trade: 40, gain: 40, notice: 30, turn: 20, submit: 10 };
    const event = [...events].sort((a, b) => (priorities[b.effect] || 0) - (priorities[a.effect] || 0))[0];
    const kind = Object.hasOwn(themes, event.effect) ? event.effect : 'notice';
    const [icon, title] = themes[kind];
    const message = e => e.details?.kind === 'hand' ? `${e.details.name}님의 손패 ${e.details.cardTypes.length}장을 확인했습니다. 비밀 기록에서 확인하세요.` : e.text;
    const texts = [...new Set([message(event), ...events.filter(e => e !== event).slice(-2).map(message)])];
    panel.className = `action-effect effect-${kind}`;
    panel.innerHTML = `<div class="effect-seal">${icon}</div><div><span class="eyebrow">${events.some(e => e.private) ? 'PRIVATE · 나에게만 표시' : 'KINGDOM EVENT'}</span><h2>${title}</h2><p>${texts.map(t => escapeHTML(t.length > 260 ? `${t.slice(0, 260)}…` : t)).join('<br>')}</p></div><button type="button" class="icon-button" aria-label="효과 알림 닫기">✕</button>`;
    panel.hidden = false;
    panel.querySelector('button').onclick = () => { clearTimeout(timer); panel.hidden = true; };
    panel.getAnimations().forEach(animation => animation.cancel());
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) panel.animate([{ opacity: .5, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 160 });
    const important = ['blocked', 'breached', 'victory', 'stolen'].includes(kind);
    sound(kind, important);
    timer = setTimeout(() => { panel.hidden = true; }, important ? 3600 : 1600);
  }
  window.kingdomEffects = {
    chatSound() { sound('notice'); },
    cardHover() { window.kingdomCardAudio?.play('hover'); },
    cardFlip() { window.kingdomCardAudio?.play('scroll'); },
    cardClick() { paperSound('click'); },
    handle(previous, current) {
      if(current.status==='playing'&&current.me?.hand?.length){
        const sameSeat=previous?.code===current.code&&previous?.me?.id===current.me.id;
        const knownCards=new Set(sameSeat?(previous.me.hand||[]).map(c=>c.id):[]);
        if(current.me.hand.some(c=>!knownCards.has(c.id)))window.kingdomCardAudio?.play('receive');
      }
      if (!previous || previous.code !== current.code || current.status === 'lobby') {
        clearTimeout(timer); if(current.status!=='playing')stopSound(); panel.hidden = true; return;
      }
      const known = new Set([...(previous.game?.logs || []), ...previous.me.notes].map(e => e.id));
      const publicEvents = (current.game?.logs || []).filter(e => e.effect && !known.has(e.id));
      const privateEvents = current.me.notes.filter(e => !known.has(e.id)).map(e => ({ ...e, private: true }));
      const events = [...publicEvents, ...privateEvents];
      if (current.game?.current === current.me.id && previous.game?.current !== current.me.id) {
        events.push({ effect: 'turn', text: `낮 ${current.game.round}번째 바퀴의 행동을 선택하세요.`, private: true });
      }
      // 알림 처리 - 채널별 알림 설정 확인
      if (alarmChannels.public && events.some(e => e.channel === 'public')) {
        sound('notice', true);
      }
      if (alarmChannels.pair && events.some(e => e.channel === 'pair')) {
        sound('notice', true);
      }
      for (let i = 1; i <= 3; i++) {
        if (alarmChannels[`secret${i}`] && events.some(e => e.channel === `secret${i}`)) {
          sound('notice', true);
        }
      }
      // 큐 없이 최신 상태의 결과를 표시합니다. 빠른 연속 행동에도 밀리지 않습니다.
      show(events);
    }
  };
  updateToggle();
})();
