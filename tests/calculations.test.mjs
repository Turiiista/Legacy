import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWash, calculateSale } from '../functions/_lib/operations.js';

const cases = [
  { name: 'membro com farm pago', category: 'member', farm: true, partnership: false, rates: [10, 0, 0, 90] },
  { name: 'membro sem farm pago', category: 'member', farm: false, partnership: false, rates: [10, 10, 0, 80] },
  { name: 'pessoa de fora com parceria e farm pago', category: 'outsider', farm: true, partnership: true, rates: [10, 5, 10, 75] },
  { name: 'pessoa de fora com parceria e sem farm', category: 'outsider', farm: false, partnership: true, rates: [10, 10, 5, 75] },
  { name: 'pessoa de fora sem parceria e farm pago', category: 'outsider', farm: true, partnership: false, rates: [10, 10, 10, 70] },
  { name: 'pessoa de fora sem parceria e sem farm', category: 'outsider', farm: false, partnership: false, rates: [10, 15, 5, 70] }
];
for (const item of cases) {
  test(`lavagem: ${item.name}`, () => {
    const result = calculateWash(100000, item.category, item.farm, item.partnership);
    assert.deepEqual([result.rates.machine, result.rates.legacy, result.rates.washer, result.rates.net], item.rates);
    assert.equal(result.machineCents + result.legacyCents + result.washerCents + result.netCents, result.grossCents);
    const oneCent = calculateWash(1, item.category, item.farm, item.partnership);
    assert.equal(oneCent.machineCents + oneCent.legacyCents + oneCent.washerCents + oneCent.netCents, 1);
  });
}

test('venda: divisão 50/50 e centavo ímpar vai para LEGACY', () => {
  assert.deepEqual(calculateSale(101), { grossCents: 101, sellerCents: 50, legacyCents: 51 });
  assert.deepEqual(calculateSale(100), { grossCents: 100, sellerCents: 50, legacyCents: 50 });
});

test('rejeita valores inválidos', () => {
  assert.throws(() => calculateWash(0, 'member', true, false));
  assert.throws(() => calculateWash(-1, 'member', true, false));
  assert.throws(() => calculateSale(0));
});
