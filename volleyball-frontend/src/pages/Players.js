import { useEffect, useState } from 'react';
import { getPlayers, createPlayer, getTeams } from '../api';

const POSITIONS = ["Setter", "Outside Hitter", "Opposite", "Middle Blocker", "Libero"];

function Players() {
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState({
    name: '', jersey_number: '', position: '', team_id: '', is_recreational: false
  });
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    getPlayers().then(res => setPlayers(res.data));
    getTeams().then(res => setTeams(res.data));
  }, []);

  const handleSubmit = async () => {
    setError('');
    if (!form.name) { setError('Name is required.'); return; }
    if (!form.is_recreational && !form.team_id) {
      setError('Competitive players must be assigned to a team.'); return;
    }
    try {
      const res = await createPlayer({
        name: form.name,
        jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
        position: form.position || null,
        team_id: form.team_id ? parseInt(form.team_id) : null,
        is_recreational: form.is_recreational,
      });
      setPlayers([...players, res.data]);
      setForm({ name: '', jersey_number: '', position: '', team_id: '', is_recreational: false });
    } catch (err) {
      setError('Something went wrong.');
    }
  };

  const teamName = (id) => teams.find(t => t.id === id)?.name ?? 'No team';

  const filtered = filter === 'all' ? players
    : filter === 'competitive' ? players.filter(p => !p.is_recreational)
    : players.filter(p => p.is_recreational);

  return (
    <div>
      <h2 style={styles.heading}>Players</h2>
      <div style={styles.card}>
        <h3 style={styles.subheading}>Add a player</h3>
        <div style={styles.formRow}>
          <input style={styles.input} placeholder="Full name"
            value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />

          <label style={styles.checkbox}>
            <input type="checkbox" checked={form.is_recreational}
              onChange={e => setForm({ ...form, is_recreational: e.target.checked,
                team_id: '', position: '', jersey_number: '' })} />
            Recreational
          </label>
        </div>

        {!form.is_recreational && (
          <div style={{ ...styles.formRow, marginTop: '10px' }}>
            <select style={styles.input} value={form.position}
              onChange={e => setForm({ ...form, position: e.target.value })}>
              <option value="">Select position</option>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input style={styles.input} placeholder="Jersey number" type="number"
              value={form.jersey_number}
              onChange={e => setForm({ ...form, jersey_number: e.target.value })} />
            <select style={styles.input} value={form.team_id}
              onChange={e => setForm({ ...form, team_id: e.target.value })}>
              <option value="">Select team</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ marginTop: '12px' }}>
          <button style={styles.button} onClick={handleSubmit}>Add player</button>
        </div>
        {error && <p style={styles.error}>{error}</p>}
      </div>

      <div style={styles.filterRow}>
        {['all', 'competitive', 'recreational'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ ...styles.filterBtn, ...(filter === f ? styles.filterActive : {}) }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div style={styles.list}>
        {filtered.map(player => (
          <div key={player.id} style={styles.playerCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <strong>{player.name}</strong>
              {player.jersey_number && <span style={styles.badge}>#{player.jersey_number}</span>}
              {player.is_recreational && <span style={styles.recBadge}>Rec</span>}
            </div>
            <div style={styles.meta}>
              {player.position && `${player.position} · `}{teamName(player.team_id)}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p style={styles.empty}>No players yet.</p>}
      </div>
    </div>
  );
}

const styles = {
  heading: { marginBottom: '24px', fontSize: '24px', color: '#f0f0f0' },
  subheading: { marginBottom: '12px', fontSize: '16px', fontWeight: '500', color: '#ccc' },
  card: { background: '#1e1e1e', padding: '20px', borderRadius: '10px',
    marginBottom: '24px', border: '1px solid #2a2a2a' },
  formRow: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '8px 12px', borderRadius: '6px', border: '1px solid #333',
    fontSize: '14px', flex: '1', minWidth: '140px', background: '#2a2a2a', color: '#f0f0f0' },
  button: { padding: '8px 20px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  error: { color: '#ff6b6b', marginTop: '8px', fontSize: '14px' },
  checkbox: { display: 'flex', alignItems: 'center', gap: '6px',
    fontSize: '14px', cursor: 'pointer', color: '#ccc' },
  filterRow: { display: 'flex', gap: '8px', marginBottom: '16px' },
  filterBtn: { padding: '6px 16px', borderRadius: '20px', border: '1px solid #333',
    background: '#1a1a1a', cursor: 'pointer', fontSize: '13px', color: '#ccc' },
  filterActive: { background: '#F5C800', color: '#111', border: '1px solid #F5C800', fontWeight: '600' },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  playerCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 18px', background: '#1a1a1a', borderRadius: '8px',
    border: '1px solid #2a2a2a' },
  badge: { background: '#2a2a2a', color: '#ccc', padding: '2px 8px',
    borderRadius: '10px', fontSize: '12px' },
  recBadge: { background: '#1a3a1a', color: '#4caf50', padding: '2px 8px',
    borderRadius: '10px', fontSize: '12px' },
  meta: { color: '#888', fontSize: '14px' },
  empty: { color: '#555', fontSize: '14px' },
};

export default Players;