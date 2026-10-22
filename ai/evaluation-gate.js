export const EVALUATED_ROLES=['king','citizen','hunter','blacksmith','rebel','bishop','merchant','neutral'];
export function roleKey(player){return player.job||player.role;}
export function mergeRoles(rows){const roles=Object.fromEntries(EVALUATED_ROLES.map(role=>[role,{games:0,wins:0}]));for(const row of rows)for(const [role,value] of Object.entries(row.byRole||{})){roles[role] ||= {games:0,wins:0};roles[role].games+=value.games;roles[role].wins+=value.wins;}return roles;}
export function promotionGate(candidate,baseline,{minimumGames=500,floor=.05,maximumDrop=.03}={}){
 const reasons=[];for(const role of EVALUATED_ROLES){const c=candidate[role],b=baseline[role];if(!c||!b||c.games<minimumGames||b.games<minimumGames){reasons.push(`${role}:insufficient-samples`);continue;}if(c.wins/c.games<floor)reasons.push(`${role}:below-floor`);if(c.wins/c.games<b.wins/b.games-maximumDrop)reasons.push(`${role}:regression`);}
 return {passed:!reasons.length,reasons};
}
export function selectPassingCandidate(candidates,baseline,options){return candidates.map(c=>({...c,gate:promotionGate(c.roles,baseline,options)})).filter(c=>c.gate.passed).sort((a,b)=>b.score-a.score)[0]||null;}
