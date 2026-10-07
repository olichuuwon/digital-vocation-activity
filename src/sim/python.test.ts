import { describe, expect, it } from 'vitest';
import { toPython } from './python';

describe('toPython', () => {
  it('maps plain blocks', () => {
    expect(toPython([{ op: 'forward' }, { op: 'left' }, { op: 'right' }, { op: 'drop' }, { op: 'askAi' }])).toEqual([
      'move_forward()',
      'turn_left()',
      'turn_right()',
      'drop_supplies()',
      'drop(ai.what_does_this_house_need())',
    ]);
  });

  it('empty program is pass', () => {
    expect(toPython([])).toEqual(['pass']);
  });

  it('repeat and if/else with 4-space indents, nested', () => {
    expect(
      toPython([
        { op: 'repeat', n: 3, body: [{ op: 'ifFlooded', then: [{ op: 'right' }], else: [{ op: 'forward' }] }] },
        { op: 'drop' },
      ]),
    ).toEqual([
      'for _ in range(3):',
      '    if road_ahead_is_flooded():',
      '        turn_right()',
      '    else:',
      '        move_forward()',
      'drop_supplies()',
    ]);
  });

  it('omits an empty else, and an empty then/body is pass', () => {
    expect(toPython([{ op: 'ifFlooded', then: [], else: [] }])).toEqual(['if road_ahead_is_flooded():', '    pass']);
    expect(toPython([{ op: 'ifFlooded', then: [], else: [{ op: 'left' }] }])).toEqual([
      'if road_ahead_is_flooded():',
      '    pass',
      'else:',
      '    turn_left()',
    ]);
    expect(toPython([{ op: 'repeat', n: 2, body: [] }], { indent: 2 })).toEqual(['for _ in range(2):', '  pass']);
  });
});
