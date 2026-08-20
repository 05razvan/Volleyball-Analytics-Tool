import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMatches, createMatch, getTeams, startMatch,
         getMatchTopPerformers, getMatchSets } from '../api';
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
  const [matchSets, setMatchSets] = useState({});
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();
  const role = getRole();
  const canCreateMatch = role === 'coach' || role === 'captain' || role === 'admin';

  useEffect(() => {
    getMatches().then(res => {
      const ms = res.data;
      setMatches(ms);
      // fetch sets for completed matches automatically
      ms.filter(m => m.status === 'completed').forEach(m => {
        getMatchSets(m.id).then(r => {
          setMatchSets(prev => ({ ...prev, [m.id]: r.data }));
        }).catch(() => {});
      });
    });
    getTeams().then(res => setTeams(res.data));
  }, []);

  const availableAwayTeams = teams.filter(t =>
    !form.home_team_id ||
    t.division === teams.find(x => x.id === parseInt(form.home_team_id))?.division
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
      setShowForm(false);
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
        setMatchTop(prev => {
          const next = { ...prev };
          delete next[match.id];
          return next;
        });
      }
      return;
    }
    if (match.status === 'live') {
      if (canCreateMatch) navigate(`/match/${match.id}`);
      else window.open(`/spectator/${match.id}`, '_blank');
    }
  };

  const teamName = (id) => teams.find(t => t.id === id)?.name ?? 'Unknown';
  const ourTeam = (match) => teams.find(t => t.id === match.our_team_id);
  const oppTeam = (match) => {
    const oppId = match.home_team_id === match.our_team_id
      ? match.away_team_id : match.home_team_id;
    return teams.find(t => t.id === oppId);
  };

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
    const sets = matchSets[match.id] || [];
    const setsWon = sets.filter(s => s.us > s.them).length;
    const setsLost = sets.filter(s => s.them > s.us).length;
    const us = ourTeam(match);
    const opp = oppTeam(match);

    return (
      <div style={styles.matchCardWrapper}>
        <div style={{
          ...styles.matchCard,
          ...(match.status === 'completed' ? { cursor: 'pointer' } : {}),
        }}
          onClick={() => handleMatchClick(match)}>
          <div style={styles.matchMain}>
            {/* Score display for completed matches */}
            {match.status === 'completed' && sets.length > 0 ? (
              <div style={styles.scoreDisplay}>
                <div style={styles.scoreTeam}>
                  <span style={styles.scoreTeamName}>{us?.name ?? teamName(match.our_team_id)}</span>
                  <span style={styles.scoreNum}>{setsWon}</span>
                </div>
                <span style={styles.scoreDash}>–</span>
                <div style={styles.scoreTeamRight}>
                  <span style={styles.scoreNum}>{setsLost}</span>
                  <span style={styles.scoreTeamName}>{opp?.name ?? teamName(match.away_team_id)}</span>
                </div>
              </div>
            ) : (
              <div style={styles.matchTeams}>
                <strong style={styles.teamText}>{teamName(match.home_team_id)}</strong>
                <span style={styles.vs}>vs</span>
                <strong style={styles.teamText}>{teamName(match.away_team_id)}</strong>
              </div>
            )}

            {/* Set by set scores */}
            {match.status === 'completed' && sets.length > 0 && (
              <div style={styles.setsRow}>
                {sets.map(s => (
                  <span key={s.set} style={styles.setChip}>
                    {s.us}–{s.them}
                  </span>
                ))}
              </div>
            )}

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
              <span style={styles.doneBadge}>{top ? '▲' : '▼ stats'}</span>
            )}
            {match.status === 'scheduled' && canCreateMatch && (
              <button style={styles.startBtn}
                onClick={(e) => handleStartMatch(e, match.id)}>
                Start
              </button>
            )}
            <button style={styles.spectateBtn}
              onClick={(e) => {
                e.stopPropagation();
                window.open(`/spectator/${match.id}`, '_blank');
              }}>
              👁
            </button>
          </div>
        </div>

        {match.status === 'completed' && top && (
          <div style={styles.topPerformers}>
            {[
              { label: '⚡ Kills', data: top.most_kills, key: 'kills' },
              { label: '🛡 Blocks', data: top.most_blocks, key: 'blocks' },
              { label: '🎯 Aces', data: top.most_aces, key: 'aces' },
              { label: '🤿 Digs', data: top.most_digs, key: 'digs' },
            ].filter(t => t.data).map(t => (
              <div key={t.label} style={styles.topBadge}>
                <div style={styles.topBadgeLabel}>{t.label}</div>
                <div style={styles.topBadgeName}>{t.data.name}</div>
                <div style={styles.topBadgeVal}>{t.data[t.key]}</div>
              </div>
            ))}
            {Object.values(top).every(v => !v) && (
              <p style={{ color: '#555', fontSize: '13px' }}>No stats recorded.</p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={styles.pageHeader}>
        <h2 style={styles.heading}>Matches</h2>
        {canCreateMatch && (
          <button style={styles.addBtn} onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Schedule'}
          </button>
        )}
      </div>

      {canCreateMatch && showForm && (
        <div style={styles.card}>
          <div style={styles.formCol}>
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
            <button style={styles.button} onClick={handleSubmit}>Schedule match</button>
          </div>
          {error && <p style={styles.error}>{error}</p>}
        </div>
      )}

      {activeDivisions.length > 0 && (
        <div style={styles.filterRow}>
          <button style={{ ...styles.filterBtn, ...(divisionFilter === '' ? styles.filterActive : {}) }}
            onClick={() => setDivisionFilter('')}>All</button>
          {activeDivisions.map(d => (
            <button key={d}
              style={{ ...styles.filterBtn, ...(divisionFilter === d ? styles.filterActive : {}) }}
              onClick={() => setDivisionFilter(d)}>{d}</button>
          ))}
        </div>
      )}

      {live.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={styles.sectionHeading}>Live</h3>
          {live.map(m => <MatchCard key={m.id} match={m} />)}
        </div>
      )}

      {scheduled.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={styles.sectionHeading}>Upcoming</h3>
          {scheduled.map(m => <MatchCard key={m.id} match={m} />)}
        </div>
      )}

      {completed.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={styles.sectionHeading}>Completed</h3>
          {completed.map(m => <MatchCard key={m.id} match={m} />)}
        </div>
      )}

      {filtered.length === 0 && <p style={styles.empty}>No matches yet.</p>}
    </div>
  );
}

