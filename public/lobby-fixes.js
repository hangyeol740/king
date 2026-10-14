window.finishLobbyUI=()=>{
 if(!state)return;
 if(state.mode==='offline'){
  document.querySelectorAll('.sidebar-foot,.invite-box').forEach(e=>e.remove());
  const heading=document.querySelector('.game-heading .eyebrow');if(heading)heading.textContent='오프라인 게임';
 }
 if(state.status!=='lobby')return;
 const isHost=state.host===state.me.id;
 document.querySelectorAll('.lobby-seat').forEach((seat,i)=>{
   const p=state.players[i];if(!p?.bot)return;
   const select=document.createElement('select');select.setAttribute('aria-label',`${p.name} 난이도`);select.disabled=!isHost;
   for(const [value,label] of Object.entries({veryEasy:'매우쉬움',easy:'쉬움',normal:'보통',hard:'어려움',frenzy:'광란',chaos:'혼돈'})){const option=document.createElement('option');option.value=value;option.textContent=label;option.selected=value===(p.difficulty||'normal');select.append(option);}
   select.onchange=()=>command({type:'botDifficulty',target:p.id,difficulty:select.value});seat.querySelector('b')?.after(select);
 });
 if(state.mode==='offline'&&state.device){
  document.querySelectorAll('[data-cmd="removeLocalPlayer"]').forEach(b=>{b.dataset.targetId=b.dataset.botTarget;});
 }
 if(state.mode!=='offline'){
  const seats=document.querySelector('.lobby-seats');
  if(seats){
   if(isHost)state.players.filter(p=>p.id!==state.host&&!p.bot).forEach(p=>{const button=document.createElement('button');button.className='quiet';button.textContent=`${p.name} → 관전자`;button.dataset.cmd='toSpectator';button.dataset.targetId=p.id;seats.append(button);});
   const section=document.createElement('section');section.className='lobby-spectators';section.innerHTML=`<h3>관전자 ${(state.spectators||[]).length}명</h3>${(state.spectators||[]).map(p=>`<div class="lobby-seat"><b>${esc(p.name)}</b>${isHost?`<button class="secondary" data-cmd="toPlayer" data-target-id="${p.id}">참가자로 이동</button>`:''}</div>`).join('')||'<p class="muted">관전자 없음</p>'}`;seats.after(section);
  }
  document.querySelector('.spectators-list')?.remove();
 }
};
