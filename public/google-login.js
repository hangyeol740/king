/* Google Identity Services renders its own sign-in button. ID tokens are
   verified server-side; no Google access/refresh token is stored here. */
(() => {
  let clientId=null,ready=false,initialized=false;
  function mount(){
    if(!ready||!clientId||typeof accountProfile==='undefined'||accountProfile)return;
    const panel=document.querySelector('.account-panel');
    if(!panel||panel.querySelector('[data-google-login]'))return;
    if(!initialized){
      google.accounts.id.initialize({client_id:clientId,callback:response=>command({type:'googleLogin',credential:response.credential})});
      initialized=true;
    }
    const slot=document.createElement('div');slot.dataset.googleLogin='';slot.style.marginTop='14px';panel.append(slot);
    google.accounts.id.renderButton(slot,{type:'standard',theme:'outline',size:'large',text:'continue_with',locale:'ko'});
  }
  fetch('/api/auth/google/config').then(r=>r.json()).then(config=>{
    clientId=config.clientId;
    if(!clientId)return;
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
    script.onload=()=>{ready=true;mount();};document.head.append(script);
  }).catch(()=>{});
  new MutationObserver(mount).observe(document.querySelector('#app'),{childList:true,subtree:true});
})();