const styles = {
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  heading: { fontSize: '22px', color: '#f0f0f0' },
  addBtn: {
    padding: '8px 16px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontSize: '13px', fontWeight: '600',
  },
  card: {
    background: '#1e1e1e', padding: '16px', borderRadius: '10px',
    marginBottom: '20px', border: '1px solid #2a2a2a',
  },
  formCol: { display: 'flex', flexDirection: 'column', gap: '10px' },
  input: {
    padding: '10px 12px', borderRadius: '6px', border: '1px solid #333',
    fontSize: '14px', background: '#2a2a2a', color: '#f0f0f0', width: '100%',
    boxSizing: 'border-box',
  },
  button: {
    padding: '10px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontSize: '14px', fontWeight: '600',
  },
  error: { color: '#ff6b6b', marginTop: '8px', fontSize: '13px' },
  filterRow: { display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' },
  filterBtn: {
    padding: '5px 12px', borderRadius: '20px', border: '1px solid #333',
    background: '#1a1a1a', cursor: 'pointer', fontSize: '11px', color: '#ccc',
  },
  filterActive: { background: '#F5C800', color: '#111', border: '1px solid #F5C800', fontWeight: '600' },
  sectionHeading: {
    fontSize: '12px', fontWeight: '600', color: '#F5C800',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px',
  },
  matchCardWrapper: { marginBottom: '8px' },
  matchCard: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 14px', background: '#1a1a1a', borderRadius: '8px',
    border: '1px solid #2a2a2a',
  },
  matchMain: { flex: 1, minWidth: 0 },
  scoreDisplay: {
    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px',
  },
  scoreTeam: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1 },
  scoreTeamRight: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'flex-end' },
  scoreTeamName: { color: '#f0f0f0', fontSize: '13px', fontWeight: '500' },
  scoreNum: {
    fontSize: '22px', fontWeight: '800', color: '#F5C800',
    lineHeight: 1, minWidth: '24px', textAlign: 'center',
  },
  scoreDash: { color: '#555', fontSize: '18px' },
  setsRow: { display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' },
  setChip: {
    background: '#2a2a2a', color: '#888', fontSize: '11px',
    padding: '2px 6px', borderRadius: '6px',
  },
  matchTeams: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' },
  teamText: { color: '#f0f0f0', fontSize: '14px' },
  vs: { color: '#555', fontSize: '12px' },
  matchRight: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '8px' },
  meta: { color: '#888', fontSize: '11px' },
  liveBadge: { color: '#ff6b6b', fontWeight: '700', fontSize: '12px' },
  doneBadge: { color: '#888', fontSize: '12px', cursor: 'pointer' },
  startBtn: {
    padding: '5px 12px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontSize: '12px', fontWeight: '600',
  },
  spectateBtn: {
    padding: '5px 10px', background: 'transparent', color: '#888',
    border: '1px solid #333', borderRadius: '6px',
    cursor: 'pointer', fontSize: '14px',
  },
  topPerformers: {
    display: 'flex', gap: '8px', flexWrap: 'wrap',
    padding: '10px 14px', background: '#141414',
    borderRadius: '0 0 8px 8px',
    border: '1px solid #2a2a2a', borderTop: 'none',
  },
  topBadge: {
    flex: 1, minWidth: '80px', background: '#1a1a1a',
    border: '1px solid #2a2a2a', borderRadius: '8px', padding: '8px 10px',
  },
  topBadgeLabel: { fontSize: '10px', color: '#888', marginBottom: '3px' },
  topBadgeName: { fontSize: '13px', fontWeight: '600', color: '#f0f0f0', marginBottom: '2px' },
  topBadgeVal: { fontSize: '18px', fontWeight: '700', color: '#F5C800' },
  empty: { color: '#555', fontSize: '14px' },
};

export default Matches;