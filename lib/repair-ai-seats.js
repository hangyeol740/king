// Confirmed owner-reported corrupted seat only. Never infer AI from a nickname.
const confirmed=[{room:'4XYEKF',player:'e2edf32d-944d-47ff-8af4-6c77abb0ef63'}];
export function repairAISeats(room){
 const repaired=[];
 for(const p of room.players){
  const reported=confirmed.some(c=>c.room===room.code&&c.player===p.id);
  if(reported&&p.bot!==true){p.bot=true;p.seatKind='bot';p.online=true;p.takeover=false;p.aiStatus={state:'local-policy'};repaired.push(p.id);}
  if(p.bot&&!p.takeover&&!p.personalSurrender)p.seatKind='bot';
 }
 return repaired;
}
