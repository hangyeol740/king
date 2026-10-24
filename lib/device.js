import { randomUUID } from 'node:crypto';
import { view, canAct, RuleError } from './game.js';

export function makeDevice(room, p) {
  room.devices ||= [];
  if (room.devices.some(d => d.players.includes(p.id))) throw new RuleError('이 플레이어는 공유 기기에 속해 있습니다. 공유 기기 복귀로 접속하세요.');
  const device = { id: randomUUID(), token: randomUUID(), players: [p.id] };
  room.devices.push(device);
  return device;
}
export function deviceView(room, device, activeId) {
  const ids = device.players.filter(id => room.players.some(p => p.id === id));
  const revealPending=room.status==='playing'?ids.filter(id=>!room.game.deviceRevealed?.includes(id)):[];
  const checkOnly = room.status === 'playing' && (['night', 'bishopNight', 'mediationSupport', 'expeditionCards', 'market', 'merchantEvening'].includes(room.game.phase) || room.game.phase === 'day' && ['trade', 'royalSupport'].includes(room.game.pending?.kind));
  const active = ids.includes(activeId) && (room.status !== 'playing' || device.revealing===activeId || revealPending.includes(activeId) || checkOnly || canAct(room, activeId)) ? activeId : null;
  const snapshot = view(room, active || ids[0]);
  if (!active && room.status !== 'lobby') {
    snapshot.me = { id: null, name: '', role: null, job: null, hand: [], notes: [], recipes: [], canAct: false };
    if (room.status !== 'finished') snapshot.players = snapshot.players.map(p => ({ ...p, role: p.role === 'king' ? 'king' : null, job: null }));
    snapshot.game.pending = null;
    delete snapshot.game.religiousScheduled;
  }
  // 공개 대기 화면에서 반란군·주교·비공개 원정 지명자나 거래 상대를 추론하지 못하게 합니다.
  snapshot.device = { active, checkOnly, revealing:device.revealing===active,revealPending,players: ids.map((id,index) => {
    const p = room.players.find(p => p.id === id);
    return { id, name: p.name,number:index+1,ready: revealPending.length?revealPending[0]===id:checkOnly || canAct(room, id) };
  }) };
  return snapshot;
}
