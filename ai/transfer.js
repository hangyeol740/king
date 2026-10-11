import { createPolicy, OBS_SIZE, ACTION_SIZE, ACTION_TYPES, POLICY_VERSION } from '../lib/ai-policy.js';

// v2에서 끝에 왕 제작법 3개가 추가된 v3로만 검증된 가중치 이전을 지원합니다.
export function transferPolicy(source, seed=42) {
  if(POLICY_VERSION!==3 || source?.version!==2 || source.observationSize!==OBS_SIZE || source.actionSize!==ACTION_SIZE-3 || !(source.metadata?.episodes>0))throw new Error('v2 학습 모델에서 v3로의 이전만 지원합니다.');
  for(const [kind,output] of [['actor',ACTION_SIZE-3],['critic',1]]){
    const net=source[kind];
    if(!net||net.input!==OBS_SIZE||net.output!==output||!Number.isInteger(net.hidden)||net.hidden<1||net.hidden>128)throw new Error('이전 모델의 신경망 구조 오류');
    for(const [key,size] of [['w1',net.input*net.hidden],['b1',net.hidden],['w2',net.hidden*net.output],['b2',net.output]])if(!Array.isArray(net[key])||net[key].length!==size||!net[key].every(Number.isFinite))throw new Error('이전 모델의 가중치 오류');
  }
  const policy=createPolicy(seed,source.actor.hidden);
  policy.actor.w1=[...source.actor.w1];policy.actor.b1=[...source.actor.b1];
  const insertion=ACTION_TYPES.length+17;
  for(let old=0;old<source.actor.output;old++){
    const next=old<insertion?old:old+3;
    policy.actor.b2[next]=source.actor.b2[old];
    for(let h=0;h<source.actor.hidden;h++)policy.actor.w2[next*source.actor.hidden+h]=source.actor.w2[old*source.actor.hidden+h];
  }
  policy.critic=structuredClone(source.critic);
  policy.metadata.transferredFrom={version:source.version,ruleset:source.ruleset,episodes:source.metadata.episodes};
  return policy;
}
