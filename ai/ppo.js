import { distribution, forward } from '../lib/ai-policy.js';

function empty(net) { return Object.fromEntries(['w1', 'b1', 'w2', 'b2'].map(k => [k, new Float64Array(net[k].length)])); }
function backward(net, input, pass, derivatives, grad) {
  const hiddenDerivative = new Float64Array(net.hidden);
  for (let o = 0; o < net.output; o++) {
    const d = derivatives[o], offset = o * net.hidden;
    grad.b2[o] += d;
    for (let h = 0; h < net.hidden; h++) { grad.w2[offset + h] += d * pass.hidden[h]; hiddenDerivative[h] += d * net.w2[offset + h]; }
  }
  for (let h = 0; h < net.hidden; h++) {
    const d = hiddenDerivative[h] * (1 - pass.hidden[h] ** 2), offset = h * net.input;
    grad.b1[h] += d;
    for (let i = 0; i < net.input; i++) grad.w1[offset + i] += d * input[i];
  }
}
export class PPO {
  constructor(policy, { learningRate = .001, clip = .2, entropy = .015, gamma = .995, lambda = .95 } = {}) {
    this.policy = policy; this.learningRate = learningRate; this.clip = clip; this.entropy = entropy; this.gamma = gamma; this.lambda = lambda; this.step = 0;
    this.moments = { actor: { m: empty(policy.actor), v: empty(policy.actor) }, critic: { m: empty(policy.critic), v: empty(policy.critic) } };
  }
  restore(state) {
    if (!state) return;
    if (!Number.isInteger(state.step) || state.step < 0) throw new Error('학습 체크포인트의 업데이트 횟수가 잘못되었습니다.');
    this.step = state.step;
    for (const kind of ['actor', 'critic']) for (const moment of ['m', 'v']) for (const k of ['w1', 'b1', 'w2', 'b2']) {
      const values = state.moments?.[kind]?.[moment]?.[k];
      if (!Array.isArray(values) || values.length !== this.policy[kind][k].length || !values.every(Number.isFinite)) throw new Error('학습 체크포인트의 옵티마이저 형식이 잘못되었습니다.');
      this.moments[kind][moment][k] = Float64Array.from(values);
    }
  }
  checkpoint() {
    const moments = {};
    for (const kind of ['actor', 'critic']) {
      moments[kind] = {};
      for (const moment of ['m', 'v']) moments[kind][moment] = Object.fromEntries(Object.entries(this.moments[kind][moment]).map(([k, v]) => [k, Array.from(v)]));
    }
    return { step: this.step, moments };
  }
  prepare(trajectories) {
    const rows = [];
    for (const records of trajectories) {
      let advantage = 0;
      for (let i = records.length - 1; i >= 0; i--) {
        const r = records[i], nextValue = records[i + 1]?.value || 0;
        const delta = r.reward + this.gamma * nextValue - r.value;
        advantage = delta + this.gamma * this.lambda * advantage;
        rows.push({ ...r, advantage, target: advantage + r.value });
      }
    }
    const mean = rows.reduce((s, r) => s + r.advantage, 0) / rows.length;
    const std = Math.sqrt(rows.reduce((s, r) => s + (r.advantage - mean) ** 2, 0) / rows.length + 1e-8);
    rows.forEach(r => { r.advantage = (r.advantage - mean) / std; });
    return rows;
  }
  update(rows, { epochs = 3, batchSize = 128, random = Math.random } = {}) {
    if (!rows.length) return { rows: 0 };
    let loss = 0, entropySum = 0, updates = 0;
    for (let epoch = 0; epoch < epochs; epoch++) {
      const order = [...rows];
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      for (let start = 0; start < order.length; start += batchSize) {
        const batch = order.slice(start, start + batchSize), actorGrad = empty(this.policy.actor), criticGrad = empty(this.policy.critic);
        for (const r of batch) {
          const { pass, probabilities } = distribution(this.policy, r.obs, r.features);
          const probability = Math.max(1e-12, probabilities[r.chosen]);
          const ratio = Math.exp(Math.log(probability) - r.oldLogProbability);
          const clipped = (r.advantage >= 0 && ratio > 1 + this.clip) || (r.advantage < 0 && ratio < 1 - this.clip);
          const coefficient = clipped ? 0 : -r.advantage * ratio;
          const entropy = -probabilities.reduce((s, p) => s + p * Math.log(Math.max(p, 1e-12)), 0);
          const outputDerivative = new Float64Array(this.policy.actor.output);
          for (let a = 0; a < probabilities.length; a++) {
            const d = coefficient * (Number(a === r.chosen) - probabilities[a]) + this.entropy * probabilities[a] * (Math.log(Math.max(probabilities[a], 1e-12)) + entropy);
            for (let i = 0; i < outputDerivative.length; i++) outputDerivative[i] += d * r.features[a][i];
          }
          backward(this.policy.actor, r.obs, pass, outputDerivative, actorGrad);
          const criticPass = forward(this.policy.critic, r.obs), error = criticPass.output[0] - r.target;
          backward(this.policy.critic, r.obs, criticPass, [Math.max(-5, Math.min(5, error))], criticGrad);
          loss += error ** 2; entropySum += entropy;
        }
        this.step++; updates++;
        for (const [kind, gradient] of [['actor', actorGrad], ['critic', criticGrad]]) {
          let norm = 0;
          for (const values of Object.values(gradient)) for (const g of values) norm += (g / batch.length) ** 2;
          const scale = Math.min(1, .5 / (Math.sqrt(norm) + 1e-8));
          for (const k of Object.keys(gradient)) {
            const params = this.policy[kind][k], { m, v } = this.moments[kind];
            for (let i = 0; i < params.length; i++) {
              const g = gradient[k][i] / batch.length * scale;
              m[k][i] = .9 * m[k][i] + .1 * g; v[k][i] = .999 * v[k][i] + .001 * g * g;
              params[i] -= this.learningRate * (m[k][i] / (1 - .9 ** this.step)) / (Math.sqrt(v[k][i] / (1 - .999 ** this.step)) + 1e-8);
            }
          }
        }
      }
    }
    return { rows: rows.length, updates, valueLoss: loss / (rows.length * epochs), entropy: entropySum / (rows.length * epochs) };
  }
}
