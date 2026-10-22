import test from 'node:test';import assert from 'node:assert/strict';
import {settleRewards} from '../ai/reward-ledger.js';
test('패배는 양의 항목만 제거하고 비용·최종패배는 유지',()=>{const rows=[{rewardItems:[{amount:.04},{amount:-.03}]}];settleRewards(rows,{won:false,draw:false});assert.equal(rows[0].reward,-1.03);});
test('무승부는 중간 손익 유지·최종0',()=>{const rows=[{rewardItems:[{amount:.04},{amount:-.03}]}];settleRewards(rows,{won:false,draw:true});assert.ok(Math.abs(rows[0].reward-.01)<1e-9);});
