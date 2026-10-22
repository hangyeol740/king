// Hoeffding intervals with a union bound across cells and scheduled looks.
// The schedule is fixed before evaluating: 500,1000,...,5000 per cell/model.
export const LOOKS=[500,1000,1500,2000,2500,3000,3500,4000,4500,5000];
export function interval(row,{cells=1,alpha=.05}={}){
 if(!row?.games)return [0,1];
 const radius=Math.sqrt(Math.log(4*cells*LOOKS.length/alpha)/(2*row.games)),p=row.wins/row.games;
 return [Math.max(0,p-radius),Math.min(1,p+radius)];
}
export function statisticalGate(candidate,baseline,keys,{floor=.05,maximumDrop=.03,alpha=.05}={}){
 if(!keys.length)throw Error('평가 조합이 비어 있습니다.');
 const cells=keys.length,statuses={};
 for(const key of keys){
   const c=candidate[key],b=baseline[key];
   for(const row of [c,b])if(row&&(!Number.isInteger(row.games)||!Number.isInteger(row.wins)||row.games<0||row.wins<0||row.wins>row.games))throw Error('잘못된 평가 집계');
  if(!c||!b||Math.min(c.games,b.games)<500){statuses[key]={state:'incomplete'};continue;}
  const ci=interval(c,{cells,alpha}),bi=interval(b,{cells,alpha});
  const lower=ci[0]-bi[1],upper=ci[1]-bi[0];
  const state=ci[1]<floor||upper< -maximumDrop?'fail':ci[0]>=floor&&lower>= -maximumDrop?'pass':Math.min(c.games,b.games)>=5000?'hold':'more';
  statuses[key]={state,candidate:ci,baseline:bi,difference:[lower,upper]};
 }
 const values=Object.values(statuses).map(s=>s.state);
 return {state:values.includes('fail')?'fail':values.every(v=>v==='pass')?'pass':values.some(v=>v==='incomplete'||v==='more')?'more':'hold',statuses,confidence:1-alpha,multipleComparisons:true};
}
