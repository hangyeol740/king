(() => {
  const audio=new Audio('/assets/background-music.mp3');
  audio.loop=false;audio.volume=.18;
  let enabled=localStorage.getItem('kingdom.music')!=='off',playingGame=false,restart=null;
  const button=document.createElement('button');button.className='quiet';
  const updateButton=()=>{button.textContent=enabled?'배경음악 켜짐 ♫':'배경음악 꺼짐';button.setAttribute('aria-pressed',String(enabled));};
  const play=()=>{if(enabled&&playingGame&&restart===null&&audio.paused)audio.play().catch(()=>{});};
  const stop=()=>{clearTimeout(restart);restart=null;audio.pause();audio.currentTime=0;};
  audio.addEventListener('ended',()=>{if(!enabled||!playingGame)return;restart=setTimeout(()=>{restart=null;audio.currentTime=0;play();},8000);});
  window.kingdomMusic={update(status){const active=status==='playing';if(active===playingGame)return;playingGame=active;if(active)play();else stop();}};
  button.onclick=()=>{enabled=!enabled;localStorage.setItem('kingdom.music',enabled?'on':'off');if(enabled)play();else stop();updateButton();};
  document.querySelector('.top-actions')?.append(button);updateButton();
  document.addEventListener('pointerdown',play,{passive:true});
  document.addEventListener('keydown',play);
})();
