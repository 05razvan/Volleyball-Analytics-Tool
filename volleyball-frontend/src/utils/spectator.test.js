import { describeEvent, getLeaders, getMatchSituation, getMomentum, getServingRun } from './spectator';

const events = [
  { id: 4, event_type: 'ace', player_name: 'A' },
  { id: 3, event_type: 'kill', player_name: 'A' },
  { id: 2, event_type: 'dig', player_name: 'B' },
  { id: 1, event_type: 'opponent_point' },
];

test('builds chronological momentum and current serving run', () => {
  expect(getMomentum(events).map(point => point.side)).toEqual(['them', 'us', 'us']);
  expect(getServingRun(events, 'us')).toBe(2);
  expect(getServingRun(events, 'them')).toBe(0);
});

test('identifies set and match point', () => {
  const base = { status: 'live', current_set: 3, current_set_our: 24, current_set_opponent: 22 };
  expect(getMatchSituation({ ...base, sets: [] }, 'GUVC', 'Away')).toBe('Set point GUVC');
  expect(getMatchSituation({ ...base, sets: [{ us: 25, them: 20 }, { us: 25, them: 21 }] }, 'GUVC', 'Away'))
    .toBe('Match point GUVC');
});

test('finds statistical leaders and creates readable commentary', () => {
  expect(getLeaders(events)[0]).toMatchObject({ name: 'A', value: 1 });
  expect(describeEvent(events[0], 'GUVC', 'Away')).toBe('A serves an ace — point GUVC.');
});
