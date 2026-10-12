let shopStockId = null, shopQuantity = 1;
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
  return `<h2>낮의 익명 상점 · 원하는 만큼 구매하세요.</h2><p class="action-description">모두 동시에 구매할 수 있으며 재고는 먼저 확정한 사람에게 판매됩니다. 교단·전도카드는 주교만 대금으로 사용할 수 있습니다. 상점에서 전도를 받아도 즉시 전파 효과는 발동하지 않습니다.</p>${renderShopShelf(true)}${item ? `<section class="shop-checkout"><h3>${rules.cards[item.type].name} 구매</h3><label for="shop-quantity">구매 수량 (재고 ${item.quantity}장)</label><input id="shop-quantity" data-shop-quantity type="number" min="1" max="${item.quantity}" value="${shopQuantity}"><p>필요한 대금 <b>카드 ${item.price * shopQuantity}장</b> · 아래 손패에서 고르세요.</p>${submitCards('marketBuy', '대금 확정 · 상품 구매')}</section>` : ''}<button class="primary" data-cmd="marketDone">구매 완료 · 다음 진행 기다리기</button>`;
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
  return `<h2>상인의 저녁 준비 · 돈 ${me.money}점</h2><p class="action-description">제작창은 저녁마다 한 번 열 수 있습니다. 제작창 종료 후에도 진열·가격 변경·구매를 반복할 수 있습니다. 준비 완료를 누르면 밤이 시작됩니다.</p><div class="action-choices two">${btn('beginCraft','저녁 제작',p.craftUsed?'오늘 저녁 제작창을 이미 사용했습니다.':'제작창 안에서는 반복·연속 제작 가능',p.craftUsed?'disabled':'')}<button class="action-choice" data-ui="displayMode"><strong>카드 진열<span>↗</span></strong><small>손패에서 최대 5종류·종류당 30장</small></button></div>${renderShopShelf()}<section class="merchant-prices"><h3>진열 상품 가격 변경</h3>${state.game.shop.map(item=>`<div><label for="price-${item.id}">${rules.cards[item.type].name}</label><input id="price-${item.id}" type="number" min="1" max="5" value="${item.price}"><button class="secondary" data-cmd="changePrice" data-stock="${item.id}" data-price-input="price-${item.id}">가격 변경</button></div>`).join('')||'<p>진열 상품이 없습니다.</p>'}</section><section class="merchant-buy"><h3>돈으로 카드 구매</h3>${Object.entries(options).map(([product,option])=>{const max=Math.floor(me.money/option.cost),name=product==='random'?'랜덤 카드':rules.cards[product].name;return `<div><b>돈 ${option.cost}점 → ${name} ${option.count}장</b><input id="buy-${product}" aria-label="${name} 구매 횟수" type="number" min="1" max="${max||1}" value="1" ${max?'':'disabled'}><button class="secondary" data-cmd="merchantBuy" data-product="${product}" data-quantity-input="buy-${product}" ${max?'':'disabled'}>구매</button></div>`;}).join('')}</section><button class="primary" data-cmd="merchantDone">상인 준비 완료 · 밤으로 →</button>`;
}
