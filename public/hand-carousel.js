/* Native horizontal scrolling: touch inertia, trackpad and wheel support. */
(() => {
  const initialized=new WeakSet();
  const userScrollUntil=new WeakMap();
  const scrollSamples=new WeakMap();
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
    for(const card of cards){
      const count=Number(card.dataset.cardCount)||1;
      const layers=Math.min(3,count);
      card.dataset.stackCount=String(layers);
      const stack=document.createElement('span');stack.className='card-stack';stack.setAttribute('aria-hidden','true');
      for(let i=layers-1;i>=1;i--){
        const layer=document.createElement('span');layer.className='card-stack-layer';layer.style.setProperty('--layer',i);layer.style.zIndex=String(-i);stack.append(layer);
      }
      card.prepend(stack);
    }
    const copies=()=>cards.map(card=>{const clone=card.cloneNode(true);clone.dataset.loopCopy='true';return clone;});
    hand.prepend(...copies());hand.append(...copies());
    const cycle=cards.length*cardStep(hand);
    hand.scrollLeft=previous===null?cycle:previous;
    scrollSamples.set(hand,hand.scrollLeft);
    const normalize=()=>{
      const width=cards.length*cardStep(hand);
      if(hand.scrollLeft<width*.5){hand.scrollLeft+=width;scrollSamples.set(hand,hand.scrollLeft);}
      else if(hand.scrollLeft>width*1.5){hand.scrollLeft-=width;scrollSamples.set(hand,hand.scrollLeft);}
    };
    hand.addEventListener('scroll',normalize,{passive:true});
    hand.addEventListener('keydown',e=>{if(e.key==='Tab')normalize();});
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
    const delta=event.deltaY*(event.deltaMode===1?20:event.deltaMode===2?hand.clientWidth:1);
    if(delta<0&&hand.scrollLeft<=0 || delta>0&&hand.scrollLeft>=hand.scrollWidth-hand.clientWidth-1)return;
    event.preventDefault();
    hand.scrollBy({left:delta,behavior:'smooth'});
  },{passive:false});
  document.addEventListener('pointerdown',event=>{
    const hand=event.target.closest('.hand-grid');
    if(hand&&event.pointerType==='touch')markScroll(hand);
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
