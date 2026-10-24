export const ordinaryRebel=p=>p.role==='rebel'&&p.job!=='werewolf';
export const watcher=p=>p.role==='citizen'&&p.job==='watcher';
export const rebelIdentityVisible=(viewer,target)=>watcher(viewer)?target.role==='rebel'||watcher(target):ordinaryRebel(viewer)&&(ordinaryRebel(target)||watcher(target));
export const rebelRoomAvailable=room=>room.players.filter(p=>ordinaryRebel(p)&&!p.surrendered).length>=2;
export const rebelRoomMember=(room,p)=>rebelRoomAvailable(room)&&(ordinaryRebel(p)||watcher(p));
