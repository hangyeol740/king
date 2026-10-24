window.createHTTPGameSocket=()=>{
 const handlers=new Map();let client=null,active=true,timer,queue=Promise.resolve(),pendingCommands=0,revision=0;
 const notify=(name,data)=>{for(const fn of handlers.get(name)||[])fn(data);};
 const socket={connected:false,on(name,fn){if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn);return socket;},timeout(){return socket;},emitWithAck(name,command){if(name!=='command')return Promise.reject(Error('Unsupported event'));return request(command);},disconnect(){active=false;clearTimeout(timer);socket.connected=false;notify('disconnect');return socket;},connect(){active=true;void request();return socket;}};
  async function perform(command){
   const ticket=command?++revision:revision;
  try{const r=await fetch('/api/transport',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client,command}),signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('transport_failed');const result=await r.json();if(result.expired){client=null;socket.connected=false;return perform(command);}
   client=result.client;const first=!socket.connected;socket.connected=true;
   const events=result.events||[],lastState=events.findLastIndex(event=>event.name==='state');
   if(command||ticket===revision){window.kingdomApplyingCommand=command||null;try{for(const [index,event]of events.entries())if(event.name!=='state'||index===lastState)notify(event.name,event.value);}finally{window.kingdomApplyingCommand=null;}}
   if(first)notify('connect');return result.reply;
  }catch(error){if(socket.connected){socket.connected=false;notify('disconnect');}throw error;}
 }
   function request(command){if(!command&&client)return perform();if(command)pendingCommands++;const next=queue.then(()=>perform(command));queue=next.catch(()=>{});return next.finally(()=>{if(command)pendingCommands--;});}
 async function poll(){if(!active)return;try{if(!pendingCommands)await request();}catch{}timer=setTimeout(poll,350);}
 setTimeout(poll,0);return socket;
};
