import { useEffect, useState } from 'react';
import { getTeams, requestToJoin } from '../api';

function JoinTeam() {
  const [teams, setTeams] = useState([]);
  const [requested, setRequested] = useState(new Set());
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getTeams().then(res => setTeams(res.data));
  }, []);

  const handleRequest = async (teamId) => {
    try {
      await requestToJoin(teamId);
      setRequested(prev => new Set([...prev, teamId]));
      setMsg('Request sent! A coach will approve you shortly.');
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Something went wrong.');
    }
  };

  const filtered = filter
    ? teams.filter(t => t.division === filter)
    : teams;

  const divisions = [...new Set(teams.map(t => t.division))];

  return (
    <div>
      <h2 style={styles.heading}>Join a team</h2>
      <p style={styles.sub}>Request to join your team — a coach will approve you.</p>

      {msg && <div style={styles.msg}>{msg}</div>}

      <div style={styles.filterRow}>
        <button style={{ ...styles.filterBtn, ...(filter === '' ? styles.filterActive : {}) }}
          onClick={() => setFilter('')}>All</button>
        {divisions.map(d => (
          <button key={d}
            style={{ ...styles.filterBtn, ...(filter === d ? styles.filterActive : {}) }}
            onClick={() => setFilter(d)}>{d}</button>
        ))}
      </div>

      <div style={styles.list}>
        {filtered.map(team => (
          <div key={team.id} style={styles.teamCard}>
            <div>
              <strong>{team.name}</strong>
              <div style={styles.meta}>{team.division} · Coach: {team.coach_name}</div>
            </div>
            <button
              style={{ ...styles.btn, ...(requested.has(team.id) ? styles.btnDone : {}) }}
              onClick={() => handleRequest(team.id)}
              disabled={requested.has(team.id)}>
              {requested.has(team.id) ? 'Requested ✓' : 'Request to join'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  heading: { marginBottom: '8px', fontSize: '24px', color: '#f0f0f0' },
  sub: { color: '#888', marginBottom: '24px', fontSize: '14px' },
  msg: { background: '#1a3a1a', color: '#4caf50', padding: '12px 16px',
    borderRadius: '8px', marginBottom: '16px', fontSize: '14px',
    border: '1px solid #2a4a2a' },
  filterRow: { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' },
  filterBtn: { padding: '6px 14px', borderRadius: '20px', border: '1px solid #333',
    background: '#1a1a1a', cursor: 'pointer', fontSize: '12px', color: '#ccc' },
  filterActive: { background: '#F5C800', color: '#111', border: '1px solid #F5C800', fontWeight: '600' },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  teamCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 18px', background: '#1a1a1a', borderRadius: '8px',
    border: '1px solid #2a2a2a' },
  meta: { color: '#888', fontSize: '13px', marginTop: '3px' },
  btn: { padding: '8px 16px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  btnDone: { background: '#2a2a2a', color: '#555', cursor: 'default' },
};
export default JoinTeam;