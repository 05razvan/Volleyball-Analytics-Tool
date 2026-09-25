import { enterWaitingLibero, planInitialLiberoEntry } from './liberoRotation';

const middle = { id: 1, name: 'Middle', position: 'Middle Blocker' };
const libero = { id: 7, name: 'Libero', position: 'Libero' };
const otherPlayers = [2, 3, 4, 5, 6].map(id => ({ id, name: `Player ${id}` }));

test('keeps a P1 middle on court while our team is serving, then inserts libero on side-out', () => {
  const positions = [middle, ...otherPlayers];
  const bench = [libero];

  const planned = planInitialLiberoEntry({
    positions, bench, middle, libero, positionIndex: 0, weAreServing: true,
  });

  expect(planned.changed).toBe(false);
  expect(planned.positions[0]).toBe(middle);
  expect(planned.bench).toContain(libero);
  expect(planned.swap.waitingToEnter).toBe(true);

  const afterSideOut = enterWaitingLibero({
    positions: planned.positions, bench: planned.bench, swap: planned.swap,
  });

  expect(afterSideOut.changed).toBe(true);
  expect(afterSideOut.positions[0]).toBe(libero);
  expect(afterSideOut.bench).toContain(middle);
  expect(afterSideOut.swap.waitingToEnter).toBe(false);
});

test('inserts the libero immediately when the team is receiving', () => {
  const positions = [middle, ...otherPlayers];
  const planned = planInitialLiberoEntry({
    positions, bench: [libero], middle, libero,
    positionIndex: 0, weAreServing: false,
  });

  expect(planned.changed).toBe(true);
  expect(planned.positions[0]).toBe(libero);
  expect(planned.bench).toContain(middle);
});
