import { act, view } from './game.js';
import { candidates, decide } from './ai-policy.js';

export function createBotRunner({ policy, changed, failed = console.error, delay = 750 }) {
  const timers = new Map();
  let closed = false;
  function schedule(room) {
    if (closed || !policy || timers.has(room.code) || room.status !== 'playing') return;
    if (!room.players.some(p => !p.bot && p.online)) return;
    const bot = room.players.find(p => p.bot && candidates(view(room, p.id)).length);
    if (!bot) return;
    const timer = setTimeout(async () => {
      timers.delete(room.code);
      if (closed || room.status !== 'playing' || !room.players.some(p => !p.bot && p.online)) return;
      try {
        // 예약 후 사람이 단계를 바꾸거나 재경기를 시작했을 수 있으므로 다시 찾습니다.
        const currentBot = room.players.find(p => p.bot && candidates(view(room, p.id)).length);
        if (!currentBot) return;
        const action = decide(policy, view(room, currentBot.id));
        if (!action) { schedule(room); return; }
        act(room, currentBot.id, action);
        await changed(room);
        schedule(room);
      } catch (error) { failed(error); }
    }, delay);
    timer.unref?.(); timers.set(room.code, timer);
  }
  return { schedule, close() { closed = true; for (const timer of timers.values()) clearTimeout(timer); timers.clear(); } };
}
