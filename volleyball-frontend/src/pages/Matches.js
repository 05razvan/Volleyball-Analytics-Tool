import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMatches, createMatch, getTeams, startMatch, getMatchTopPerformers } from '../api';
import { getRole } from '../auth';

const DIVISIONS = [
  "Men's Premier", "Men's Div 1", "Men's Div 2", "Men's Div 3",
  "Women's Premier", "Women's Div 1", "Women's Div 2", "Women's Div 3"
];

function Matches() {
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState({
    home_team_id: '', away_team_id: '', our_team_id: '', date: '', location: ''
  });
  const [error, setError] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [matchTop, setMatchTop] = useState({});
  const navigate = useNavigate();
  const role = getRole();
  const canCreateMatch = role === 'coach' || role === 'captain' || role === 'admin';

  useEffect(() => {
    getMatches().then(res => setMatches(res.data));
    getTeams().then(res => setTeams(res.data));
  }, []);

  const availableAwayTeams = teams.filter(t =>
    !form.home_team_id ||
    t.division === teams.find(x => x.id === parseInt(form.home_team_id))?.division
  );

  const handleSubmit = async () => {
    setError('');
    if (!form.home_team_id || !form.away_team_id || !form.our_team_id || !form.date) {
      setError('Home team, away team, your team, and date are required.');
      return;
    }
    if (form.home_team_id === form.away_team_id) {
      setError('Home and away teams must be different.');
      return;
    }
    try {
      const res = await createMatch({
        ...form,
        home_team_id: parseInt(form.home_team_id),
        away_team_id: parseInt(form.away_team_id),
        our_team_id: parseInt(form.our_team_id),
      });
      setMatches([...matches, res.data]);
      setForm({
        home_team_id: '', away_team_id: '',
        our_team_id: '', date: '', location: ''
      });
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong.');
    }
  };

  const handleStartMatch = async (e, matchId) => {
    e.stopPropagation();
    await startMatch(matchId);
    navigate(`/match/${matchId}`);
  };

  const handleMatchClick = async (match) => {
    if (match.status === 'completed') {
      if (!matchTop[match.id]) {
        try {
          const res = await getMatchTopPerformers(match.id);
          setMatchTop(prev => ({ ...prev, [match.id]: res.data }));
        } catch {}
      } else {
        // toggle off if already expanded
        setMatchTop(prev => {
          const next = { ...prev };
          delete next[match.id];
          return next;
        });
      }
      return;
    }
    if (match.status === 'live') {
      if (canCreateMatch) {
        navigate(`/match/${match.id}`);
      } else {
        window.open(`/spectator/${match.id}`, '_blank');
      }
    }
  };

  const teamName = (id) => teams.find(t => t.id === id)?.name ?? 'Unknown';

  const filtered = divisionFilter
    ? matches.filter(m => {
        const home = teams.find(t => t.id === m.home_team_id);
        return home?.division === divisionFilter;
      })
    : matches;

  const scheduled = filtered.filter(m => m.status === 'scheduled');
  const live = filtered.filter(m => m.status === 'live');
  const completed = filtered.filter(m => m.status === 'completed');

  const activeDivisions = DIVISIONS.filter(div =>
    matches.some(m => {
      const home = teams.find(t => t.id === m.home_team_id);
      return home?.division === div;
    })
  );

  const MatchCard = ({ match }) => {
    const top = matchTop[match.id];

    return (
      <div style={styles.matchCardWrapper}>
        <div
          style={{
            ...styles.matchCard,
            ...(match.status === 'completed' ? styles.matchCardClickable : {}),
          }}
          onClick={() => handleMatchClick(match)}>
          <div style={styles.matchMain}>
            <div>
              <strong style={{ color: '#f0f0f0' }}>
                {teamName(match.home_team_id)}
              </strong>
              <span style={styles.vs}> vs </span>
              <strong style={{ color: '#f0f0f0' }}>
                {teamName(match.away_team_id)}
              </strong>
            </div>
            <div style={styles.meta}>
              {new Date(match.date).toLocaleDateString('en-GB', {
                weekday: 'short', day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit'
              })}
              {match.location && ` · ${match.location}`}
            </div>
          </div>
          <div style={styles.matchRight}>
            {match.status === 'live' && (
              <span style={styles.liveBadge}>● LIVE</span>
            )}
            {match.status === 'completed' && (
              <span style={styles.doneBadge}>
                {top ? 'Hide stats ▲' : 'View stats ▼'}
              </span>
            )}
            {match.status === 'scheduled' && canCreateMatch && (
              <button
                style={styles.startBtn}
                onClick={(e) => handleStartMatch(e, match.id)}>
                Start Match
              </button>
            )}
            <button
              style={styles.spectateBtn}
              onClick={(e) => {
                e.stopPropagation();
                window.open(`/spectator/${match.id}`, '_blank');
              }}>
              👁👁 Watch
            </button>
          </div>
        </div>

        {match.status === 'completed' && top && (
          <div style={styles.topPerformers}>
            {[
              { label: '⚡ Most kills', data: top.most_kills, key: 'kills' },
              { label: '🛡 Most blocks', data: top.most_blocks, key: 'blocks' },
              { label: '🎯 Most aces', data: top.most_aces, key: 'aces' },
              { label: '🤿 Most digs', data: top.most_digs, key: 'digs' },
            ].filter(t => t.data).map(t => (
              <div key={t.label} style={styles.topBadge}>
                <div style={styles.topBadgeLabel}>{t.label}</div>
                <div style={styles.topBadgeName}>{t.data.name}</div>
                <div style={styles.topBadgeVal}>{t.data[t.key]}</div>
              </div>
            ))}
            {Object.values(top).every(v => !v) && (
              <p style={{ color: '#555', fontSize: '13px' }}>
                No stats recorded for this match.
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h2 style={styles.heading}>Matches</h2>

      {canCreateMatch && (
        <div style={styles.card}>
          <h3 style={styles.subheading}>Schedule a match</h3>
          <div style={styles.formRow}>
            <select style={styles.input} value={form.home_team_id}
              onChange={e => setForm({
                ...form, home_team_id: e.target.value, away_team_id: ''
              })}>
              <option value="">Home team</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select style={styles.input} value={form.away_team_id}
              onChange={e => setForm({ ...form, away_team_id: e.target.value })}>
              <option value="">Away team</option>
              {availableAwayTeams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select style={styles.input} value={form.our_team_id}
              onChange={e => setForm({ ...form, our_team_id: e.target.value })}>
              <option value="">Which team is ours?</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <input
              style={styles.input}
              type="datetime-local"
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
            />
            <input
              style={styles.input}
              placeholder="Location (optional)"
              value={form.location}
              onChange={e => setForm({ ...form, location: e.target.value })}
            />
            <button style={styles.button} onClick={handleSubmit}>
              Schedule
            </button>
          </div>
          {error && <p style={styles.error}>{error}</p>}
        </div>
      )}

      {activeDivisions.length > 0 && (
        <div style={styles.filterRow}>
          <button
            style={{
              ...styles.filterBtn,
              ...(divisionFilter === '' ? styles.filterActive : {})
            }}
            onClick={() => setDivisionFilter('')}>
            All
          </button>
          {activeDivisions.map(d => (
            <button key={d}
              style={{
                ...styles.filterBtn,
                ...(divisionFilter === d ? styles.filterActive : {})
              }}
              onClick={() => setDivisionFilter(d)}>
              {d}
            </button>
          ))}
        </div>
      )}

      {live.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={styles.sectionHeading}>Live</h3>
          {live.map(m => <MatchCard key={m.id} match={m} />)}
        </div>
      )}

      {scheduled.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={styles.sectionHeading}>Upcoming</h3>
          {scheduled.map(m => <MatchCard key={m.id} match={m} />)}
        </div>
      )}

      {completed.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={styles.sectionHeading}>Completed</h3>
          <p style={styles.hint}>Tap a match to see top performers</p>
          {completed.map(m => <MatchCard key={m.id} match={m} />)}
        </div>
      )}

      {filtered.length === 0 && (
        <p style={styles.empty}>No matches yet.</p>
      )}
    </div>
  );
}

const styles = {
  heading: { marginBottom: '24px', fontSize: '24px', color: '#f0f0f0' },
  subheading: {
    marginBottom: '12px', fontSize: '16px',
    fontWeight: '500', color: '#ccc',
  },
  card: {
    background: '#1e1e1e', padding: '20px', borderRadius: '10px',
    marginBottom: '24px', border: '1px solid #2a2a2a',
  },
  formRow: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  input: {
    padding: '8px 12px', borderRadius: '6px', border: '1px solid #333',
    fontSize: '14px', flex: '1', minWidth: '150px',
    background: '#2a2a2a', color: '#f0f0f0',
  },
  button: {
    padding: '8px 20px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontSize: '14px', fontWeight: '600',
  },
  error: { color: '#ff6b6b', marginTop: '8px', fontSize: '14px' },
  filterRow: {
    display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap',
  },
  filterBtn: {
    padding: '6px 14px', borderRadius: '20px', border: '1px solid #333',
    background: '#1a1a1a', cursor: 'pointer', fontSize: '12px', color: '#ccc',
  },
  filterActive: {
    background: '#F5C800', color: '#111',
    border: '1px solid #F5C800', fontWeight: '600',
  },
  sectionHeading: {
    fontSize: '13px', fontWeight: '600', color: '#F5C800',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px',
  },
  hint: { color: '#555', fontSize: '12px', marginBottom: '10px' },
  matchCardWrapper: { marginBottom: '8px' },
  matchCard: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 18px', background: '#1a1a1a', borderRadius: '8px',
    border: '1px solid #2a2a2a',
  },
  matchCardClickable: { cursor: 'pointer' },
  matchMain: { flex: 1 },
  matchRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  vs: { color: '#555' },
  meta: { color: '#888', fontSize: '13px', marginTop: '4px' },
  liveBadge: { color: '#ff6b6b', fontWeight: '700', fontSize: '13px' },
  doneBadge: { color: '#888', fontSize: '12px', cursor: 'pointer' },
  startBtn: {
    padding: '6px 14px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontSize: '13px', fontWeight: '600',
  },
  spectateBtn: {
    padding: '5px 12px', background: 'transparent', color: '#888',
    border: '1px solid #333', borderRadius: '6px',
    cursor: 'pointer', fontSize: '12px',
  },
  topPerformers: {
    display: 'flex', gap: '10px', flexWrap: 'wrap',
    padding: '12px 16px', background: '#141414',
    borderRadius: '0 0 8px 8px',
    border: '1px solid #2a2a2a', borderTop: 'none',
  },
  topBadge: {
    flex: 1, minWidth: '100px', background: '#1a1a1a',
    border: '1px solid #2a2a2a', borderRadius: '8px', padding: '10px 12px',
  },
  topBadgeLabel: { fontSize: '11px', color: '#888', marginBottom: '4px' },
  topBadgeName: {
    fontSize: '14px', fontWeight: '600',
    color: '#f0f0f0', marginBottom: '2px',
  },
  topBadgeVal: { fontSize: '20px', fontWeight: '700', color: '#F5C800' },
  empty: { color: '#555', fontSize: '14px' },
};

export default Matches;