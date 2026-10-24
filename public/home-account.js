let homeView='menu';
let onlineMenuOpen=false;
const accountDraft={};
function renderHomeAccount(){
 if(homeView==='account'&&accountProfile)return `<section class="account-panel"><h2>${esc(accountProfile.loginId||accountProfile.name)}</h2><button class="secondary full" data-account-action="logout">로그아웃</button><button class="secondary full" data-account-action="soon">아이디 변경 · 준비 중</button><button class="secondary full" data-account-action="soon">비밀번호 변경 · 준비 중</button><h3>레이팅 ${accountProfile.points}점</h3><p>${accountProfile.wins}승 ${accountProfile.losses}패 ${accountProfile.draws}무</p><button class="quiet" data-home-view="menu">닫기</button></section>`;
 const signup=homeView==='signup';
 const value=key=>esc(accountDraft[key]||'');
  return `<section class="account-panel"><h2>${signup?'계정 생성':'로그인'}</h2><form id="home-account-form" data-kind="${signup?'register':'login'}">${signup?`<label>이메일<input type="email" name="email" autocomplete="email" required value="${value('email')}"></label>`:''}<label>아이디<input name="loginId" maxlength="16" autocomplete="username" required value="${value('loginId')}"></label><label>비밀번호<input type="password" name="password" autocomplete="${signup?'new-password':'current-password'}" required></label>${signup?'<label>비밀번호 재입력<input type="password" name="passwordConfirm" autocomplete="new-password" required></label>':''}<button class="primary full">${signup?'가입하기':'로그인'}</button></form><button class="quiet" data-home-view="${signup?'login':'signup'}">${signup?'로그인으로':'계정 생성'}</button><button class="quiet" data-home-view="menu">돌아가기</button></section>`;
}
function updateAccountButton(){
 let button=document.querySelector('#account-toggle');
 if(!button){button=document.createElement('button');button.id='account-toggle';button.className='quiet border';document.querySelector('.top-actions').append(button);}
 button.textContent=accountProfile?(accountProfile.loginId||accountProfile.name):'로그인/계정생성';
 button.onclick=()=>{if(state){toast('방을 나간 뒤 계정을 관리할 수 있습니다.');return;}homeView=homeView==='menu'?(accountProfile?'account':'login'):'menu';render();};
}
document.addEventListener('input',event=>{if(event.target.closest('#home-account-form')&&['email','loginId'].includes(event.target.name))accountDraft[event.target.name]=event.target.value;});
document.addEventListener('click',async event=>{
 const view=event.target.closest('[data-home-view]');if(view){homeView=view.dataset.homeView;render();return;}
 if(event.target.closest('[data-online-menu]')){onlineMenuOpen=!onlineMenuOpen;render();return;}
 const action=event.target.closest('[data-account-action]')?.dataset.accountAction;
 if(action==='soon')toast('준비 중입니다.');
 if(action==='logout'){homeView='menu';await command({type:'logout',token:localStorage.getItem(ACCOUNT_STORAGE)});}
});
document.addEventListener('submit',async event=>{
 if(event.target.id!=='home-account-form')return;event.preventDefault();
 const fields=Object.fromEntries(new FormData(event.target));
 if(event.target.dataset.kind==='register'&&fields.password!==fields.passwordConfirm){toast('비밀번호가 일치하지 않습니다.');return;}
 const ok=await command({type:event.target.dataset.kind,...fields,nickname:fields.loginId});
 if(ok){homeView='menu';render();}
});
