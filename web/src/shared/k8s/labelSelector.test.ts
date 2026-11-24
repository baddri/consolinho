import { labelSelectorString } from './labelSelector';

describe('labelSelectorString (OCP selectorToString)', () => {
  it('is empty without a selector or terms', () => {
    expect(labelSelectorString(undefined)).toBe('');
    expect(labelSelectorString({})).toBe('');
  });

  it('writes matchLabels as key=value in object order', () => {
    expect(labelSelectorString({ matchLabels: { app: 'web', tier: 'front' } })).toBe('app=web,tier=front');
  });

  it.each([
    [{ key: 'env', operator: 'In', values: ['prod', 'stage'] }, 'env in (prod,stage)'],
    [{ key: 'env', operator: 'NotIn', values: ['dev'] }, 'env notin (dev)'],
    [{ key: 'canary', operator: 'Exists' }, 'canary'],
    [{ key: 'legacy', operator: 'DoesNotExist' }, '!legacy'],
  ])('writes %o as %s', (requirement, expected) => {
    expect(labelSelectorString({ matchExpressions: [requirement] })).toBe(expected);
  });

  it('puts matchLabels before matchExpressions, ANDed with commas', () => {
    expect(
      labelSelectorString({
        matchLabels: { app: 'web' },
        matchExpressions: [
          { key: 'env', operator: 'In', values: ['prod', 'stage'] },
          { key: 'canary', operator: 'Exists' },
        ],
      }),
    ).toBe('app=web,env in (prod,stage),canary');
  });

  it('skips a requirement with an unknown operator', () => {
    expect(labelSelectorString({ matchExpressions: [{ key: 'x', operator: 'Gt', values: ['1'] }] })).toBe('');
  });
});
