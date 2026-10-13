import { randomInt, randomUUID } from 'node:crypto';

export const CARDS = {
  resource: { name: '자원', chance: 35, icon: '◆', category: 'resource' },
  rebellion: { name: '반란', chance: 18, revolt: 3, sabotage: -2, icon: '⚑', category: 'rebel' },
  agitation: { name: '선동', chance: 7, revolt: 8, sabotage: -6, icon: '♜', category: 'rebel' },
  weapon: { name: '병기', chance: 1, revolt: 20, mediation: 17, attack: 10, icon: '✹', category: 'weapon' },
  sword: { name: '칼', chance: 15, attack: 1, icon: '†', category: 'attack' },
  magic: { name: '마법', chance: 4, attack: 4, icon: '✦', category: 'magic' },
  infantry: { name: '보병', chance: 15, mediation: 2, expedition: 1, icon: '♟', category: 'royal' },
  officer: { name: '장교', chance: 5, mediation: 7, expedition: 3, icon: '♞', category: 'royal' },
  eternalSword: { name: '영구 칼', chance: 0, attack: 2, permanent: true, icon: '†', category: 'eternal' },
  eternalMagic: { name: '영구 마법', chance: 0, attack: 5, permanent: true, icon: '✦', category: 'eternal' },
  ironSword: { name: '철혈의 검', chance: 0, instantWin: true, icon: '♛', category: 'legendary' },
  highMagic: { name: '고위 마법', chance: 0, attack: 20, icon: '✵', category: 'magic' },
  flameSword: { name: '화염대검', chance: 0, attack: 30, revolt: 18, mediation: 12, icon: '♨', category: 'legendary' },
  northSword: { name: '북부의 검', chance: 0, attack: 20, revolt: 25, mediation: 22, icon: '❄', category: 'legendary' },
  warWeapon: { name: '전쟁병기', chance: 0, attack: 20, revolt: 50, mediation: 40, permanent: true, icon: '✹', category: 'eternal' },
  bomb: { name: '폭탄', chance: 0, revolt: 5, bomb: true, icon: '●', category: 'rebel' },
  church: { name: '교단', chance: 0, mediation: 3, expedition: 2, icon: '✝', category: 'religion' },
  evangelism: { name: '전도', chance: 0, mediation: 7, icon: '✧', category: 'religion' },
  reinforcedSword: { name: '강화된 영구 칼', chance: 0, attack: 3, permanent: true, icon: '†', category: 'eternal' },
  shiningSword: { name: '빛날검', chance: 0, attack: 7, permanent: true, icon: '✧', category: 'eternal' },
  huntingAxe: { name: '사냥도끼', chance: 0, attack: 5, icon: '⚒', category: 'attack' }
};
export const RECIPES = [
  { input: 'resource', count: 2, output: 'sword' },
  { input: 'sword', count: 3, output: 'magic' },
  { input: 'magic', count: 4, output: 'highMagic' },
  { input: 'sword', count: 2, output: 'eternalSword' },
  { input: 'eternalSword', count: 3, output: 'eternalMagic' },
  { input: 'sword', count: 6, output: 'weapon' },
  { ingredients: [{ input: 'eternalSword', count: 10 }, { input: 'eternalMagic', count: 5 }, { input: 'resource', count: 20 }], output: 'flameSword' },
  { ingredients: [{ input: 'eternalSword', count: 2 }, { input: 'eternalMagic', count: 10 }, { input: 'resource', count: 20 }], output: 'northSword' },
  { ingredients: [{ input: 'flameSword', count: 1 }, { input: 'northSword', count: 1 }], output: 'ironSword' },
  { input: 'weapon', count: 6, output: 'warWeapon', role: 'king' },
  { input: 'agitation', count: 1, output: 'rebellion', role: 'citizen' },
  { input: 'rebellion', count: 2, output: 'infantry', role: 'citizen' },
  { input: 'infantry', count: 3, output: 'officer', role: 'citizen' },
  { input: 'officer', count: 1, output: 'infantry', amount: 2, role: 'rebel' },
  { input: 'infantry', count: 2, output: 'rebellion', role: 'rebel' },
  { input: 'rebellion', count: 2, output: 'agitation', role: 'rebel' },
  { input: 'rebellion', count: 5, output: 'bomb', role: 'rebel' },
  { input: 'agitation', count: 1, output: 'rebellion', role: 'king' },
  { input: 'rebellion', count: 2, output: 'infantry', role: 'king' },
  { input: 'infantry', count: 3, output: 'officer', role: 'king' },
  { input: 'infantry', count: 1, output: 'church', job: 'bishop' },
  { input: 'rebellion', count: 1, output: 'church', job: 'bishop' },
  { input: 'officer', count: 1, output: 'evangelism', job: 'bishop' },
  { input: 'agitation', count: 1, output: 'evangelism', job: 'bishop' },
  { input: 'infantry', count: 2, output: 'officer', job: 'merchant' },
  { input: 'officer', count: 1, output: 'infantry', amount: 2, job: 'merchant' },
  { input: 'infantry', count: 1, output: 'rebellion', job: 'merchant' },
  { input: 'rebellion', count: 1, output: 'infantry', job: 'merchant' },
  { input: 'rebellion', count: 2, output: 'agitation', job: 'merchant' },
  { input: 'agitation', count: 1, output: 'rebellion', amount: 2, job: 'merchant' },
  { input: 'eternalSword', count: 2, output: 'reinforcedSword', job: 'merchant' },
  { input: 'reinforcedSword', count: 2, output: 'shiningSword', job: 'merchant' },
  { input: 'huntingAxe', count: 1, output: 'resource', job: 'hunter' },
  { input: 'eternalSword', count: 2, output: 'reinforcedSword', job: 'blacksmith' },
  { input: 'resource', count: 4, output: 'infantry', job: 'blacksmith' }
];
export const ROLES = { king: '왕', citizen: '시민', rebel: '반란군', neutral: '중립' };
export const NEUTRAL_JOBS = { bishop: '주교', merchant: '상인' };
export const CITIZEN_JOBS = { hunter: '사냥꾼', blacksmith: '대장장이' };
export const handLimit = role => role === 'king' ? 50 : 30;
export const initialHandSize = role => role === 'king' ? 20 : 12;
export const huntGoal = job => job === 'hunter' ? 8 : 10;
export const standardConfiguration = room => room.players.length>=3 && Object.keys(ROLES).every(k=>room.config[k]===defaultRoles(room.players.length)[k]);
export const ratingEligible = room => room.mode !== 'offline' && (room.game?.rated ?? (standardConfiguration(room)&&!room.players.some(p => p.bot && !p.surrendered)));
export const MERCHANT_BUYS = { resource: { cost: 2, count: 1 }, infantry: { cost: 3, count: 1 }, rebellion: { cost: 3, count: 1 }, random: { cost: 10, count: 5 } };
export const isReligionCard = type => ['church', 'evangelism'].includes(type);
export const isProtectedCard = (p, type) => p.job !== 'bishop' && isReligionCard(type);
export const revoltGoal = count => count <= 3 ? 1 : count === 4 ? 2 : 3;
export const religiousGoal = count => count === 4 ? 1 : count === 5 ? 2 : 3;
export const gameDays = count => count <= 3 ? 10 : count === 4 ? 9 : count === 5 ? 7 : 6;
export const executionBlocked = (room, p) => p.executedDay === room.game?.day;
export const canExecute = room => room.players.length > 5 || (room.game.lastExecutionDay ?? (room.game.lastExecution?.target ? room.game.lastExecution.day : null)) !== room.game.day - 1;
export const expeditionCompanions = count => count <= 3 ? 1 : count === 4 ? 2 : 3;
export const canCraft = (recipe, role, job = null) => (!recipe.role || recipe.role === role) && (!recipe.job || (recipe.job === job && (Object.hasOwn(CITIZEN_JOBS, recipe.job) ? role === 'citizen' : role === 'neutral'))) && !(job === 'merchant' && ['magic', 'eternalMagic', 'highMagic'].includes(recipe.output));
export const visibleRecipes = (role, job = null) => RECIPES.map((recipe,id)=>({...recipe,id})).filter(recipe=>canCraft(recipe,role,job));
export function expeditionPower(type, role) {
  const d = CARDS[type];
  if (!d) return null;
  if (type === 'church') return 2;
  if (d.sabotage) return ['rebel', 'neutral'].includes(role) ? d.sabotage : null;
  if (d.expedition) return ['king', 'citizen', 'neutral'].includes(role) ? d.expedition : null;
  return d.attack || null;
}
export class RuleError extends Error {}
function must(value, message) { if (!value) throw new RuleError(message); }
const uid = () => randomUUID();
export const card = type => ({ id: uid(), type });
export function draw(count) {
  return Array.from({ length: count }, () => {
    let roll = randomInt(100);
    for (const [type, def] of Object.entries(CARDS)) {
      roll -= def.chance;
      if (roll < 0) return card(type);
    }
    throw new Error('Invalid card probabilities');
  });
}
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function defaultRoles(count) {
  if(count<=2)return {king:1,citizen:0,rebel:1,neutral:0};
  return { king: 1, citizen: count === 3 ? 1 : Math.max(1, count - 3), rebel: 1, neutral: count === 3 ? 0 : 1 };
}
export function makeRoom(code, name) {
  const player = makePlayer(name);
  return { code, host: player.id, players: [player], spectators:[],mode:'online',status: 'lobby', config: defaultRoles(3), neutralJobs: [], citizenJobs: [], game: null, createdAt: Date.now(), updatedAt: Date.now() };
}
export function makePlayer(name) {
  return { id: uid(), token: uid(), name, role: null, job: null, churchInfluence: 0, hand: [], notes: [], online: false };
}
export function joinRoom(room, name) {
  must(room.status === 'lobby', '이미 시작한 게임에는 참가할 수 없습니다. 원래 브라우저에서 재접속하세요.');
  must(!room.players.some(p => p.name === name), '이미 사용 중인 닉네임입니다.');
  const p = makePlayer(name);
  room.players.push(p);
  room.config = defaultRoles(room.players.length);
  return p;
}
const player = (room, id) => room.players.find(p => p.id === id);
function log(room, text, effect = null) {
  room.game.logs.push({ id: uid(), day: room.game.day, text, effect });
  if (room.game.logs.length > 150) room.game.logs.shift();
}
function note(p, text, effect = 'notice', details = null) {
  p.notes.push({ id: uid(), text, effect, details });
  if (p.notes.length > 35) p.notes.shift();
}
function grant(p, count, reason) {
  p.hand.push(...draw(count));
  note(p, `${reason}: 카드 +${count}장 지급 완료 · 현재 손패 ${p.hand.length}장`, 'gain');
}
function morningCards(room) {
  for (const p of room.players) {
    if (p.job === 'hunter') { p.hand.push(card('huntingAxe')); note(p, '사냥꾼의 아침: 사냥도끼 1장을 받았습니다.', 'gain'); }
    if (p.job !== 'bishop') {
      const count = p.hand.filter(c => c.type === 'evangelism').length;
      if (count) {
        p.hand.push(...Array.from({ length: count }, () => card('church')));
        note(p, `아침 전도: 전도카드 ${count}장으로 교단카드 ${count}장을 받았습니다.`, 'gain');
      }
    }
    const limit = handLimit(p.role);
    if (p.hand.length > limit) {
      const removed = p.hand.length - limit;
      const resources = shuffle(p.hand.filter(c => c.type === 'resource'));
      const ordinary = shuffle(p.hand.filter(c => c.type !== 'resource' && !isProtectedCard(p, c.type)));
      const protectedCards = shuffle(p.hand.filter(c => isProtectedCard(p, c.type)));
      consume(p, [...resources, ...ordinary, ...protectedCards].slice(0, removed));
      note(p, `손패 초과: 자원을 우선하여 ${removed}장을 버려 ${limit}장이 되었습니다.`, 'loss');
    }
    if (p.hand.length <= 6) grant(p, 5, '아침 보급 (손패 6장 이하)');
  }
}
function selected(p, ids, allowed) {
  must(Array.isArray(ids) && ids.length <= p.hand.length && new Set(ids).size === ids.length, '카드 선택이 올바르지 않습니다.');
  const cards = ids.map(id => p.hand.find(c => c.id === id));
  must(cards.every(c => c && (!allowed || allowed(c.type))), '이 행동에 사용할 수 없는 카드가 있습니다.');
  return cards;
}
function consume(p, cards, preservePermanent = false) {
  const ids = new Set(cards.filter(c => !preservePermanent || !CARDS[c.type].permanent).map(c => c.id));
  p.hand = p.hand.filter(c => !ids.has(c.id));
}
function discardAll(p) {
  const cards = p.hand.filter(c => !isProtectedCard(p, c.type));
  consume(p, cards);
  return cards.length;
}
function convertEvangelism(room, recipient, cards) {
  const count = cards.filter(c => c.type === 'evangelism').length;
  if (!count || recipient.job === 'bishop' || !room.players.some(p => p.job === 'bishop')) return;
  const converted = shuffle(recipient.hand.filter(c => !isReligionCard(c.type))).slice(0, count);
  converted.forEach(c => { c.type = 'church'; });
  const extra = count - converted.length;
  recipient.hand.push(...Array.from({ length: extra }, () => card('church')));
  note(recipient, `전도 전파: 일반 카드 ${converted.length}장을 교단카드로 바꿨습니다.${extra ? ` 변환할 카드가 부족하여 교단카드 ${extra}장을 추가로 받았습니다.` : ''}`, 'gain');
}
function finish(room, side, reason) {
  room.status = 'finished';
  room.game.phase = 'finished';
  room.game.pending = null;
  room.game.winner = { side, reason, players: room.players.filter(p => side === 'royal' ? ['king', 'citizen'].includes(p.role) : side === 'rebel+bishop' ? p.role === 'rebel' || p.job === 'bishop' : Object.hasOwn(NEUTRAL_JOBS, side) ? p.job === side : p.role === side).map(p => p.id) };
  log(room, reason, 'victory');
}
export function voteGame(room,id,a){
 const p=player(room,id),g=room.game;must(p&&room.status==='playing'&&!p.surrendered,'진행 중인 참가자만 요청할 수 있습니다.');
 if(a.type==='surrender'||a.type==='requestSurrender'){
  must(g.day>=3,'시작 후 2일 동안은 기권할 수 없습니다.');must(!g.vote,'이미 투표가 진행 중입니다.');must(!p.lastSurrenderDay||g.day-p.lastSurrenderDay>=3,'기권 투표는 한 사람당 3일에 한 번만 요청할 수 있습니다.');
  p.lastSurrenderDay=g.day;
  if(p.role==='neutral'){p.surrendered=true;p.hand=[];p.stock=[];p.money=0;p.churchInfluence=0;p.bot=true;note(p,'중립 기권으로 게임에서 빠졌습니다. 기권패 -120점입니다.','loss');log(room,'중립 플레이어 한 명이 기권했습니다.');skipSurrendered(room);return;}
  const side=['king','citizen'].includes(p.role)?'royal':'rebel';
  const eligible=room.players.filter(q=>!q.surrendered&&(side==='royal'?['king','citizen'].includes(q.role):q.role==='rebel')).map(q=>q.id);
  g.vote={id:uid(),kind:'surrender',side,eligible,ballots:{[id]:true}};
 }else if(a.type==='requestDraw'){
  must(['king','rebel','neutral'].includes(p.role),'시민은 무승부 요청을 시작할 수 없습니다.');must(!g.vote,'이미 투표가 진행 중입니다.');
  g.vote={id:uid(),kind:'draw',eligible:room.players.filter(q=>!q.surrendered).map(q=>q.id),ballots:{[id]:true}};
 }else{
  must(a.type==='gameVote'&&g.vote&&g.vote.id===a.vote&&g.vote.eligible.includes(id)&&!Object.hasOwn(g.vote.ballots,id)&&typeof a.accept==='boolean','투표에 한 번 찬성 또는 반대하세요.');g.vote.ballots[id]=a.accept;
 }
 resolveGameVote(room);
}
function resolveGameVote(room){
 const v=room.game.vote;if(!v)return;const yes=Object.values(v.ballots).filter(Boolean).length,no=Object.values(v.ballots).filter(x=>!x).length,needed=Math.floor(v.eligible.length/2)+1;
 if(yes>=needed){room.game.vote=null;if(v.kind==='draw'){finish(room,'draw','전체 과반수가 동의하여 무승부입니다.');room.game.winner.players=room.players.filter(p=>!p.surrendered).map(p=>p.id);}
  else finish(room,v.side==='royal'?'rebel':'royal',`${v.side==='royal'?'왕·시민':'반란군'} 진영이 과반수 투표로 기권했습니다.`);
 }else if(no>v.eligible.length-needed){room.game.vote=null;log(room,'투표가 부결되었습니다.');}
}
export function autoGameVotes(room){const v=room.game?.vote;if(!v)return;for(const id of v.eligible){const p=player(room,id);if((p.bot||p.takeover)&&!Object.hasOwn(v.ballots,id))v.ballots[id]=false;}resolveGameVote(room);}
function skipSurrendered(room){
 const g=room.game;
 if(g.pending?.done)g.pending.done.push(...room.players.filter(p=>p.surrendered&&!g.pending.done.includes(p.id)).map(p=>p.id));
 if(g.phase==='day'&&player(room,g.order[g.turn])?.surrendered)nextTurn(room);
 if(g.phase==='bishopNight'&&!room.players.some(p=>p.job==='bishop'&&!p.surrendered))nextMorning(room);
 if(g.phase==='merchantEvening'&&!merchant(room))night(room);
 if(g.phase==='market'&&allDone(room,g.pending.done))normalDay(room);
 if(g.phase==='market'&&!merchant(room))normalDay(room);
 if(g.phase==='redistribute'&&allDone(room,g.pending.done))daytime(room);
 if(g.phase==='mediationSupport'&&room.players.filter(p=>!p.surrendered&&p.id!==g.king&&(g.pending.revoltType==='religion'||p.role!=='rebel')).every(p=>g.pending.done.includes(p.id)))g.phase='mediationKing';
 if(g.phase==='expeditionCards'&&g.pending.participants.every(id=>g.pending.done.includes(id)))finishExpedition(room);
 if(g.phase==='day'&&g.pending?.kind==='trade'&&[g.pending.from,g.pending.to].some(id=>player(room,id)?.surrendered))nextTurn(room);
 if(g.phase==='day'&&g.pending?.kind==='royalSupport'&&player(room,g.pending.to)?.surrendered)nextTurn(room);
}
function ironVictory(room) {
  const owner = room.players.find(p => p.hand.some(c => c.type === 'ironSword'));
  if (owner) finish(room, ['king', 'citizen'].includes(owner.role) ? 'royal' : owner.job || owner.role, `${owner.name}님이 철혈의 검을 획득했습니다. 해당 진영이 즉시 승리합니다.`);
}
const merchant = room => room.players.find(p => p.job === 'merchant'&&!p.surrendered);
function merchantVictory(room) {
  const p = merchant(room);
  if (p && p.money >= 100) finish(room, 'merchant', `${p.name}님이 돈 100점 이상을 모았습니다. 상인의 승리입니다.`);
}
function craftCards(p, action) {
  const recipe = RECIPES[action.recipe], count = action.count;
  must(recipe && Number.isInteger(count) && count >= 1 && count <= 1000, '제작 수량이 올바르지 않습니다.');
  must(canCraft(recipe, p.role, p.job), '자신의 진영·직업에 허용된 제작법이 아닙니다.');
  const ingredients = (recipe.ingredients || [recipe]).flatMap(material => {
    const cards = p.hand.filter(c => c.type === material.input).slice(0, material.count * count);
    must(cards.length === material.count * count, `${CARDS[material.input].name} 제작 재료가 부족합니다.`);
    return cards;
  });
  consume(p, ingredients);
  const produced = count * (recipe.amount || 1);
  p.hand.push(...Array.from({ length: produced }, () => card(recipe.output)));
  note(p, `${CARDS[recipe.output].name} ${produced}장 제작 완료.`, 'craft');
}
export function startGame(room, id) {
  must(room.host === id && room.status === 'lobby', '방장만 대기실에서 시작할 수 있습니다.');
  const n = room.players.length;
  must(n >= 2, '최소 2명이 필요합니다.');
  const cfg = room.config;
  must(Object.keys(ROLES).every(k => Number.isInteger(cfg[k]) && cfg[k] >= 0), '진영 인원이 올바르지 않습니다.');
  must(cfg.king === 1 && cfg.rebel >= 1, '왕 1명과 반란군 최소 1명이 필요합니다.');
  must(Object.values(cfg).reduce((a, b) => a + b, 0) === n, '진영 인원 합계가 참가자 수와 같아야 합니다.');
  if (n === 5 && Object.keys(NEUTRAL_JOBS).length < 2) must(cfg.neutral === 1, '중립 직업이 2종 이상 추가되기 전까지 5인 게임의 추가 자리는 시민 또는 반란군만 가능합니다.');
  const jobs = room.neutralJobs || [];
  must(Array.isArray(jobs) && new Set(jobs).size === jobs.length && jobs.every(job => Object.hasOwn(NEUTRAL_JOBS, job)), '중립 직업 선택이 올바르지 않습니다.');
  const citizenJobs = room.citizenJobs || [];
  must(Array.isArray(citizenJobs) && new Set(citizenJobs).size === citizenJobs.length && citizenJobs.every(job => Object.hasOwn(CITIZEN_JOBS, job)) && citizenJobs.length <= cfg.citizen, '시민 직업은 시민 인원 이내에서 중복 없이 선택하세요.');
  const roles = shuffle(Object.entries(cfg).flatMap(([role, count]) => Array(count).fill(role)));
  room.chat=null;
  room.players.forEach((p, i) => { p.role = roles[i]; p.job = null;p.surrendered=false;p.lastSurrenderDay=null;p.takeover=false;p.absent=false;p.returnPenalties=0;p.gameAccountId=p.accountId||null; p.executedDay = null; p.churchInfluence = 0; p.money = 0; p.stock = []; p.hand = draw(initialHandSize(p.role)); p.notes = []; });
  const neutrals = shuffle(room.players.filter(p => p.role === 'neutral'));
  shuffle(jobs).slice(0, cfg.neutral).forEach((job, i) => { neutrals[i].job = job; });
  const citizens = shuffle(room.players.filter(p => p.role === 'citizen'));
  shuffle(citizenJobs).forEach((job, i) => { citizens[i].job = job; });
  room.players.forEach(p => {
    note(p, `당신의 진영은 ${ROLES[p.role]}${p.job ? ` · ${NEUTRAL_JOBS[p.job] || CITIZEN_JOBS[p.job]}` : ''}입니다. 시작 카드 ${initialHandSize(p.role)}장을 받았습니다.`, 'gain');
    if (p.job === 'hunter') { p.hand.push(card('huntingAxe')); note(p, '첫날 사냥도끼 1장을 추가로 받았습니다.', 'gain'); }
  });
  const king = room.players.find(p => p.role === 'king');
  const order = [king.id, ...shuffle(room.players.filter(p => p !== king).map(p => p.id))];
  room.status = 'playing';
  const rated = room.mode !== 'offline' && standardConfiguration(room) && !room.players.some(p=>p.bot);
  room.game = { rulesVersion: 10,startedAt:Date.now(), lastExecutionDay: null, revoltGoal: revoltGoal(n), religiousGoal: religiousGoal(n), religiousSuccesses: 0, religiousScheduled: false, religiousActive: false, religiousRevolt: 0, day: 1, maxDays: gameDays(n), phase: 'morning', king: king.id, order, turn: 0, round: 1, revolt: 0, bombs: 0, successes: 0, pending: null, logs: [], winner: null };
  log(room, `${king.name}님이 왕입니다. 왕국의 첫 아침이 밝았습니다.`);
  room.game.rated = rated;
}
function resolveRevolt(room, strength, mediated = null) {
  const g = room.game;
  const bishop = room.players.find(p => p.job === 'bishop');
  if (g.religiousActive) {
    const religiousStrength = mediated === 'religion' ? strength : null;
    const blocked = religiousStrength !== null && religiousStrength >= g.religiousRevolt;
    g.lastReligiousRevolt = { day: g.day, blocked, strength: religiousStrength, revolt: g.religiousRevolt, helperCount: mediated === 'religion' ? (g.pending?.supporters || []).filter(id => id !== g.king).length : 0 };
    if (blocked) {
      log(room, `종교반란을 막았습니다! 중재력 ${religiousStrength} / 종교반란력 ${g.religiousRevolt}`, 'blocked');
      for (const p of room.players.filter(p => p !== bishop)) {
        const removed = p.hand.filter(c => isReligionCard(c.type));
        consume(p, removed);
        if (removed.length) note(p, '종교반란 실패로 교단·전도카드를 전부 버렸습니다.', 'loss');
      }
    } else {
      g.religiousSuccesses = (g.religiousSuccesses || 0) + 1;
      log(room, `종교반란 성공! ${religiousStrength === null ? '왕이 중재하지 않았습니다.' : `중재력 ${religiousStrength} / 종교반란력 ${g.religiousRevolt}`} 종교반란 성공 누적 ${g.religiousSuccesses}/${g.religiousGoal || religiousGoal(room.players.length)}일`, 'breached');
    }
    if (bishop) { bishop.churchInfluence = 0; note(bishop, '종교반란 판정이 끝나 교단영향력이 0이 되었습니다.'); }
    g.religiousActive = false; g.religiousRevolt = 0; g.religiousScheduled = false;
  }
  const rebelStrength = mediated === 'rebel' ? strength : null;
  if (g.revolt > 0) {
    const blocked = rebelStrength !== null && rebelStrength >= g.revolt;
    const bombs = g.bombs || 0;
    g.lastRevolt = { day: g.day, blocked, strength: rebelStrength, revolt: g.revolt, bombs, helperCount: mediated === 'rebel' ? (g.pending?.supporters || []).filter(id=>id!==g.king).length : 0 };
    if (blocked) log(room, `반란을 막았습니다! 중재력 ${rebelStrength} / 반란력 ${g.revolt}`, 'blocked');
    else { g.successes++; log(room, `반란을 막지 못했습니다! ${rebelStrength === null ? '왕이 중재하지 않았습니다.' : `중재력 ${rebelStrength} / 반란력 ${g.revolt}`} 반란 성공 누적 ${g.successes}/${g.revoltGoal || revoltGoal(room.players.length)}일`, 'breached'); }
    if (bombs) {
      if (blocked) log(room, `설치된 폭탄 ${bombs}장이 공개되었습니다. 반란을 막아 폭발을 저지했습니다.`, 'blocked');
      else {
        room.players.filter(p => ['king', 'citizen'].includes(p.role)).forEach(p => { discardAll(p); note(p, '반란의 폭탄이 폭발해 보호되는 교단·전도카드를 제외한 손패를 잃었습니다.', 'loss'); });
        log(room, `폭탄 ${bombs}장 폭발! 왕과 모든 시민의 손패를 버렸습니다. 보호되는 교단·전도카드는 유지됩니다.`, 'breached');
      }
    }
    g.revolt = 0;
    g.bombs = 0;
  }
  const rebelWon = g.successes >= (g.revoltGoal || revoltGoal(room.players.length));
  const bishopWon = (g.religiousSuccesses || 0) >= (g.religiousGoal || religiousGoal(room.players.length));
  if (bishopWon && rebelWon && mediated === null) finish(room, 'rebel+bishop', '왕이 두 반란 모두 중재하지 않았고 두 쪽 모두 승리 목표에 도달했습니다. 반란군과 주교의 공동 승리입니다.');
  else if (bishopWon && (!rebelWon || mediated === 'rebel')) finish(room, 'bishop', `종교반란이 ${g.religiousGoal || religiousGoal(room.players.length)}일 성공했습니다. 주교의 승리입니다.`);
  else if (rebelWon) finish(room, 'rebel', `반란이 ${g.revoltGoal || revoltGoal(room.players.length)}일 성공했습니다. 반란군의 승리입니다.`);
}
function redistribution(room) {
  const g = room.game;
  g.phase = 'redistribute';
  g.pending = { done: [] };
  log(room, '아침 재분배를 선택합니다. 수락·거절 여부는 비공개입니다.');
  for (const p of room.players.filter(p => executionBlocked(room, p))) {
    const count = initialHandSize(p.role);
    p.hand = draw(count); g.pending.done.push(p.id);
    note(p, `처형 당일 아침 재분배를 자동 수락하여 새 카드 ${count}장을 받았습니다. 낮 행동은 건너뜁니다.`, 'gain');
  }
}
function daytime(room) {
  for (const p of room.players.filter(p => !p.surrendered&&p.job === 'blacksmith')) {
    const count = randomInt(1, 11);
    p.hand.push(...Array.from({length:count}, () => card('resource')));
    note(p, `대장장이의 낮 보급: 자원 ${count}장을 받았습니다.`, 'gain', {kind:'blacksmithSupply', count});
  }
  const m = merchant(room);
  if (m) {
    room.game.phase = 'market'; room.game.round = 1; room.game.turn = 0;
    room.game.pending = { done: room.players.filter(p => p === m || executionBlocked(room, p)).map(p => p.id) };
    log(room, '낮의 익명 상점이 열렸습니다. 상인 이외의 플레이어가 구매를 마치면 낮의 세 바퀴를 시작합니다.');
  } else normalDay(room);
}
function normalDay(room) {
  const g = room.game;
  g.phase = 'day'; g.round = 1; g.turn = 0; g.pending = null;
  log(room, '낮이 시작되었습니다. 왕부터 세 바퀴를 진행합니다.');
}
function merchantEvening(room) {
  if (!merchant(room)) { night(room); return; }
  room.game.phase = 'merchantEvening'; room.game.pending = { craftUsed: false, kind: null };
  log(room, '상인의 저녁 준비 시간입니다. 준비를 마치면 밤이 시작됩니다.');
}
function nextTurn(room) {
  const g = room.game;
  g.pending = null;
  do {
    g.turn++;
    if (g.turn >= g.order.length) { g.turn = 0; g.round++; }
   } while (g.round <= 3 && (executionBlocked(room, player(room, g.order[g.turn]))||player(room,g.order[g.turn]).surrendered));
  if (g.round > 3) { g.phase = 'evening'; log(room, '저녁입니다. 왕이 정책을 선택합니다.'); }
}
function night(room) {
  const g = room.game;
  g.pending = null;
  if (g.day === g.maxDays) { finish(room, 'royal', `마지막 날까지 반란 성공을 ${g.revoltGoal || revoltGoal(room.players.length)}일 미만으로 막았습니다. 왕과 시민의 승리입니다.`); return; }
  g.phase = 'night'; g.pending = { done: [] }; g.revolt = 0; g.bombs = 0;
  g.religiousScheduled = false;
  log(room, '밤이 되었습니다. 반란군이 비밀리에 행동합니다.');
}
function nextMorning(room) {
  const g = room.game;
  g.day++; g.phase = 'morning'; g.pending = null;
  g.religiousActive = !!g.religiousScheduled;
  g.religiousRevolt = g.religiousActive ? room.players.find(p => p.job === 'bishop')?.churchInfluence || 0 : 0;
  morningCards(room);
  log(room, `${g.day}일 차 아침. ${g.revolt ? `반란력 ${g.revolt}점이 공개되었습니다.` : '발생한 반란이 없습니다.'}`, 'dawn');
  if (g.religiousActive) log(room, `종교반란이 발생했습니다. 종교반란력 ${g.religiousRevolt}점이 공개되었습니다.`, 'dawn');
}
function bishopNight(room) {
  if (room.players.some(p => p.job === 'bishop'&&!p.surrendered)) {
    room.game.phase = 'bishopNight'; room.game.pending = null;
  } else nextMorning(room);
}
const allDone = (room, done) => room.players.filter(p=>!p.surrendered).every(p => done.includes(p.id));
function expeditionCards(room) {
  const g = room.game;
  g.phase = 'expeditionCards'; g.pending.done = g.pending.participants.filter(id => player(room, id).job === 'merchant');
  for (const id of g.pending.done) note(player(room, id), '상인의 원정 카드 제출을 자동 0장으로 처리했습니다.', 'submit');
}
function finishExpedition(room) {
  const g = room.game;
  const score = g.pending.total;
  const high = g.pending.difficulty === 'high';
  const great = score >= (high ? 40 : 25), success = score >= (high ? 20 : 15);
  const reward = great ? (high ? 25 : 9) : success ? (high ? 15 : 4) : 0;
  const receivers = room.players.filter(p => !high || p.role !== 'rebel');
  g.lastExpedition = { day: g.day, difficulty: high?'high':'low', result: great ? 'great' : success ? 'success' : 'failure', score, reward, contributorCount: (g.pending.contributors || []).length, participantCount: g.pending.participants.length };
  if (reward) receivers.forEach(p => grant(p, reward, `${high ? '상급' : '하급'} 원정 보상`));
  else if (high) receivers.forEach(p => { p.hand = p.hand.filter(c => isReligionCard(c.type)); note(p, '상급 원정 실패로 교단·전도카드를 제외한 손패를 버렸습니다.', 'loss'); });
  log(room, `${high ? '상급' : '하급'} 원정 ${great ? '대성공' : success ? '성공' : '실패'}! 총 공격력 ${score}점 · 카드 제출 ${g.lastExpedition.contributorCount}명.${reward ? ` ${high ? '반란군 제외 전원' : '전원'} 카드 ${reward}장 지급.` : high ? ' 반란군 제외 전원의 손패를 전부 버립니다.' : ' 추가 패널티 없음.'}`, reward ? 'success' : 'failure');
  redistribution(room);
}
export function act(room, id, action) {
  const p = player(room, id);
  must(p, '참가자를 찾을 수 없습니다.');
  must(action && typeof action.type === 'string', '행동이 올바르지 않습니다.');
  const type = action.type;
  if (type === 'addBot' || type === 'removeBot') {
    must(room.host === id && room.status === 'lobby', '방장만 대기실에서 AI를 추가하거나 제거할 수 있습니다.');
    if (type === 'addBot') {
      must(room.players.filter(p => p.bot).length < 8, '한 방에 AI는 최대 8명까지 추가할 수 있습니다.');
      const names = ['루카', '아리아', '레온', '세라', '에단', '미라', '카이', '노아'];
      let number = 1, name;
      do { name = `${names[(number - 1) % names.length]} [AI ${number++}]`; } while (room.players.some(p => p.name === name));
      const bot = joinRoom(room, name); bot.bot = true; bot.online = true;
    } else {
      const target = player(room, action.target);
      must(target?.bot, '제거할 AI 참가자를 선택하세요.');
      room.players = room.players.filter(p => p !== target);
      room.config = defaultRoles(room.players.length);
    }
    return;
  }
  if (type === 'config') {
    must(room.status === 'lobby' && room.host === id, '방장만 대기실에서 설정할 수 있습니다.');
    const c = action.roles;
    must(c && Object.keys(c).length === 4 && Object.keys(ROLES).every(k => Number.isInteger(c[k]) && c[k] >= 0 && c[k] <= room.players.length), '진영 설정이 올바르지 않습니다.');
    must((room.citizenJobs || []).length <= c.citizen, '선택한 시민 직업보다 시민 인원을 줄일 수 없습니다. 먼저 시민 직업 선택을 줄이세요.');
    room.config = { ...c }; return;
  }
  if (type === 'neutralJobs') {
    must(room.status === 'lobby' && room.host === id, '방장만 대기실에서 중립 직업을 선택할 수 있습니다.');
    must(Array.isArray(action.jobs) && new Set(action.jobs).size === action.jobs.length && action.jobs.every(job => Object.hasOwn(NEUTRAL_JOBS, job)), '중립 직업 선택이 올바르지 않습니다.');
    must(room.players.length >= 3 || action.jobs.length === 0, '2인 게임에는 중립 직업을 넣을 수 없습니다.');
    room.neutralJobs = [...action.jobs]; return;
  }
  if (type === 'citizenJobs') {
    must(room.status === 'lobby' && room.host === id, '방장만 대기실에서 시민 직업을 선택할 수 있습니다.');
    must(Array.isArray(action.jobs) && new Set(action.jobs).size === action.jobs.length && action.jobs.every(job => Object.hasOwn(CITIZEN_JOBS, job)) && action.jobs.length <= room.config.citizen, '시민 직업은 시민 인원 이내에서 중복 없이 선택하세요.');
    room.citizenJobs = [...action.jobs]; return;
  }
  if (type === 'start') { startGame(room, id); return; }
  if (type === 'rematch') {
    must(room.status === 'finished' && room.host === id, '게임 종료 후 방장만 대기실로 돌아갈 수 있습니다.');
    room.status = 'lobby'; room.game = null;
    room.players.forEach(p => { if(p.surrendered)p.bot=false;p.surrendered=false;p.takeover=false;p.absent=false;p.hand = []; p.role = null; p.job = null; p.churchInfluence = 0; p.notes = []; }); return;
  }
  if(['surrender','requestSurrender','requestDraw','gameVote'].includes(type)){voteGame(room,id,action);return;}
  must(room.status === 'playing', '진행 중인 게임이 아닙니다.');
  const g = room.game;
  must(!p.surrendered,'기권한 플레이어는 게임 행동을 할 수 없습니다.');
  must(!executionBlocked(room, p) || ['evening', 'tax', 'merchantEvening', 'night', 'bishopNight'].includes(g.phase), '처형된 당일 아침과 낮에는 행동할 수 없습니다.');
  if (g.phase === 'morning') {
    must(id === g.king, '왕의 행동을 기다려주세요.');
    must(['mediate', 'execute', 'expedition'].includes(type), '아침 행동을 선택하세요.');
    if (type === 'execute') must(canExecute(room), '5인 이하 게임에서는 실제 처형을 2일 연속 할 수 없습니다.');
    if (type === 'mediate') {
      must(p.role !== 'rebel', '반란군은 중재 행동에 참여할 수 없습니다.');
      const revoltType = action.revoltType || (g.revolt > 0 && !g.religiousActive ? 'rebel' : g.religiousActive && !g.revolt ? 'religion' : null);
      must(['rebel', 'religion'].includes(revoltType), '중재할 반란을 선택하세요.');
      must(revoltType === 'rebel' ? g.revolt > 0 : g.religiousActive, '발생한 반란이 없습니다.');
      g.phase = 'mediationSupport'; g.pending = { revoltType, done: [], supporters: [], total: 0 };
      if(!room.players.some(q=>!q.surrendered&&q.id!==g.king&&(revoltType==='religion'||q.role!=='rebel')))g.phase='mediationKing';
      log(room, `왕이 ${revoltType === 'religion' ? '종교반란' : '반란'} 중재를 선포했습니다. 지원은 취소할 수 없습니다.${g.revolt > 0 && g.religiousActive ? ' 선택하지 않은 반란은 자동 성공합니다.' : ''}`, 'royal');
    } else {
      resolveRevolt(room, null);
      if (room.status === 'finished') return;
      if (type === 'execute') {
        g.phase = 'executionVote'; g.pending = { votes: {}, done: [] };
        log(room, '왕이 사형 투표를 선포했습니다. 최다 득표자가 동률이면 아무도 처형하지 않습니다.', 'royal');
      } else {
        g.phase = 'expeditionVote'; g.pending = { votes: {}, done: [] };
        log(room, '왕이 원정을 선포했습니다. 전원이 하급·상급 난이도에 투표하세요. 동률은 하급입니다.', 'royal');
      }
    }
  } else if (g.phase === 'executionVote') {
    must(type === 'voteExecution' && !g.pending.done.includes(id), '사형 대상에 한 번 투표하세요.');
    const target = player(room, action.target);
    must(target && target.id !== g.king, '왕 이외의 사형 대상을 선택하세요.');
    g.pending.votes[id] = target.id; g.pending.done.push(id);
    note(p, `사형 투표: ${target.name}님에게 투표했습니다.`, 'submit');
    if (allDone(room, g.pending.done)) {
      const tallies = room.players.filter(p => p.id !== g.king).map(p => ({ id: p.id, count: Object.values(g.pending.votes).filter(id => id === p.id).length }));
      const most = Math.max(...tallies.map(t => t.count));
      const tied = tallies.filter(t => t.count === most).map(t => t.id);
      const executed = tied.length === 1 ? player(room, tied[0]) : null;
      g.lastExecution = { day: g.day, target: executed?.id || null, tallies, tied };
      if (executed) {
        executed.hand = []; executed.executedDay = g.day; g.lastExecutionDay = g.day;
        note(executed, '처형으로 교단·전도·영구 카드를 포함한 모든 카드를 몰수당했습니다. 당일 아침·낮 행동이 금지되며 재분배는 자동 수락합니다.', 'loss');
      }
      log(room, `사형 투표 결과: ${tallies.map(t => `${player(room, t.id).name} ${t.count}표`).join(' / ')}. ${executed ? `${executed.name}님 처형 — 모든 카드 몰수, 당일 아침·낮 행동 금지.` : '최다 득표 동률로 아무도 처형되지 않았습니다.'}`, executed ? 'loss' : 'notice');
      redistribution(room);
    }
  } else if (g.phase === 'mediationSupport' || g.phase === 'mediationKing') {
    const religion = g.pending.revoltType === 'religion';
    must(religion || p.role !== 'rebel', '반란군은 일반 반란 중재 행동과 지원에 참여할 수 없습니다.');
    const support = g.phase === 'mediationSupport';
    must(type === 'contribute' && (support ? id !== g.king : id === g.king), '지금은 중재 카드를 제출할 차례가 아닙니다.');
    must(!g.pending.done.includes(id), '이미 제출했습니다.');
    let money = 0, cards;
    if (p.job === 'merchant') {
      must(action.cards === undefined || Array.isArray(action.cards) && action.cards.length === 0, '상인은 중재에 카드를 제출할 수 없습니다.');
      money = action.money ?? 0;
      must(Number.isInteger(money) && money >= 0 && money % 2 === 0 && money <= p.money, '중재에 사용할 돈은 보유한 돈 안에서 2점 단위로 선택하세요.');
      cards = []; p.money -= money;
    } else cards = selected(p, action.cards, t => !!CARDS[t].mediation && (!religion || !isReligionCard(t)));
    g.pending.total += money / 2 + cards.reduce((sum, c) => sum + CARDS[c.type].mediation, 0);
    const influence = cards.reduce((sum, c) => sum + (c.type === 'church' ? 2 : c.type === 'evangelism' ? 6 : 0), 0);
    const bishop = room.players.find(p => p.job === 'bishop');
    if (influence && bishop) { bishop.churchInfluence = (bishop.churchInfluence || 0) + influence; note(bishop, `교단·전도카드 중재 사용으로 교단영향력 +${influence} · 현재 ${bishop.churchInfluence}점`); }
    consume(p, cards, true); g.pending.done.push(id);
    note(p, p.job === 'merchant' ? `중재에 돈 ${money}점 사용 · 중재력 ${money / 2}점 지원.` : `중재 카드 ${cards.length}장 제출 확정. 되돌릴 수 없습니다.`, 'submit');
    if (cards.length || money) { g.pending.supporters.push(id); log(room, `${p.name}님이 중재에 지원했습니다.`); }
    if (support && room.players.filter(p => !p.surrendered&&p.id !== g.king && (religion || p.role !== 'rebel')).every(p => g.pending.done.includes(p.id))) g.phase = 'mediationKing';
    else if (!support) {
      resolveRevolt(room, g.pending.total, g.pending.revoltType || 'rebel');
      if (room.status !== 'finished') redistribution(room);
    }
  } else if (g.phase === 'expeditionVote') {
    must(type === 'voteExpedition' && ['low', 'high'].includes(action.difficulty) && !g.pending.done.includes(id), '원정 난이도에 한 번 투표하세요.');
    g.pending.votes[id] = action.difficulty; g.pending.done.push(id);
    note(p, `${action.difficulty==='high'?'상급':'하급'} 원정에 투표했습니다.`, 'submit');
    if (allDone(room, g.pending.done)) {
      const high = Object.values(g.pending.votes).filter(v => v === 'high').length;
      const difficulty = high > room.players.length / 2 ? 'high' : 'low';
      g.pending = { difficulty, done: difficulty === 'low' ? [g.king] : [], participants: [g.king], contributors: [], total: 0, required: expeditionCompanions(room.players.length) };
      g.phase = difficulty === 'high' ? 'expeditionSelect' : 'expeditionJoin';
      log(room, `원정 투표 결과: 하급 ${room.players.length - high}표 / 상급 ${high}표 → ${difficulty === 'high' ? '상급 (왕이 동행자 지명)' : '하급 (자유 참가)'}`, 'royal');
    }
  } else if (g.phase === 'expeditionSelect') {
    must(type === 'selectExpedition' && id === g.king, '왕이 상급 원정 동행자를 지명할 차례입니다.');
    must(Array.isArray(action.targets) && action.targets.length === g.pending.required && new Set(action.targets).size === action.targets.length && action.targets.every(t => t !== g.king && player(room, t)), `다른 플레이어 ${g.pending.required}명을 중복 없이 지명하세요.`);
    g.pending.participants = [g.king, ...action.targets]; expeditionCards(room);
    note(p, `상급 원정 지명: ${action.targets.map(id=>player(room,id).name).join(', ')}`, 'royal');
    action.targets.forEach(id=>note(player(room,id),'왕이 당신을 상급 원정에 지명했습니다. 다른 지명자는 비공개이며 참가를 거절할 수 없습니다.','royal'));
    log(room, `왕이 상급 원정 동행자 ${action.targets.length}명을 비공개로 지명했습니다.`, 'royal');
  } else if (g.phase === 'expeditionJoin') {
    must(type === 'joinExpedition' && typeof action.join === 'boolean' && !g.pending.done.includes(id), '참가 여부를 이미 결정했거나 올바르지 않습니다.');
    g.pending.done.push(id);
    if (action.join) g.pending.participants.push(id);
    note(p, `하급 원정 ${action.join?'참가':'불참'}를 확정했습니다.`, 'submit');
    if (allDone(room, g.pending.done)) {
      expeditionCards(room);
      log(room, `원정 참가자: ${g.pending.participants.map(id => player(room, id).name).join(', ')}`);
    }
  } else if (g.phase === 'expeditionCards') {
    must(p.job !== 'merchant', '상인의 원정 제출은 자동 0장입니다.');
    must(type === 'contribute' && g.pending.participants.includes(id) && !g.pending.done.includes(id), '원정 참가자만 한 번 제출할 수 있습니다.');
    const cards = selected(p, action.cards, t => expeditionPower(t, p.role) !== null);
    g.pending.total += cards.reduce((sum, c) => sum + expeditionPower(c.type, p.role), 0);
    const influence = cards.filter(c => c.type === 'church').length * 2;
    const bishop = room.players.find(p => p.job === 'bishop');
    if (influence && bishop) { bishop.churchInfluence = (bishop.churchInfluence || 0) + influence; note(bishop, `교단카드 원정 사용으로 교단영향력 +${influence} · 현재 ${bishop.churchInfluence}점`); }
    consume(p, cards, true); g.pending.done.push(id);
    if(cards.length) { g.pending.contributors ||= []; g.pending.contributors.push(id); }
    note(p, `원정 카드 ${cards.length}장 제출 확정. 영구 카드는 유지됩니다.`, 'submit');
    if (g.pending.participants.every(id => g.pending.done.includes(id))) finishExpedition(room);
  } else if (g.phase === 'redistribute') {
    must(type === 'redistribute' && typeof action.accept === 'boolean' && !g.pending.done.includes(id), '이미 재분배를 결정했거나 올바르지 않습니다.');
    if (action.accept) { const count = initialHandSize(p.role); discardAll(p); p.hand.push(...draw(count)); note(p, `아침 재분배를 수락하여 새 카드 ${count}장을 받았습니다. 보호되는 교단·전도카드는 유지됩니다.`); }
    else {
      note(p, '아침 재분배를 거절하여 기존 손패를 유지합니다.');
      if (p.hand.length < 8) grant(p, 8 - p.hand.length, '재분배 거절 보충 (최소 8장)');
    }
    g.pending.done.push(id);
    if (allDone(room, g.pending.done)) daytime(room);
  } else if (g.phase === 'market') {
    const m = merchant(room);
    must(m && p !== m && !g.pending.done.includes(id), '상인 이외의 구매 차례인 플레이어만 상점을 이용할 수 있습니다.');
    must(type === 'marketBuy' || type === 'marketDone', '상품 구매 또는 구매 완료를 선택하세요.');
    if (type === 'marketDone') {
      g.pending.done.push(id); note(p, '상점 구매를 마쳤습니다.', 'submit');
      if (allDone(room, g.pending.done)) normalDay(room);
    } else {
      const item = m.stock.find(item => item.id === action.stock);
      const quantity = action.quantity;
      must(item && Number.isInteger(quantity) && quantity >= 1 && quantity <= item.cards.length, '상품이 품절되었거나 구매 수량이 올바르지 않습니다.');
      const payment = selected(p, action.cards, t => !isReligionCard(t) || p.job === 'bishop');
      must(payment.length === item.price * quantity, `구매 대금으로 카드 ${item.price * quantity}장을 선택하세요.`);
      consume(p, payment);
      p.hand.push(...item.cards.splice(0, quantity));
      m.money += payment.length * 2;
      m.stock = m.stock.filter(item => item.cards.length);
      note(p, `${CARDS[item.type].name} ${quantity}장 구매 완료 · 카드 ${payment.length}장 지불.`, 'gain');
      note(m, `${CARDS[item.type].name} ${quantity}장 판매 · 돈 +${payment.length * 2}점 · 보유 ${m.money}점`, 'gain');
    }
  } else if (g.phase === 'day') {
    if (g.pending?.kind === 'trade') handleTrade(room, p, action);
    else if (g.pending?.kind === 'royalSupport') handleRoyalSupport(room, p, action);
    else {
      must(g.order[g.turn] === id, '자신의 차례를 기다려주세요.');
      if (g.pending?.kind === 'craft') {
        must(type === 'craft' || type === 'craftDone', '제작 중입니다. 제작을 완료하세요.');
        if (type === 'craftDone') { note(p, '제작 차례를 마쳤습니다.'); nextTurn(room); }
        else craftCards(p, action);
      } else if (g.round === 1) {
        must(['trade', 'gather', 'draw3'].includes(type), '거래·채집·카드받기 중 선택하세요.');
        if (type === 'trade') {
          must(p.job !== 'merchant', '상인은 비밀거래를 할 수 없습니다.');
          const target = player(room, action.target);
          must(target && target.id !== id, '거래 상대를 선택하세요.');
          must(!executionBlocked(room, target), '처형 당일에는 해당 플레이어에게 거래를 요청할 수 없습니다.');
          if (target.job === 'merchant') {
            note(p, '상대방이 거래를 거절했습니다. 차례가 끝납니다.');
            note(target, '비밀거래 요청을 자동 거절했습니다. 상인은 비밀거래를 할 수 없습니다.'); nextTurn(room);
          } else {
            g.pending = { kind: 'trade', from: id, to: target.id, accepted: false, submissions: {} };
            note(target, `${p.name}님이 거래를 신청했습니다.`);
          }
        } else {
           if (type === 'gather') { const count = p.job === 'blacksmith' ? 9 : 6; p.hand.push(...Array.from({ length: count }, () => card('resource'))); note(p, `채집으로 자원 ${count}장을 받았습니다.`, 'gain'); }
           else grant(p, 4, '카드받기');
          nextTurn(room);
        }
      } else if (g.round === 2) {
        must(type === 'beginCraft' || type === 'hunt', '제작 또는 사냥을 선택하세요.');
        if (type === 'beginCraft') { g.pending = { kind: 'craft' }; note(p, '제작을 시작했습니다.', 'submit'); }
        else {
          const cards = selected(p, action.cards, t => !!CARDS[t].attack);
          const score = cards.reduce((sum, c) => sum + CARDS[c.type].attack, 0);
          consume(p, cards, true);
          const goal = huntGoal(p.job);
          if (score >= goal) p.hand.push(...draw(8));
          note(p, `사냥 ${score >= goal ? '성공! 카드 +8장을 받았습니다.' : `실패 — 공격력 ${goal}점이 필요합니다.`} 공격력 ${score}점.`, score >= goal ? 'success' : 'failure');
          nextTurn(room);
        }
      } else {
        must(['replace', 'refresh', 'revealHand', 'steal', 'royalSupport'].includes(type), '세 번째 바퀴의 행동을 선택하세요.');
        must(p.role !== 'king' || !['revealHand', 'steal'].includes(type), '왕은 다른 사람의 손패를 보거나 빼앗을 수 없습니다.');
        if (type === 'royalSupport') {
          const target = player(room, action.target);
          must(p.role === 'king' && target && target !== p && !executionBlocked(room, target), '왕이 행동 가능한 다른 플레이어에게 왕국지원을 요청할 수 있습니다.');
          g.pending = { kind: 'royalSupport', from: p.id, to: target.id, accepted: false };
          note(target, `${p.name}님이 왕국지원을 요청했습니다. 수락하면 카드 3~5장을 왕에게 제공합니다.`);
        }
        if (type === 'replace') { const count = discardAll(p); p.hand.push(...draw(count)); note(p, '보호되는 교단·전도카드를 유지하고 나머지 손패를 같은 장수의 새 카드로 교체했습니다.'); }
        if (type === 'refresh') {
          const cards = selected(p, action.cards, t => !isReligionCard(t));
          must(cards.length <= 5, '교체할 카드는 최대 5장입니다.');
          consume(p, cards); grant(p, 5, `5장 받기 (기존 ${cards.length}장 교체 · 추가 ${5 - cards.length}장)`);
        }
        if (type === 'revealHand') {
          const target = player(room, action.target);
          must(target && target.id !== id, '확인할 다른 플레이어를 선택하세요.');
          const cardTypes = target.hand.map(c => c.type);
          note(p, `${target.name}님의 손패 전체 확인 (${cardTypes.length}장): ${cardTypes.map(t => CARDS[t].name).join(', ') || '없음'}`, 'notice', { kind: 'hand', target: target.id, name: target.name, day: g.day, cardTypes });
        }
        if (type === 'steal') {
          const target = player(room, action.target);
          must(target && target.id !== id, '카드를 가져올 다른 플레이어를 선택하세요.');
          const cards = shuffle(target.hand).slice(0, 2);
          consume(target, cards); p.hand.push(...cards);
          convertEvangelism(room, p, cards);
          note(p, `${target.name}님에게서 무작위 카드 ${cards.length}장을 가져왔습니다.`, 'gain');
          if(cards.length) note(target, `카드 ${cards.length}장을 빼앗겼습니다. 손패를 확인하세요.`, 'stolen', {kind:'theft',count:cards.length});
        }
        if (type !== 'royalSupport') nextTurn(room);
      }
    }
  } else if (g.phase === 'evening') {
    must(id === g.king, '왕이 정책을 선택할 차례입니다.');
    must(['tax', 'wanted', 'aid'].includes(type), '저녁 정책을 선택하세요.');
    if (type === 'tax') {
      g.phase = 'tax'; g.pending = { done: [g.king], payments: {} };
      log(room, '왕이 세금을 징수합니다. 왕 제외 전원이 카드 3장을 선택하여 납부하세요.', 'royal');
    } else if (type === 'wanted') {
      const target = player(room, action.target);
      must(target && target.id !== id, '검사할 다른 플레이어를 선택하세요.');
      must(!executionBlocked(room, target), '처형 당일에는 지명수배 대상이 될 수 없습니다.');
      const rebellion = target.hand.some(c => c.type === 'rebellion');
      const agitation = target.hand.some(c => c.type === 'agitation');
      note(p, `지명수배 검사: ${target.name} / 반란 ${rebellion ? '있음' : '없음'} / 선동 ${agitation ? '있음' : '없음'}`);
      if (rebellion) {
        target.hand = target.hand.filter(c => !['rebellion', 'agitation', 'weapon', 'bomb'].includes(c.type));
        note(target, '지명수배에서 반란카드가 발견되어 반란·선동·병기·폭탄 카드를 모두 버렸습니다.', 'loss');
      }
      log(room, `지명수배: ${target.name}님 ${rebellion ? '반란카드 발견 — 반란·선동·병기·폭탄을 버렸습니다.' : '반란카드 없음 — 몰수하지 않습니다.'}`, rebellion ? 'loss' : 'royal');
      merchantEvening(room);
    } else {
      room.players.filter(p => p.id !== g.king).forEach(p => grant(p, 6, '시민지원'));
      log(room, '시민지원: 왕을 제외한 전원에게 카드 6장을 지급했습니다.', 'royal');
      merchantEvening(room);
    }
  } else if (g.phase === 'tax') {
    must(type === 'payTax' && !g.pending.done.includes(id), '이미 납부했거나 납부 대상이 아닙니다.');
    const cards = selected(p, action.cards);
    must(cards.length === Math.min(3, p.hand.length), '손패에서 3장(부족하면 전부)을 선택하세요.');
    g.pending.payments ||= {};
    g.pending.payments[id] = cards.map(c => c.id); g.pending.done.push(id);
    note(p, `세금 ${cards.length}장을 확정했습니다. 전원이 납부하면 동시에 왕에게 이전됩니다.`, 'submit');
    if (allDone(room, g.pending.done)) {
      const payments = room.players.filter(p => !p.surrendered&&p.id !== g.king).map(p => ({ p, cards: selected(p, g.pending.payments[p.id]) }));
      const k = player(room, g.king);
      for (const payment of payments) { consume(payment.p, payment.cards); k.hand.push(...payment.cards); note(payment.p, `세금 ${payment.cards.length}장을 납부했습니다.`, 'submit'); }
      note(k, `전원 세금 납부 완료: 카드 ${payments.reduce((sum, p) => sum + p.cards.length, 0)}장을 동시에 받았습니다.`, 'gain');
      merchantEvening(room);
    }
  } else if (g.phase === 'merchantEvening') {
    must(p.job === 'merchant', '상인의 저녁 준비를 기다려주세요.');
    if (g.pending.kind === 'craft') {
      must(type === 'craft' || type === 'craftDone', '제작창에서 제작하거나 제작창을 종료하세요.');
      if (type === 'craftDone') { g.pending.kind = null; note(p, '저녁 제작창을 종료했습니다. 다음 날 저녁까지 다시 열 수 없습니다.'); }
      else craftCards(p, action);
    } else {
      must(['beginCraft', 'displayGoods', 'changePrice', 'merchantBuy', 'merchantDone'].includes(type), '상인의 저녁 행동을 선택하세요.');
      if (type === 'beginCraft') {
        must(!g.pending.craftUsed, '저녁 제작창은 하루에 한 번만 열 수 있습니다.');
        g.pending.craftUsed = true; g.pending.kind = 'craft';
      } else if (type === 'merchantDone') night(room);
      else if (type === 'merchantBuy') {
        const option = Object.hasOwn(MERCHANT_BUYS, action.product) ? MERCHANT_BUYS[action.product] : null;
        const quantity = action.quantity;
        must(option && Number.isInteger(quantity) && quantity >= 1 && quantity <= 1000 && option.cost * quantity <= p.money, '구매 수량이 올바르지 않거나 돈이 부족합니다.');
        p.money -= option.cost * quantity;
        const count = option.count * quantity;
        p.hand.push(...(action.product === 'random' ? draw(count) : Array.from({ length: count }, () => card(action.product))));
        note(p, `돈 ${option.cost * quantity}점으로 ${action.product === 'random' ? '랜덤 카드' : CARDS[action.product].name} ${count}장을 구매했습니다.`, 'gain');
      } else if (type === 'changePrice') {
        const item = p.stock.find(item => item.id === action.stock);
        must(item && Number.isInteger(action.price) && action.price >= 1 && action.price <= 5, '진열 상품과 가격 1~5장을 확인하세요.');
        item.price = action.price; note(p, `${CARDS[item.type].name} 가격을 카드 ${action.price}장으로 변경했습니다.`);
      } else {
        const cards = selected(p, action.cards);
        must(cards.length > 0 && Number.isInteger(action.price) && action.price >= 1 && action.price <= 5, '진열할 카드와 새 상품 가격 1~5장을 선택하세요.');
        const groups = new Map();
        cards.forEach(c => { if (!groups.has(c.type)) groups.set(c.type, []); groups.get(c.type).push(c); });
        const newTypes = [...groups.keys()].filter(type => !p.stock.some(item => item.type === type));
        must(p.stock.length + newTypes.length <= 5, '진열장은 최대 5종류입니다. 한 종류가 모두 팔려야 새 종류를 진열할 수 있습니다.');
        for (const [type, group] of groups) must((p.stock.find(item => item.type === type)?.cards.length || 0) + group.length <= 30, '한 종류는 최대 30장까지 진열할 수 있습니다.');
        consume(p, cards);
        for (const [type, group] of groups) {
          const item = p.stock.find(item => item.type === type);
          if (item) item.cards.push(...group);
          else p.stock.push({ id: uid(), type, price: action.price, cards: group });
        }
        note(p, `카드 ${cards.length}장을 손패에서 진열장으로 옮겼습니다.`, 'submit');
      }
    }
  } else if (g.phase === 'night') {
    must(type === 'revolt' && p.role === 'rebel' && !g.pending.done.includes(id), '반란군만 밤에 한 번 제출할 수 있습니다.');
    const cards = selected(p, action.cards, t => !!CARDS[t].revolt);
    g.revolt += cards.reduce((sum, c) => sum + CARDS[c.type].revolt, 0);
    g.bombs = (g.bombs || 0) + cards.filter(c => c.type === 'bomb').length;
    consume(p, cards, true); g.pending.done.push(id); note(p, '밤 카드 제출을 완료했습니다.', 'submit');
    if (room.players.filter(p => !p.surrendered&&p.role === 'rebel').every(p => g.pending.done.includes(p.id))) bishopNight(room);
  } else if (g.phase === 'bishopNight') {
    must(p.role === 'neutral' && p.job === 'bishop', '주교의 밤 행동을 기다려주세요.');
    must(['evangelize', 'religiousRevolt', 'reform', 'reclaimChurch', 'bishopDone'].includes(type), '종교전도·종교반란·종교개혁·교단회수 또는 밤 행동 완료를 선택하세요.');
    if (type === 'bishopDone') nextMorning(room);
    else {
      const costType = ['reform', 'reclaimChurch'].includes(type) ? 'evangelism' : 'church';
      const count = type === 'reclaimChurch' ? 1 : type === 'religiousRevolt' ? 6 : 3;
      const costs = p.hand.filter(c => c.type === costType).slice(0, count);
      must(costs.length === count, `${CARDS[costType].name}카드 ${count}장이 필요합니다.`);
      const target = ['evangelize', 'reclaimChurch'].includes(type) ? player(room, action.target) : null;
      if (['evangelize', 'reclaimChurch'].includes(type)) must(target && target !== p, '행동할 다른 플레이어를 선택하세요.');
      if (type === 'religiousRevolt') must(!g.religiousScheduled, '종교반란은 한 밤에 한 번만 선언할 수 있습니다.');
      consume(p, costs);
      if (type === 'evangelize') {
        const stolen = shuffle(target.hand).slice(0, 1);
        consume(target, stolen); p.hand.push(...stolen);
        target.hand.push(card('evangelism'));
        note(p, `종교전도: ${target.name}님에게서 무작위 카드 ${stolen.length}장을 가져오고 전도카드 1장을 전달했습니다.`, 'gain');
        if (stolen.length) note(target, '종교전도로 카드 1장을 빼앗겼습니다.', 'stolen', { kind: 'theft', count: 1 });
        note(target, '종교전도로 전도카드 1장을 받았습니다.', 'gain');
      } else if (type === 'reclaimChurch') {
        const reclaimed = target.hand.filter(c => c.type === 'church');
        consume(target, reclaimed); p.hand.push(...reclaimed);
        note(p, `교단회수: 전도카드 1장을 소모하여 ${target.name}님의 교단카드 ${reclaimed.length}장을 모두 가져왔습니다.`, 'gain');
        if (reclaimed.length) note(target, `교단카드 ${reclaimed.length}장을 빼앗겼습니다.`, 'stolen', { kind: 'theft', count: reclaimed.length });
      } else if (type === 'religiousRevolt') {
        g.religiousScheduled = true;
        note(p, '종교반란을 선언했습니다. 다음 아침, 밤 행동 종료 시의 교단영향력이 종교반란력이 됩니다.', 'submit');
      } else {
        let discardedChurch = 0;
        for (const other of room.players.filter(other => other !== p)) {
          const removed = other.hand.filter(c => c.type === 'church');
          discardedChurch += removed.filter(c => c.type === 'church').length;
          consume(other, removed);
          if (removed.length) note(other, '종교개혁으로 교단카드를 전부 버렸습니다. 전도카드는 유지됩니다.', 'loss');
        }
        p.churchInfluence = (p.churchInfluence || 0) + discardedChurch * 2;
        note(p, `종교개혁: 타인의 교단카드 ${discardedChurch}장을 버려 교단영향력 +${discardedChurch * 2} · 현재 ${p.churchInfluence}점`);
      }
    }
  } else throw new RuleError('현재 단계에서 사용할 수 없는 행동입니다.');
  if (room.status === 'playing') merchantVictory(room);
  if (room.status === 'playing') ironVictory(room);
  room.updatedAt = Date.now();
}
function handleTrade(room, p, action) {
  const t = room.game.pending;
  must(p.id === t.from || p.id === t.to, '거래 당사자가 아닙니다.');
  if (!t.accepted) {
    must(action.type === 'tradeAnswer' && p.id === t.to && typeof action.accept === 'boolean', '상대방의 거래 응답을 기다려주세요.');
    if (!action.accept) {
      note(p, '거래를 거절했습니다.', 'submit');
      note(player(room, t.from), '상대방이 거래를 거절했습니다. 차례가 끝납니다.'); nextTurn(room);
    } else { t.accepted = true; note(p, '거래를 수락했습니다. 줄 카드를 선택하세요.', 'submit'); }
  } else {
    must(action.type === 'tradeSubmit' && !Object.hasOwn(t.submissions, p.id), '이미 거래 카드를 확정했습니다.');
    const cards = selected(p, action.cards);
    // 제출 카드는 교환 확정 시까지 서버에만 보관합니다.
    t.submissions[p.id] = cards.map(c => c.id);
    if ([t.from, t.to].every(id => Object.hasOwn(t.submissions, id))) {
      const a = player(room, t.from), b = player(room, t.to);
      const ac = selected(a, t.submissions[a.id]), bc = selected(b, t.submissions[b.id]);
      consume(a, ac); consume(b, bc); a.hand.push(...bc); b.hand.push(...ac);
      convertEvangelism(room, a, bc); convertEvangelism(room, b, ac);
      note(a, `거래 완료: ${ac.length}장을 주고 ${bc.length}장을 받았습니다.`, 'trade');
      note(b, `거래 완료: ${bc.length}장을 주고 ${ac.length}장을 받았습니다.`, 'trade');
      nextTurn(room);
    }
  }
}
function handleRoyalSupport(room, p, action) {
  const t = room.game.pending;
  must(p.id === t.to, '왕국지원을 요청받은 플레이어의 응답을 기다려주세요.');
  if (!t.accepted) {
    must(action.type === 'supportAnswer' && typeof action.accept === 'boolean', '왕국지원 수락 또는 거절을 선택하세요.');
    if (action.accept) {
      must(p.hand.length >= 3, '손패가 3장 미만이면 왕국지원을 수락할 수 없습니다.');
      t.accepted = true; note(p, '왕국지원을 수락했습니다. 왕에게 줄 카드 3~5장을 고르세요.', 'submit');
    } else {
      note(p, '왕국지원을 거절했습니다.', 'submit');
      note(player(room, t.from), '왕국지원을 거절당해 차례가 끝났습니다.'); nextTurn(room);
    }
  } else {
    must(action.type === 'supportSubmit', '왕에게 줄 카드를 확정하세요.');
    const cards = selected(p, action.cards);
    must(cards.length >= 3 && cards.length <= 5, '왕국지원은 카드 3~5장을 제공해야 합니다.');
    const king = player(room, t.from);
    consume(p, cards); king.hand.push(...cards);
    note(p, `왕국지원으로 카드 ${cards.length}장을 제공했습니다.`, 'submit');
    note(king, `${p.name}님의 왕국지원 카드 ${cards.length}장을 받았습니다.`, 'gain');
    nextTurn(room);
  }
}
export function canAct(room, id) {
  const p = player(room, id), g = room.game;
  if (!p || p.surrendered||room.status !== 'playing') return false;
  if (executionBlocked(room, p) && !['evening', 'tax', 'merchantEvening', 'night', 'bishopNight'].includes(g.phase)) return false;
  const pending = g.pending, king = id === g.king, done = pending?.done?.includes(id);
  switch (g.phase) {
    case 'morning': case 'evening': return king;
    case 'executionVote': case 'expeditionVote': case 'redistribute': return !done;
    case 'market': return p.job !== 'merchant' && !done;
    case 'merchantEvening': return p.job === 'merchant';
    case 'mediationSupport': return !king && !done && (p.role !== 'rebel' || pending.revoltType === 'religion');
    case 'mediationKing': return king && !done;
    case 'expeditionSelect': return king;
    case 'expeditionJoin': return !done;
    case 'expeditionCards': return p.job !== 'merchant' && pending.participants.includes(id) && !done;
    case 'day':
      if (pending?.kind === 'trade') return pending.accepted ? [pending.from, pending.to].includes(id) && !Object.hasOwn(pending.submissions, id) : pending.to === id;
      if (pending?.kind === 'royalSupport') return pending.to === id;
      return g.order[g.turn] === id;
    case 'tax': return !done;
    case 'night': return p.role === 'rebel' && !done;
    case 'bishopNight': return p.job === 'bishop';
    default: return false;
  }
}
export function view(room, id) {
  const me = player(room, id);
  must(me, '참가자를 찾을 수 없습니다.');
  const g = room.game;
  const reveal = room.status === 'finished';
  const players = (g ? g.order.map(id => player(room, id)) : room.players).map(p => ({
    id: p.id, name: p.name, online: p.online, host: p.id === room.host, bot: !!p.bot,takeover:!!p.takeover,surrendered:!!p.surrendered, executed: !!g && executionBlocked(room, p),
    role: reveal || p.id === id || p.role === 'king' || (me.role === 'rebel' && p.role === 'rebel') ? p.role : null,
    job: reveal || p.id === id ? p.job || null : null
  }));
  let pending = null;
  if (g?.pending) {
    const raw = g.pending;
    const done = raw.done || [];
    pending = {
      kind: raw.kind || null,
      myDone: done.includes(id),
      supporters: raw.supporters || [],
      participants: raw.participants || []
    };
    if (['mediationSupport', 'mediationKing'].includes(g.phase)) pending.revoltType = raw.revoltType || 'rebel';
    if (g.phase === 'executionVote') { pending.myVote = raw.votes[id] || null; pending.voteCount = done.length; }
    if (g.phase === 'merchantEvening') pending = me.job === 'merchant' ? { kind: raw.kind || null, craftUsed: !!raw.craftUsed } : null;
    if (g.phase === 'market') pending.completeCount = done.length;
    if (pending) {
      pending.helperCount = (raw.supporters || []).filter(id=>id!==g.king).length;
      pending.contributorCount = (raw.contributors || []).length;
      pending.participantCount = (raw.participants || []).length;
      pending.isParticipant = (raw.participants || []).includes(id);
    }
    if(raw.difficulty==='high') pending.participants = id===g.king ? [...raw.participants] : pending.isParticipant ? [g.king,id] : [g.king];
    if (['expeditionVote', 'expeditionSelect', 'expeditionJoin', 'expeditionCards'].includes(g.phase)) {
      pending.difficulty = raw.difficulty || null;
      pending.required = raw.required || 0;
      if (g.phase === 'expeditionVote') pending.myVote = raw.votes[id] || null;
    }
    // 낮 행동 및 상대방 제출 여부를 제3자에게 유출하지 않습니다.
    if (g.phase === 'day') {
      pending = g.order[g.turn] === id ? { kind: raw.kind } : null;
      if (raw.kind === 'trade' && [raw.from, raw.to].includes(id)) {
        pending = { kind: 'trade', from: raw.from, to: raw.to, accepted: raw.accepted, myDone: Object.hasOwn(raw.submissions, id) };
      }
      if (raw.kind === 'royalSupport' && [raw.from, raw.to].includes(id)) pending = { kind: 'royalSupport', from: raw.from, to: raw.to, accepted: raw.accepted };
    }
  }
  return {
    code: room.code,mode:room.mode||'online',spectators:(room.spectators||[]).map(s=>({id:s.id,name:s.name,online:s.online})), status: room.status, host: room.host, config: room.config, neutralJobs: room.neutralJobs || [], citizenJobs: room.citizenJobs || [], players,
    me: { id: me.id, name: me.name, role: me.role, job: me.job || null,surrendered:!!me.surrendered,lastSurrenderDay:me.lastSurrenderDay||null, handLimit: handLimit(me.role), redistributionCount: initialHandSize(me.role), huntGoal: huntGoal(me.job), canAct: canAct(room, id), executed: !!g && executionBlocked(room, me), ...(me.job === 'bishop' ? { churchInfluence: me.churchInfluence || 0 } : {}), ...(me.job === 'merchant' ? { money: me.money || 0 } : {}), hand: me.hand, notes: me.notes, recipes: visibleRecipes(me.role, me.job) },
    game: g ? { day: g.day, maxDays: g.maxDays, phase: g.phase, king: g.king, round: g.round, canExecute: canExecute(room), current: g.phase === 'day' ? g.order[g.turn] : null,
      vote:g.vote?{id:g.vote.id,kind:g.vote.kind,side:g.vote.side||null,eligible:g.vote.eligible.includes(id),myVote:g.vote.ballots[id]??null,yes:Object.values(g.vote.ballots).filter(Boolean).length,no:Object.values(g.vote.ballots).filter(v=>!v).length,total:g.vote.eligible.length}:null,
      shop: merchant(room) ? (merchant(room).stock || []).map(item => ({ id: item.id, type: item.type, price: item.price, quantity: item.cards.length })) : null,
      revolt: ['morning', 'mediationSupport', 'mediationKing'].includes(g.phase) ? g.revolt : null,
      religiousRevolt: ['morning', 'mediationSupport', 'mediationKing'].includes(g.phase) && g.religiousActive ? g.religiousRevolt : null,
      religiousGoal: g.religiousGoal || religiousGoal(room.players.length), religiousSuccesses: g.religiousSuccesses || 0, lastReligiousRevolt: g.lastReligiousRevolt || null, lastExecution: g.lastExecution || null,
      ...(g.phase === 'bishopNight' && me.job === 'bishop' ? { religiousScheduled: !!g.religiousScheduled } : {}),
      revoltGoal: g.revoltGoal || revoltGoal(room.players.length), lastRevolt: g.lastRevolt || null, lastExpedition: g.lastExpedition || null, successes: g.successes, pending, logs: g.logs, winner: g.winner } : null
  };
}
export function spectatorView(room,s){
 const snapshot=view(room,room.players[0].id);
 snapshot.me={id:s.id,name:s.name,role:null,job:null,hand:[],notes:[],recipes:[],canAct:false,spectator:true};
 snapshot.players=snapshot.players.map(p=>{const raw=player(room,p.id);return {...p,role:raw.role,job:raw.job,hand:raw.hand};});
 if(snapshot.game){snapshot.game.pending=null;snapshot.game.vote=null;delete snapshot.game.religiousScheduled;}
 return snapshot;
}
