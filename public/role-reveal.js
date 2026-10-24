(() => {
 let overlay=null,timer=null;
 const startSound=new Audio('/assets/game-start.mp3');
 startSound.preload='auto';startSound.volume=.5;startSound.loop=false;
 const stopSound=()=>{startSound.pause();startSound.currentTime=0;};
 document.querySelector('#sound-toggle')?.addEventListener('click',()=>{if(localStorage.getItem('kingdom.sound')==='off')stopSound();});
 const seen=new Set();
 const hide=()=>{clearTimeout(timer);overlay?.remove();overlay=null;};
 window.kingdomRoleReveal={hide,show(s){
  if(s.status==='lobby'){hide();stopSound();seen.clear();return;}
  if(s.device){hide();stopSound();return;}
  if(s.status!=='playing'||s.me.spectator||s.device&&!s.device.active){hide();stopSound();return;}
  const key=`${s.code}/${s.game.startedAt||s.game.instanceId||'current'}/${s.me.id}`;
  if(seen.has(key))return;seen.add(key);hide();
  const roles={king:'왕',citizen:'시민',rebel:'반란군',neutral:'중립'},jobs={werewolf:'늑대인간',watcher:'감시자',bomber:'폭탄광',assassin:'암살자',hunter:'사냥꾼',blacksmith:'대장장이',bishop:'주교',merchant:'상인'};
   overlay=document.createElement('section');overlay.className='role-reveal role-'+s.me.role+(s.me.job?' role-'+s.me.job:'');overlay.setAttribute('role','status');overlay.setAttribute('aria-label','나의 역할');
  const label=document.createElement('p');label.textContent='당신의 역할';
  const title=document.createElement('h1');title.textContent=jobs[s.me.job]||roles[s.me.role]||'참가자';
  const faction=document.createElement('p');faction.textContent=jobs[s.me.job]?roles[s.me.role]:'';
  overlay.append(label,title,faction);document.body.append(overlay);
  stopSound();
  if(localStorage.getItem('kingdom.sound')!=='off')startSound.play().catch(()=>{});
  timer=setTimeout(hide,3400);
 }};
})();
