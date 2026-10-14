(() => {
  const key = channel => `kingdom.chatAlert.${channel}`;
  const isOn = channel => localStorage.getItem(key(channel)) !== 'off';
  window.kingdomChatAlerts = {
    button(channel) {
      return `<button type="button" class="quiet chat-alert-toggle" data-chat-alert="${channel}" aria-pressed="${isOn(channel)}">알람 ${isOn(channel) ? '켜짐' : '꺼짐'}</button>`;
    },
    handle(previous, current) {
      if (!previous || previous.code !== current.code || previous.me.id !== current.me.id || !previous.chat || !current.chat) return;
      const before = previous.chat, after = current.chat;
      let notify = false;
      const knownRequests=new Set((before.incoming||[]).map(r=>r.id));
      const incoming=(after.incoming||[]).filter(r=>!knownRequests.has(r.id));
      if(incoming.length&&isOn('pair')){
        const panel=document.querySelector('#pair-request-alert');
        panel.replaceChildren();
        const heading=document.createElement('h2');heading.textContent='새로운 1대1 채팅 신청';panel.append(heading);
        const text=document.createElement('p');text.textContent='익명의 플레이어가 대화를 신청했습니다.';panel.append(text);
        for(const request of incoming){
          const row=document.createElement('div');row.className='button-row';
          for(const accept of [true,false]){
            const button=document.createElement('button');button.type='button';button.className=accept?'primary':'secondary';button.textContent=accept?'수락':'거절';
            button.onclick=async()=>{if(await command({type:'pairAnswer',request:request.id,accept}))panel.hidden=true;};row.append(button);
          }
          panel.append(row);
        }
        panel.dataset.request=incoming[0].id;panel.hidden=false;notify=true;
      }
      const requestPanel=document.querySelector('#pair-request-alert');
      if(requestPanel&&!after.incoming?.some(r=>r.id===requestPanel.dataset.request))requestPanel.hidden=true;
      if (after.pair && before.pair?.id !== after.pair.id && isOn('pair')) {
        toast('1대1 채팅방이 매칭되었습니다.'); notify = true;
      }
      const changed = (channel, oldList, list) => {
        if (!oldList || !list || !isOn(channel)) return;
        const known = new Set(oldList.map(m => m.id));
        if (list.some(m => !known.has(m.id) && !m.mine)) notify = true;
      };
      changed('public', before.public, after.public);
      changed('rebel', before.rebel, after.rebel);
      changed('spectator', before.spectator, after.spectator);
      if (before.pair?.id === after.pair?.id) changed('pair', before.pair?.messages, after.pair?.messages);
      for (const room of after.secret || []) changed(`secret:${room.id}`, before.secret?.find(r => r.id === room.id && r.joined)?.messages, room.messages);
      if (notify) window.kingdomEffects?.chatSound();
    }
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-chat-alert]');
    if (!button) return;
    const channel = button.dataset.chatAlert;
    localStorage.setItem(key(channel), isOn(channel) ? 'off' : 'on');
    button.textContent = `알람 ${isOn(channel) ? '켜짐' : '꺼짐'}`;
    button.setAttribute('aria-pressed', String(isOn(channel)));
  });
})();
