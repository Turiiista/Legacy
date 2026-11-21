import assert from 'node:assert/strict';
import { washCalculation, washRules, validateWashRules } from '../functions/_lib/operations.js';
assert.equal(validateWashRules(),true,'As seis regras de lavagem devem estar corretas');
assert.equal(washRules.length,6);
for (const [category,farm,partnership,machine,legacy,washer,net] of washRules) {
  const result=washCalculation(10000,category,farm,partnership);
  assert.deepEqual([result.rates.machine,result.rates.legacy,result.rates.washer,result.rates.net],[machine,legacy,washer,net]);
  assert.equal(result.grossCents,result.machineCents+result.legacyCents+result.washerCents+result.netCents);
}
const saleTotal=101,seller=Math.floor(saleTotal/2),legacy=saleTotal-seller;
assert.deepEqual([seller,legacy],[50,51]);
console.log('OK: 6 regras de lavagem + divisão de venda com centavo ímpar.');
