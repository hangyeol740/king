import { readFile, writeFile } from 'node:fs/promises';
import { seededRandom } from '../lib/ai-policy.js';
import { compatiblePolicy } from './transfer.js';
import { evaluate } from './environment.js';
const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(`--${key}`) ? args[args.indexOf(`--${key}`) + 1] : fallback;
const policy = compatiblePolicy(JSON.parse(await readFile(arg('model', 'models/policy.json'), 'utf8')));
const games = Number(arg('games', 120)), counts = arg('players', '3,4,5').split(',').map(Number);
if (!Number.isInteger(games) || games < 1 || counts.some(n => !Number.isInteger(n) || n < 3 || n > 8)) throw new Error('평가 games는 양의 정수, players는 3~8이어야 합니다.');
const evaluation = evaluate(policy, { games, counts, random: seededRandom(Number(arg('seed', 123))), opponent: arg('opponent', 'baseline') });
console.log(JSON.stringify({ training: policy.metadata, evaluation }, null, 2));
if(arg('output',null)){
  await writeFile(arg('output'),JSON.stringify({model:arg('model','models/policy.json'),ruleset:policy.ruleset,trainingEpisodes:policy.metadata.episodes,trainingDecisions:policy.metadata.decisions,evaluatedAt:new Date().toISOString(),...evaluation,note:'실제 별도 평가 표본이며 사람 상대 실력을 의미하지 않습니다.'},null,2));
  console.log(`평가 기록 저장: ${arg('output')}`);
}
