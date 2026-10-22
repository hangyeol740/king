(() => {
 const clips={receive:new Audio('/assets/card-receive.mp3'),scroll:new Audio('/assets/card-scroll.mp3'),hover:new Audio('/assets/card-hover.mp3')};
 const volumes={receive:.55,scroll:.12,hover:.35};
 for(const [kind,clip] of Object.entries(clips)){clip.preload='auto';clip.volume=volumes[kind];clip.loop=false;}
 let lastScroll=-Infinity;
 window.kingdomCardAudio={play(kind){
  if(localStorage.getItem('kingdom.sound')==='off'||document.hidden)return;
  const clip=clips[kind];if(!clip)return;
  if(kind==='scroll'){const now=performance.now();if(now-lastScroll<280||!clip.paused)return;lastScroll=now;}
  else if(kind==='hover'){clips.hover.pause();}
  clip.currentTime=0;clip.play().catch(()=>{});
 },stop(){for(const clip of Object.values(clips)){clip.pause();clip.currentTime=0;}}};
})();
