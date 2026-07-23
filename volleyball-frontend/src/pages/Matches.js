import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMatches, createMatch, getTeams, startMatch } from '../api';

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
  const navigate = useNavigate();

  useEffect(() => {
    getMatches().then(res => setMatches(res.data));
    getTeams().then(res => setTeams(res.data));
  }, []);

  const availableAwayTeams = teams.filter(t =>
    !form.home_team_id || t.division === teams.find(x => x.id === parseInt(form.home_team_id))?.division
  );

  const handleSubmit = async () => {
    setError('');
    if (!form.home_team_id || !form.away_team_id || !form.our_team_id || !form.date) {
      setError('All fields except location are required.');
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
      setForm({ home_team_id: '', away_team_id: '', our_team_id: '', date: '', location: '' });
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong.');
    }
  };

  const handleStartMatch = async (e, matchId) => {
    e.stopPropagation();
    await startMatch(matchId);
    navigate(`/match/${matchId}`);
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

  const MatchCard = ({ match }) => (
    <div style={styles.matchCard} onClick={() => match.status !== 'scheduled' && navigate(`/match/${match.id}`)}>
      <div style={styles.matchMain}>
        <div>
          <strong>{teamName(match.home_team_id)}</strong>
          <span style={styles.vs}> vs </span>
          <strong>{teamName(match.away_team_id)}</strong>
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
        <button
            style={styles.spectateBtn}
            onClick={(e) => { e.stopPropagation(); window.open(`/spectator/${match.id}`, '_blank'); }}>
            👁👁 Watch
        </button>
        {match.status === 'live' && <span style={styles.liveBadge}>● LIVE</span>}
        {match.status === 'completed' && <span style={styles.doneBadge}>Completed</span>}
        {match.status === 'scheduled' && (
          <button style={styles.startBtn} onClick={(e) => handleStartMatch(e, match.id)}>
            Start Match
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <h2 style={styles.heading}>Matches</h2>

      <div style={styles.card}>
        <h3 style={styles.subheading}>Schedule a match</h3>
        <div style={styles.formRow}>
          <select style={styles.input} value={form.home_team_id}
            onChange={e => setForm({ ...form, home_team_id: e.target.value, away_team_id: '' })}>
            <option value="">Home team</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select style={styles.input} value={form.away_team_id}
            onChange={e => setForm({ ...form, away_team_id: e.target.value })}>
            <option value="">Away team</option>
            {availableAwayTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select style={styles.input} value={form.our_team_id}
            onChange={e => setForm({ ...form, our_team_id: e.target.value })}>
            <option value="">Which team is ours?</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input style={styles.input} type="datetime-local" value={form.date}
            onChange={e => setForm({ ...form, date: e.target.value })} />
          <input style={styles.input} placeholder="Location (optional)" value={form.location}
            onChange={e => setForm({ ...form, location: e.target.value })} />
          <button style={styles.button} onClick={handleSubmit}>Schedule</button>
        </div>
        {error && <p style={styles.error}>{error}</p>}
      </div>

      <div style={styles.filterRow}>
        <button style={{ ...styles.filterBtn, ...(divisionFilter === '' ? styles.filterActive : {}) }}
          onClick={() => setDivisionFilter('')}>All</button>
        {DIVISIONS.map(d => (
          <button key={d} style={{ ...styles.filterBtn, ...(divisionFilter === d ? styles.filterActive : {}) }}
            onClick={() => setDivisionFilter(d)}>{d}</button>
        ))}
      </div>

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
          {completed.map(m => <MatchCard key={m.id} match={m} />)}
        </div>
      )}

      {filtered.length === 0 && <p style={styles.empty}>No matches yet.</p>}
    </div>
  );
}

const styles = {
  heading: { marginBottom: '24px', fontSize: '24px', color: '#f0f0f0' },
  subheading: { marginBottom: '12px', fontSize: '16px', fontWeight: '500', color: '#ccc' },
  card: { background: '#1e1e1e', padding: '20px', borderRadius: '10px',
    marginBottom: '24px', border: '1px solid #2a2a2a' },
  formRow: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  input: { padding: '8px 12px', borderRadius: '6px', border: '1px solid #333',
    fontSize: '14px', flex: '1', minWidth: '150px', background: '#2a2a2a', color: '#f0f0f0' },
  button: { padding: '8px 20px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  error: { color: '#ff6b6b', marginTop: '8px', fontSize: '14px' },
  filterRow: { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' },
  filterBtn: { padding: '6px 14px', borderRadius: '20px', border: '1px solid #333',
    background: '#1a1a1a', cursor: 'pointer', fontSize: '12px', color: '#ccc' },
  filterActive: { background: '#F5C800', color: '#111', border: '1px solid #F5C800', fontWeight: '600' },
  sectionHeading: { fontSize: '13px', fontWeight: '600', color: '#F5C800',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' },
  matchCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 18px', background: '#1a1a1a', borderRadius: '8px',
    border: '1px solid #2a2a2a', marginBottom: '8px', cursor: 'pointer' },
  matchMain: { flex: 1 },
  matchRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  vs: { color: '#555' },
  meta: { color: '#888', fontSize: '13px', marginTop: '4px' },
  liveBadge: { color: '#ff6b6b', fontWeight: '700', fontSize: '13px' },
  doneBadge: { color: '#555', fontSize: '13px' },
  startBtn: { padding: '6px 14px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  empty: { color: '#555', fontSize: '14px' },
  spectateBtn: {
  padding: '5px 12px', background: 'transparent', color: '#888',
  border: '1px solid #333', borderRadius: '6px',
  cursor: 'pointer', fontSize: '12px', },
};

export default Matches;