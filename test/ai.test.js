import test from 'node:test';
import assert from 'node:assert/strict';
import { act, makeRoom, joinRoom, view, card, RECIPES, RuleError } from '../lib/game.js';
import { createPolicy, seededRandom, observe, candidates, actionFeatures, distribution, sample, validatePolicy, forward, OBS_SIZE, ACTION_SIZE, PHASES, CARD_TYPES, ACTION_TYPES } from '../lib/ai-policy.js';
import { rollout } from '../ai/environment.js';
import { PPO } from '../ai/ppo.js';
import { createBotRunner } from '../lib/ai-runner.js';
import { transferPolicy } from '../ai/transfer.js';

test('AI 생성·제거는 방장 대기실만, AI 토큰 비공개·인원별 진영 적용', () => {
  const r = makeRoom('AI1234', '사람');
  act(r, r.host, { type: 'addBot' }); act(r, r.host, { type: 'addBot' });
  assert.equal(r.players.length, 3); assert.equal(r.players.filter(p => p.bot).length, 2);
  const v = view(r, r.host); assert.equal(v.players.filter(p => p.bot).length, 2);
  assert.ok(r.players.filter(p => p.bot).every(p => !JSON.stringify(v).includes(p.token)));
  assert.throws(() => act(r, r.players[1].id, { type: 'removeBot', target: r.players[2].id }), RuleError);
  act(r, r.host, { type: 'removeBot', target: r.players[1].id }); assert.equal(r.players.length, 2);
  act(r, r.host, { type: 'addBot' }); act(r, r.host, { type: 'start' });
  assert.throws(() => act(r, r.host, { type: 'addBot' }), RuleError);
  assert.equal(r.game.maxDays, 10);
});
test('관측과 후보는 타인의 숨겨진 손패·진영 및 밤 미공개 점수 변경에 영향을 받지 않음', () => {
  const r = makeRoom('AI1234', '하나'); joinRoom(r, '둘'); joinRoom(r, '셋'); joinRoom(r, '넷');
  act(r, r.host, { type: 'start' });
  const p = r.players.find(p => p.role === 'citizen');
  r.game.phase = 'day'; r.game.round = 1; r.game.turn = r.game.order.indexOf(p.id);
  const snapshot = view(r, p.id), before = observe(snapshot), actions = candidates(snapshot), features = actions.map(a => actionFeatures(snapshot, a));
  assert.equal(before.length, OBS_SIZE); assert.ok(features.every(f => f.length === ACTION_SIZE && f.every(Number.isFinite)));
  const hidden = r.players.filter(p => ['rebel', 'neutral'].includes(p.role));
  hidden[0].hand = [card('ironSword')]; hidden[1].hand = Array.from({length:40}, () => card('weapon'));
  [hidden[0].role, hidden[1].role] = [hidden[1].role, hidden[0].role];
  r.game.revolt = 1000;
  const changed = view(r, p.id);
  assert.deepEqual(observe(changed), before);
  assert.deepEqual(candidates(changed), actions);
  assert.deepEqual(actions.map(a => actionFeatures(changed, a)), features);
});
test('자기플레이 시뮬레이터가 3·4·5인 모든 단계를 적법한 행동으로 종료', () => {
  const policy = createPolicy(11, 16), random = seededRandom(22);
  for (let game = 0; game < 18; game++) {
    const result = rollout(policy, { count: [3,4,5][game % 3], random });
    assert.equal(result.room.status, 'finished'); assert.ok(result.steps < 1800);
    for (const p of result.room.players) {
      const rows = result.trajectories.get(p.id);
      assert.ok(rows.length); assert.ok(rows.every(r => r.obs.length === OBS_SIZE && r.features.every(f => f.length === ACTION_SIZE)));
      assert.equal(rows.at(-1).reward, result.room.game.winner.players.includes(p.id) ? 1 : -1);
    }
  }
});
test('실제 PPO 경사 업데이트가 보상 높은 행동의 확률을 학습하며 모델 저장 형식을 검증', () => {
  const policy = createPolicy(123, 16), trainer = new PPO(policy, { learningRate: .005, entropy: .005 }), random = seededRandom(321);
  const obs = Array(OBS_SIZE).fill(0); obs[0] = 1;
  const features = [Array(ACTION_SIZE).fill(0), Array(ACTION_SIZE).fill(0)]; features[0][0] = 1; features[1][1] = 1;
  const before = distribution(policy, obs, features).probabilities[0];
  assert.throws(() => validatePolicy(policy), /학습이 완료/);
  for (let iteration = 0; iteration < 20; iteration++) {
    const trajectories = [];
    for (let i = 0; i < 128; i++) {
      const probabilities = distribution(policy, obs, features).probabilities, chosen = sample(probabilities, random);
      trajectories.push([{ obs, features, chosen, oldLogProbability: Math.log(probabilities[chosen]), value: 0, reward: chosen === 0 ? 1 : -1 }]);
    }
    trainer.update(trainer.prepare(trajectories), { epochs: 2, random });
  }
  const after = distribution(policy, obs, features).probabilities[0];
  assert.ok(after > .9 && after > before, `학습 전 ${before} / 후 ${after}`);
  policy.metadata.episodes = 2560;
  assert.doesNotThrow(() => validatePolicy(JSON.parse(JSON.stringify(policy))));
  const bad = structuredClone(policy); bad.actor.w1[0] = null; assert.throws(() => validatePolicy(bad));
  const restored = new PPO(policy); restored.restore(trainer.checkpoint()); assert.equal(restored.step, trainer.step);
});
test('봇 스케줄러는 사람이 없을 때 정지하고 사람이 복귀하면 AI 행동 실행', async () => {
  const r = makeRoom('AI1234', '사람'); act(r,r.host,{type:'addBot'}); act(r,r.host,{type:'addBot'}); act(r,r.host,{type:'start'});
  r.game.phase='day'; r.game.round=1; r.game.turn=r.game.order.indexOf(r.players.find(p=>p.bot).id);
  let changes=0, failure;
  const runner=createBotRunner({policy:createPolicy(),delay:5,changed:()=>{changes++;},failed:e=>{failure=e;}});
  try {
    runner.schedule(r); await new Promise(resolve=>setTimeout(resolve,25)); assert.equal(changes,0);
    r.players.find(p=>!p.bot).online=true; runner.schedule(r);
    for(let i=0;i<100&&!changes&&!failure;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.ifError(failure); assert.ok(changes>0);
  } finally {runner.close();}
});
test('v2~v6 모델의 관측·행동·제작·카드 선호를 상인 규칙으로 위치를 맞춰 이전',()=>{
  for(const [version,phases,cards,recipes,actions,stats,outStats] of [[2,12,16,17,26,19,17],[3,12,16,20,26,19,17],[4,13,18,24,30,25,18],[5,14,18,24,32,26,18],[6,14,18,24,35,29,18]]){
    const input=4+phases+cards+stats,output=actions+recipes+cards+outStats;
    const net=output=>({input,hidden:16,output,w1:Array.from({length:input*16},(_,i)=>Math.sin(i)*.02),b1:Array(16).fill(.1),w2:Array.from({length:16*output},(_,i)=>Math.cos(i)*.03),b2:Array(output).fill(.2)});
    const old={version,ruleset:`v${version}`,observationSize:input,actionSize:output,actor:net(output),critic:net(1),metadata:{episodes:800}};
    const next=transferPolicy(old),obs=Array.from({length:input},(_,i)=>i/input),now=Array(OBS_SIZE).fill(0);
    for(let i=0;i<4+phases;i++)now[i]=obs[i];
    for(let i=0;i<cards;i++)now[4+PHASES.length+i]=obs[4+phases+i];
    for(let i=0;i<stats;i++)now[4+PHASES.length+CARD_TYPES.length+i]=obs[4+phases+cards+i];
    assert.deepEqual(forward(old.critic,obs).output,forward(next.critic,now).output);
    const before=forward(old.actor,obs).output,after=forward(next.actor,now).output;
    for(let i=0;i<output;i++){
      const index=i<actions?i:i<actions+recipes?ACTION_TYPES.length+i-actions:i<actions+recipes+cards?ACTION_TYPES.length+RECIPES.length+i-actions-recipes:ACTION_TYPES.length+RECIPES.length+CARD_TYPES.length+i-actions-recipes-cards;
      assert.equal(before[i],after[index]);
    }
    assert.equal(next.metadata.episodes,0);assert.equal(next.metadata.transferredFrom.version,version);assert.throws(()=>transferPolicy({...old,version:1}));
  }
});
