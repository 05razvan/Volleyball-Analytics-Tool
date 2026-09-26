export const POINT_SIDE = {
  kill: 'us', ace: 'us', our_point: 'us', kill_block: 'us', setter_dump: 'us',
  opponent_point: 'them', serve_error: 'them', foot_fault: 'them',
  net_touch: 'them', spike_error: 'them',
};

export function getMomentum(events, limit = 10) {
  return events
    .filter(event => POINT_SIDE[event.event_type])
    .slice(0, limit)
    .reverse()
    .map(event => ({ side: POINT_SIDE[event.event_type], id: event.id }));
}

export function getServingRun(events, servingSide) {
  let run = 0;
  for (const event of events) {
    const side = POINT_SIDE[event.event_type];
    if (!side) continue;
    if (side !== servingSide) break;
    run += 1;
  }
  return run;
}

export function getMatchSituation(score, ourName, opponentName) {
  if (score.status === 'completed') return 'Full time';
  const us = score.current_set_our;
  const them = score.current_set_opponent;
  const target = score.set_target || (score.current_set === (score.best_of || 5) ? 15 : 25);
  const sets = score.sets || [];
  const setsWon = sets.filter(set => set.us > set.them).length;
  const setsLost = sets.filter(set => set.them > set.us).length;
  const usSetPoint = us >= target - 1 && us - them >= 1;
  const themSetPoint = them >= target - 1 && them - us >= 1;
  const setsNeeded = score.sets_needed || Math.floor((score.best_of || 5) / 2) + 1;
  if (usSetPoint) return setsWon === setsNeeded - 1 ? `Match point ${ourName}` : `Set point ${ourName}`;
  if (themSetPoint) return setsLost === setsNeeded - 1 ? `Match point ${opponentName}` : `Set point ${opponentName}`;
  if (score.current_set === (score.best_of || 5)) return 'Deciding set';
  if (us === them && us >= target - 1) return 'Deuce';
  return null;
}

export function getLeaders(events) {
  const categories = [
    { key: 'kills', label: 'Kills', types: ['kill', 'setter_dump'] },
    { key: 'aces', label: 'Aces', types: ['ace'] },
    { key: 'digs', label: 'Digs', types: ['dig'] },
    { key: 'blocks', label: 'Blocks', types: ['kill_block'] },
  ];
  return categories.map(category => {
    const totals = new Map();
    events.filter(event => category.types.includes(event.event_type) && event.player_name)
      .forEach(event => totals.set(event.player_name, (totals.get(event.player_name) || 0) + 1));
    const leader = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
    return { ...category, name: leader?.[0] || '—', value: leader?.[1] || 0 };
  });
}

export function describeEvent(event, ourName, opponentName) {
  const player = event.player_name || 'GUVC';
  const setter = event.assist_player_name ? `, set by ${event.assist_player_name}` : '';
  const descriptions = {
    kill: `${player} puts the ball away${setter} — point ${ourName}.`,
    ace: `${player} serves an ace — point ${ourName}.`,
    serve: `${player} serves.`,
    spike: `${player} attacks${setter}; play continues.`,
    dig: `${player} keeps the rally alive with a dig.`,
    block: `${player} gets a block touch; play continues.`,
    kill_block: `${player} scores with a block — point ${ourName}.`,
    assist: `${player} records an assist.`,
    serve_error: `${player} misses the serve — point ${opponentName}.`,
    our_point: `${opponentName} make an error — point ${ourName}.`,
    opponent_point: `${opponentName} win the point.`,
    foot_fault: `${player} foot fault — point ${opponentName}.`,
    net_touch: `${player} touches the net — point ${opponentName}.`,
    spike_error: `${player}'s attack ends in an error${setter} — point ${opponentName}.`,
    setter_dump: `${player} catches the defence with a setter dump — point ${ourName}.`,
    score_correction_us: `${ourName}'s score is corrected by one point.`,
    score_correction_them: `${opponentName}'s score is corrected by one point.`,
  };
  if (event.event_type === 'pass') {
    const passes = ['unplayable', 'out-of-system', 'good', 'perfect'];
    return `${player} makes a ${passes[event.pass_rating] || 'rated'} pass.`;
  }
  return descriptions[event.event_type] || `${player}: ${event.event_type.replaceAll('_', ' ')}.`;
}
