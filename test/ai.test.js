import test from 'node:test';
import assert from 'node:assert/strict';
import { act, makeRoom, joinRoom, view, card, RuleError } from '../lib/game.js';
import { createPolicy, seededRandom, observe, candidates, actionFeatures, distribution, sample, validatePolicy, forward, OBS_SIZE, ACTION_SIZE } from '../lib/ai-policy.js';
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
test('v2/v3→주교 규칙 가중치 이전은 기존 관측·행동의 예측을 보존',()=>{
  for (const version of [2,3]) {
    const legacy = { version, ruleset: `v${version}`, observationSize: 51, actionSize: version === 2 ? 76 : 79, metadata: { episodes: 1600 } };
    const net = output => ({ input: 51, hidden: 16, output, w1: Array.from({length:51*16},(_,i)=>Math.sin(i)*.02), b1: Array(16).fill(.1), w2: Array.from({length:16*output},(_,i)=>Math.cos(i)*.03), b2: Array(output).fill(.2) });
    legacy.actor = net(legacy.actionSize); legacy.critic = net(1);
    const transferred = transferPolicy(legacy);
    const oldObs = Array.from({length:51},(_,i)=>i/51);
    const newObs = [...oldObs.slice(0,16),0,0,...oldObs.slice(16,32),0,0,...oldObs.slice(32),...Array(7).fill(0)];
    assert.deepEqual(forward(transferred.critic,newObs).output,forward(legacy.critic,oldObs).output);
    const before = forward(legacy.actor,oldObs).output, after = forward(transferred.actor,newObs).output;
    for(let i=0;i<before.length;i++) {
      const recipeEnd = 26 + (version === 2 ? 17 : 20);
      const mapped = i < 26 ? i : i < recipeEnd ? i+6 : i < recipeEnd+16 ? i+6+(24-(version === 2 ? 17 : 20)) : i+6+(24-(version === 2 ? 17 : 20))+2;
      assert.equal(after[mapped],before[i]);
    }
    assert.equal(transferred.metadata.transferredFrom.episodes,1600); assert.equal(transferred.metadata.episodes,0);
    assert.throws(()=>transferPolicy({...legacy,version:1}));
  }
});

test('v4→사형 투표 규칙 가중치 이전은 기존 주교 관측·행동을 보존', () => {
  const net = output => ({ input: 60, hidden: 16, output, w1: Array.from({ length: 60 * 16 }, (_, i) => Math.sin(i) * .02), b1: Array(16).fill(.1), w2: Array.from({ length: 16 * output }, (_, i) => Math.cos(i) * .03), b2: Array(output).fill(.2) });
  const old = { version: 4, ruleset: 'v4-bishop-religious-rebellion-steal2', observationSize: 60, actionSize: 90, actor: net(90), critic: net(1), metadata: { episodes: 800 } };
  const next = transferPolicy(old), oldObs = Array.from({ length: 60 }, (_, i) => i / 60);
  const newObs = [...oldObs.slice(0,17), 0, ...oldObs.slice(17), 0];
  assert.deepEqual(forward(old.critic,oldObs).output, forward(next.critic,newObs).output);
  const before = forward(old.actor,oldObs).output, after = forward(next.actor,newObs).output;
  for (let i = 0; i < before.length; i++) assert.equal(before[i], after[i < 30 ? i : i + 2]);
  assert.equal(next.metadata.transferredFrom.version, 4);
});
