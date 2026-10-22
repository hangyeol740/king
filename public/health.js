(() => {
 function update(){
  if(typeof state==='undefined'||!state?.game||state.status==='lobby'||state.me.spectator||state.device&&!state.device.active)return;
  const heading=document.querySelector('.game-heading');if(!heading)return;
  let marker=heading.querySelector('.health-markers');
  if(!marker){marker=document.createElement('div');marker.className='health-markers';marker.setAttribute('role','status');heading.firstElementChild.append(marker);}
  const max=state.me.maxHealth??(state.me.role==='king'?5:3),health=state.me.health??max;
  marker.setAttribute('aria-label',`내 체력 ${health}/${max}`);
  marker.innerHTML=`<span>체력</span><span class="health-hearts" aria-hidden="true">${Array.from({length:max},(_,i)=>`<i class="${i<health?'filled':''}">♥</i>`).join('')}</span><strong>${health} / ${max}</strong>`;
 }
 new MutationObserver(update).observe(document.querySelector('#app'),{childList:true});
 update();
})();
