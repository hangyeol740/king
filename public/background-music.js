(() => {
  const audio=new Audio('/assets/background-music.mp3');
  audio.loop=true;audio.volume=.18;
  let enabled=localStorage.getItem('kingdom.music')!=='off';
  const button=document.createElement('button');button.className='quiet';
  const update=()=>{button.textContent=enabled?'배경음악 켜짐 ♫':'배경음악 꺼짐';button.setAttribute('aria-pressed',String(enabled));};
  const play=()=>{if(enabled)audio.play().catch(()=>{});};
  button.onclick=()=>{enabled=!enabled;localStorage.setItem('kingdom.music',enabled?'on':'off');if(enabled)play();else audio.pause();update();};
  document.querySelector('.top-actions')?.append(button);update();
  document.addEventListener('pointerdown',play,{once:true});
  document.addEventListener('keydown',play,{once:true});
})();
