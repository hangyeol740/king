/* Native horizontal scrolling: touch inertia, trackpad and wheel support. */
(() => {
  const initialized=new WeakSet();
  const userScrollUntil=new WeakMap();
  const scrollSamples=new WeakMap();
  const motions=new WeakMap();
  const maxScroll=hand=>{const last=hand.lastElementChild;if(!last)return 0;return Math.max(0,last.offsetLeft+last.offsetWidth+(parseFloat(getComputedStyle(hand).paddingRight)||0)-hand.clientWidth);};
  const stopMotion=hand=>{const motion=motions.get(hand);if(motion?.frame)cancelAnimationFrame(motion.frame);if(motion){motion.frame=null;motion.target=hand.scrollLeft;}};
  let hoverMutedUntil=0;
  const markScroll=hand=>{
    const until=performance.now()+700;
    userScrollUntil.set(hand,until);
    hoverMutedUntil=until;
  };
  window.kingdomHandCarousel={init(hand,previous){
    if(initialized.has(hand))return;
    const cards=[...hand.children];
    if(!cards.length||!cards[0].matches('.card'))return;
     initialized.add(hand);
      // Native :hover follows the pointer. Do not persist synthetic hover
      // classes across rerenders or after wheel-scrolling to another card.
     hand.scrollLeft=previous===null?0:previous;
    scrollSamples.set(hand,hand.scrollLeft);
     // Do not teleport scrollLeft across repeated sets: it reverses visible
     // direction and interrupts wheel/touch momentum.
  }};
  let scrolling = false, lastFlipAt = 0;
  const cardStep = hand => (hand.querySelector('.card')?.offsetWidth || 180) + (parseFloat(getComputedStyle(hand).gap)||24);
  function soundFlip(hand) {
    const now = performance.now();
    if(now>(userScrollUntil.get(hand)||0)){scrollSamples.set(hand,hand.scrollLeft);return;}
    if(now-lastFlipAt < 240)return;
    if(Math.abs(hand.scrollLeft-(scrollSamples.get(hand)??hand.scrollLeft)) < 18)return;
    lastFlipAt = now;
    scrollSamples.set(hand,hand.scrollLeft);
    window.kingdomEffects?.cardFlip();
  }
  document.addEventListener('wheel', event => {
    const hand = event.target.closest('.hand-grid');
    if(hand&&!event.ctrlKey)markScroll(hand);
    if(!hand || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || hand.scrollWidth <= hand.clientWidth)return;
    const rawDelta=event.deltaY*(event.deltaMode===1?20:event.deltaMode===2?hand.clientWidth:1);
    const delta=Math.sign(rawDelta)*Math.min(Math.abs(rawDelta)*.35,52);
    if(delta<0&&hand.scrollLeft<=0 || delta>0&&hand.scrollLeft>=maxScroll(hand)-1){stopMotion(hand);return;}
    event.preventDefault();
     let motion=motions.get(hand);if(!motion){motion={target:hand.scrollLeft,frame:null,last:0};motions.set(hand,motion);}else if(!motion.frame)motion.target=hand.scrollLeft;
     if(motion.frame&&Math.sign(delta)!==Math.sign(motion.target-hand.scrollLeft))motion.target=hand.scrollLeft;
      motion.target=Math.max(0,Math.min(maxScroll(hand),motion.target+delta));motion.until=performance.now()+320;
      if(!motion.frame){motion.last=performance.now();const step=now=>{if(!hand.isConnected){stopMotion(hand);return;}const dt=Math.min(40,now-motion.last);motion.last=now;motion.target=Math.max(0,Math.min(maxScroll(hand),motion.target));const before=hand.scrollLeft,distance=motion.target-before;if(Math.abs(distance)<=1||now>=motion.until){hand.scrollLeft=motion.target;motion.frame=null;return;}hand.scrollLeft=before+distance*(1-Math.exp(-dt/65));if(Math.abs(hand.scrollLeft-before)<.1){hand.scrollLeft=motion.target;motion.frame=null;return;}motion.frame=requestAnimationFrame(step);};motion.frame=requestAnimationFrame(step);}
  },{passive:false});
  document.addEventListener('pointerdown',event=>{
    const hand=event.target.closest('.hand-grid');
    if(hand){stopMotion(hand);if(event.pointerType==='touch')markScroll(hand);}
  },{passive:true});
  document.addEventListener('touchmove',event=>{
    const hand=event.target.closest('.hand-grid');
    if(hand)markScroll(hand);
  },{passive:true});
  document.addEventListener('scroll', event => {
    const hand = event.target;
    if(!hand.matches?.('.hand-grid'))return;
    if(performance.now()<(userScrollUntil.get(hand)||0))hoverMutedUntil=performance.now()+350;
    if(!scrolling){scrolling=true;requestAnimationFrame(()=>{soundFlip(hand);scrolling=false;});}
  },true);
  // Hover transforms and DOM replacement can repeatedly fire pointerover under
  // a stationary pointer. Only a real pointer move to a different card plays.
  let hoveredCardKey=null,lastPointer=null,lastHoverSoundAt=-Infinity;
  document.addEventListener('pointermove', event => {
    if(event.pointerType==='touch')return;
    const moved=!lastPointer||Math.hypot(event.clientX-lastPointer.x,event.clientY-lastPointer.y)>=3;
    if(!moved)return;
    lastPointer={x:event.clientX,y:event.clientY};
    const card=event.target.closest('.hand-grid .card');
    if(!card){hoveredCardKey=null;return;}
    const key=card.querySelector('.full-card-image')?.getAttribute('src')||card.querySelector('h3')?.textContent;
    if(performance.now()<hoverMutedUntil){hoveredCardKey=key;return;}
    if(key===hoveredCardKey)return;
    hoveredCardKey=key;
    const now=performance.now();
    if(now-lastHoverSoundAt<300)return;
    lastHoverSoundAt=now;
    window.kingdomEffects?.cardHover();
  },{passive:true});
  document.addEventListener('keydown',event=>{
    if(!event.target.matches('.hand-grid')||!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();
    const hand=event.target;
    markScroll(hand);
    hand.scrollBy({left:cardStep(hand)*(event.key==='ArrowLeft'?-1:1),behavior:'smooth'});
  });
})();
