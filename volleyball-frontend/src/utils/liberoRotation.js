export function planInitialLiberoEntry({
  positions, bench, middle, libero, positionIndex, weAreServing,
}) {
  const waitForServingRun = weAreServing && positionIndex === 0;
  const swap = {
    posIndex: positionIndex,
    middle,
    libero,
    waitingToEnter: waitForServingRun,
  };

  if (waitForServingRun) {
    return { positions, bench, swap, changed: false };
  }

  const newPositions = [...positions];
  newPositions[positionIndex] = libero;
  const newBench = [
    ...bench.filter(player => player.id !== libero.id),
    middle,
  ].sort((a, b) => a.name.localeCompare(b.name));
  return { positions: newPositions, bench: newBench, swap, changed: true };
}

export function enterWaitingLibero({ positions, bench, swap }) {
  if (!swap?.waitingToEnter) {
    return { positions, bench, swap, changed: false };
  }
  const middleIndex = positions.findIndex(player =>
    player?.id === swap.middle.id);
  if (![0, 4, 5].includes(middleIndex)) {
    return { positions, bench, swap: null, changed: false };
  }

  const newPositions = [...positions];
  newPositions[middleIndex] = swap.libero;
  const newBench = [
    ...bench.filter(player => player.id !== swap.libero.id),
    swap.middle,
  ].sort((a, b) => a.name.localeCompare(b.name));
  return {
    positions: newPositions,
    bench: newBench,
    swap: {
      posIndex: middleIndex,
      middle: swap.middle,
      libero: swap.libero,
      waitingToEnter: false,
    },
    changed: true,
  };
}

export function resolveLiberoAfterRotation({ positions, bench, swap }) {
  if (!swap || swap.waitingToEnter) {
    return { positions, bench, swap };
  }

  const liberoIndex = positions.findIndex(player =>
    player?.id === swap.libero.id);
  if (![1, 2, 3].includes(liberoIndex)) {
    return { positions, bench, swap };
  }

  const newPositions = [...positions];
  newPositions[liberoIndex] = swap.middle;
  const newBench = [
    ...bench.filter(player => player.id !== swap.middle.id),
    swap.libero,
  ].sort((a, b) => a.name.localeCompare(b.name));

  // The other middle has just rotated from P2 to P1 and must be allowed to
  // serve. Remember the libero pairing, but do not put the libero on court
  // until that serving run ends.
  const servingMiddle = newPositions[0]?.position === 'Middle Blocker'
    ? newPositions[0] : null;
  return {
    positions: newPositions,
    bench: newBench,
    swap: servingMiddle ? {
      posIndex: 0,
      middle: servingMiddle,
      libero: swap.libero,
      waitingToEnter: true,
    } : null,
  };
}
