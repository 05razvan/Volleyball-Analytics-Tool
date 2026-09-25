import {
  enterWaitingLibero,
  planInitialLiberoEntry,
  resolveLiberoAfterRotation,
} from './liberoRotation';

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

test('lets the next middle serve at P1 when the libero leaves the front row', () => {
  const firstMiddle = middle;
  const servingMiddle = {
    id: 8, name: 'Second Middle', position: 'Middle Blocker',
  };
  const rotatedPositions = [
    servingMiddle,
    otherPlayers[0],
    otherPlayers[1],
    libero,
    otherPlayers[2],
    otherPlayers[3],
  ];

  const resolved = resolveLiberoAfterRotation({
    positions: rotatedPositions,
    bench: [firstMiddle, otherPlayers[4]],
    swap: { middle: firstMiddle, libero, posIndex: 4 },
  });

  expect(resolved.positions[0]).toBe(servingMiddle);
  expect(resolved.positions[3]).toBe(firstMiddle);
  expect(resolved.bench).toContain(libero);
  expect(resolved.bench).not.toContain(servingMiddle);
  expect(resolved.swap).toMatchObject({
    middle: servingMiddle,
    libero,
    posIndex: 0,
    waitingToEnter: true,
  });

  const afterLosingServe = enterWaitingLibero(resolved);
  expect(afterLosingServe.positions[0]).toBe(libero);
  expect(afterLosingServe.bench).toContain(servingMiddle);
});
