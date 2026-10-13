let shopStockId = null, shopQuantity = 1;
let merchantTab = 'display';
function suggestPayment() {
  const item=selectedShopItem();if(!item)return;
  const eligible=state.me.hand.filter(c=>!religionCard(c.type)||state.me.job==='bishop');
  const priority=c=>c.type==='resource'?0:rules.cards[c.type].permanent?100:religionCard(c.type)?80:(rules.cards[c.type].attack||rules.cards[c.type].mediation||rules.cards[c.type].revolt||1);
  selected=new Set([...eligible].sort((a,b)=>priority(a)-priority(b)).slice(0,item.price*shopQuantity).map(c=>c.id));
}
function renderPaymentPicker() {
  const required=selectedShopItem().price*shopQuantity;
  return `<div class="payment-picker"><h3>지불 카드 · ${selected.size}/${required}장</h3><p>자원을 우선해 제안했습니다. 아래에서 지불 종류를 바꾸세요. 선택한 카드는 사라집니다.</p>${Object.entries(rules.cards).filter(([type])=>state.me.hand.some(c=>c.type===type)&&(!religionCard(type)||state.me.job==='bishop')).map(([type,def])=>{const cards=state.me.hand.filter(c=>c.type===type),count=cards.filter(c=>selected.has(c.id)).length;return `<div class="payment-row"><span>${def.icon} ${def.name} <small>보유 ${cards.length}</small></span><button data-ui="minusCard" data-card="${type}" ${count?'':'disabled'} aria-label="${def.name} 지불 줄이기">−</button><b>${count}</b><button data-ui="plusCard" data-card="${type}" ${count===cards.length||selected.size>=required?'disabled':''} aria-label="${def.name} 지불 늘리기">＋</button></div>`;}).join('')}<button class="quiet" data-ui="suggestPayment">대금 자동 제안 다시 선택</button></div>`;
}
const merchantIcon = job => job === 'merchant' ? '◆' : job === 'bishop' ? '✝' : null;
function selectedShopItem() { return state.game.shop?.find(item => item.id === shopStockId); }
function marketSelection() {
  const item = selectedShopItem();
  return item ? { allowed: type => !religionCard(type) || state.me.job === 'bishop', exact: item.price * shopQuantity, label: '상점 구매 대금' } : null;
}
function renderShopShelf(selectable = false) {
  const shop = state.game?.shop;
  if (!shop) return '';
  return `<section class="shop-shelf"><div class="panel-heading"><h2>익명 상점</h2><span class="pill">${shop.length}/5종</span></div><p class="small muted">상인의 이름과 돈은 비공개입니다. 가격은 상품 1장당 지불할 카드 수입니다.</p><div class="shop-grid">${shop.map(item => `<article class="shop-item ${item.id === shopStockId ? 'chosen' : ''}"><span class="shop-icon">${rules.cards[item.type].icon}</span><h3>${rules.cards[item.type].name}</h3><p>재고 <b>${item.quantity}장</b></p><strong>가격 · 카드 ${item.price}장</strong>${selectable ? `<button class="secondary" data-ui="shopPick" data-stock="${item.id}">이 상품 구매 선택</button>` : ''}</article>`).join('') || '<p class="empty-shop">현재 진열된 상품이 없습니다.</p>'}</div></section>`;
}
function renderMarket() {
  const g = state.game, me = state.me;
  if (g.pending.myDone || me.job === 'merchant') return wait('상점 구매 완료를 기다립니다.', '모든 플레이어가 구매 완료를 누르면 원래 낮의 세 바퀴를 진행합니다.') + renderShopShelf();
  const item = selectedShopItem();
  return `<h2>익명 상점</h2><p class="action-description">상품 선택 → 수량 확인 → 구매. 대금은 자원부터 제안되며 직접 수정할 수 있습니다. 재고는 먼저 확정한 주문부터 판매됩니다.</p>${renderShopShelf(true)}${item ? `<section class="shop-checkout"><div class="checkout-header"><span>${rules.cards[item.type].icon}</span><div><h3>${rules.cards[item.type].name}</h3><p>1장 가격: 카드 ${item.price}장 · 재고 ${item.quantity}장</p></div></div><label for="shop-quantity">구매 수량</label><input id="shop-quantity" data-shop-quantity type="number" min="1" max="${item.quantity}" value="${shopQuantity}"><p class="checkout-total">상품 ${shopQuantity}장 ← 대금 카드 <b>${item.price*shopQuantity}장</b></p>${renderPaymentPicker()}<button class="primary full" data-cmd="marketBuy" data-cards="true" ${selected.size===item.price*shopQuantity?'':'disabled'}>${rules.cards[item.type].name} ${shopQuantity}장 구매 · 카드 ${item.price*shopQuantity}장 지불</button></section>` : ''}<button class="secondary full" data-cmd="marketDone">쇼핑 종료 · 구매 완료</button>`;
}
function renderMoneySupport() {
  const max = Math.floor((state.me.money || 0) / 2) * 2;
  return `<h2>상인의 돈으로 중재에 지원하세요.</h2><p class="action-description">두 종류의 반란 모두 카드 제출은 불가합니다. 돈 2점당 중재력 1점이며 사용한 돈은 소모됩니다. 지원하지 않으면 0점을 확정하세요.</p><label for="mediation-money">사용할 돈 · 보유 ${state.me.money}점</label><input id="mediation-money" type="number" min="0" max="${max}" step="2" value="0"><button class="primary" data-cmd="contribute" data-money="true">돈 중재 지원 확정</button>`;
}
function renderCrafting(doneLabel = '제작 완료 · 다음 차례 →') {
  return `<h2>필요한 만큼 제작하세요.</h2><p class="action-description">본인에게 허용된 제작법으로 반복 제작할 수 있습니다.${state.game.phase === 'merchantEvening' ? ' 저녁 제작창은 닫으면 다음 날 저녁까지 다시 열 수 없습니다. 닫은 뒤에도 다른 상인 행동은 계속할 수 있습니다.' : ''}</p><div class="recipes">${myRecipes().map(r => {
    const available=recipeAvailable(r,state.me.hand),i=r.id;
    return `<div class="recipe"><span>${rules.cards[r.output].icon}</span><div><b>${recipeMaterials(r)} → ${rules.cards[r.output].name} ${r.amount||1}장</b><small>${recipeLabel(r)} · 최대 ${available}회</small></div><input type="number" id="recipe-count-${i}" aria-label="${rules.cards[r.output].name} 제작 수량" value="1" min="1" max="${available||1}" ${available?'':'disabled'}><button class="secondary compact" data-cmd="craft" data-recipe="${i}" ${available?'':'disabled'}>제작</button></div>`;
  }).join('')}</div><button class="primary" data-cmd="craftDone">${doneLabel}</button>`;
}
function renderMerchantEvening() {
  const me=state.me,p=state.game.pending,options=rules.merchantBuys||{};
  if(me.job!=='merchant')return wait('저녁 준비가 진행 중입니다.', '상인의 준비가 끝나면 밤으로 넘어갑니다.');
  if(p.kind==='craft')return renderCrafting('저녁 제작창 종료 · 다른 상인 행동 계속');
  if(actionMode==='display')return `<h2>손패의 카드를 진열하세요.</h2><p class="action-description">최대 5종류·종류당 30장. 진열한 카드는 회수하거나 다른 종류로 교체할 수 없습니다. 기존 종류를 추가 진열하면 그 가격을 유지합니다.</p><label for="display-price">새 종류의 가격 · 상품 1장당 카드 1~5장</label><input id="display-price" type="number" min="1" max="5" value="1">${submitCards('displayGoods','진열 확정')}<button class="quiet" data-ui="cancelMode">상인 행동으로 돌아가기</button>`;
  let content='';
  if(merchantTab==='display')content=`${renderShopShelf()}<p>진열된 상품은 손패와 별도로 보관됩니다. 회수·종류 교체는 불가합니다.</p><button class="primary" data-ui="displayMode">손패에서 카드 진열하기</button>`;
  if(merchantTab==='price')content=`<section class="merchant-prices"><h3>상품 한 장당 가격</h3><p>지불 카드 1~5장으로 설정합니다.</p>${state.game.shop.map(item=>`<div><label for="price-${item.id}">${rules.cards[item.type].icon} ${rules.cards[item.type].name} · ${item.quantity}장</label><input id="price-${item.id}" aria-label="${rules.cards[item.type].name} 가격" type="number" min="1" max="5" value="${item.price}"><button class="secondary" data-cmd="changePrice" data-stock="${item.id}" data-price-input="price-${item.id}">가격 저장</button></div>`).join('')||'<p>먼저 상품을 진열하세요.</p>'}</section>`;
  if(merchantTab==='buy')content=`<section class="merchant-buy"><h3>돈으로 카드 구매</h3>${Object.entries(options).map(([product,option])=>{const max=Math.floor(me.money/option.cost),name=product==='random'?'랜덤 카드':rules.cards[product].name;return `<div><b>${name} ${option.count}장 <small>1회 돈 ${option.cost}점 · 최대 ${max}회</small></b><input id="buy-${product}" aria-label="${name} 구매 횟수" type="number" min="1" max="${max||1}" value="1" ${max?'':'disabled'}><button class="secondary" data-cmd="merchantBuy" data-product="${product}" data-quantity-input="buy-${product}" ${max?'':'disabled'}>구매</button></div>`;}).join('')}</section>`;
  if(merchantTab==='craft')content=`<div class="merchant-craft-entry"><h3>저녁 제작</h3><p>창 안에서는 반복 제작할 수 있습니다. 종료하면 오늘은 다시 열 수 없지만 다른 준비 행동은 계속 가능합니다.</p>${btn('beginCraft','제작창 열기',p.craftUsed?'오늘 제작 종료 · 다음 저녁 다시 가능':'하루 한 번 입장',p.craftUsed?'disabled':'')}</div>`;
  return `<div class="merchant-dashboard"><h2>상인의 저녁 준비</h2><div class="merchant-wallet">보유 돈 <strong>${me.money}점</strong></div><nav class="merchant-tabs" aria-label="상인 저녁 행동">${Object.entries({display:'진열장',price:'가격 변경',buy:'카드 구매',craft:'제작'}).map(([tab,label])=>`<button data-ui="merchantTab" data-tab="${tab}" aria-pressed="${merchantTab===tab}" class="${merchantTab===tab?'active':''}">${label}</button>`).join('')}</nav><div class="merchant-tab-content">${content}</div><div class="merchant-finish"><p>준비를 마쳤을 때 눌러주세요.</p><button class="primary full" data-cmd="merchantDone">저녁 준비 완료 · 밤으로</button></div></div>`;
}
