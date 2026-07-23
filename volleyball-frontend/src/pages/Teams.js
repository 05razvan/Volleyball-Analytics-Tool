import { useEffect, useState } from 'react';
import { getTeams, createTeam } from '../api';

const DIVISIONS = [
  "Men's Premier", "Men's Div 1", "Men's Div 2", "Men's Div 3",
  "Women's Premier", "Women's Div 1", "Women's Div 2", "Women's Div 3"
];

function Teams() {
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState({ name: '', division: '', coach_name: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    getTeams().then(res => setTeams(res.data));
  }, []);

  const handleSubmit = async () => {
    setError('');
    if (!form.name || !form.division) { setError('Name and division are required.'); return; }
    try {
      const res = await createTeam(form);
      setTeams([...teams, res.data]);
      setForm({ name: '', division: '', coach_name: '' });
    } catch (err) {
      setError(err.response?.status === 422 ? 'A team with that name already exists.' : 'Something went wrong.');
    }
  };

  const grouped = DIVISIONS.reduce((acc, div) => {
    acc[div] = teams.filter(t => t.division === div);
    return acc;
  }, {});

  return (
    <div>
      <h2 style={styles.heading}>Teams</h2>
      <div style={styles.card}>
        <h3 style={styles.subheading}>Add a team</h3>
        <div style={styles.formRow}>
          <input style={styles.input} placeholder="Team name"
            value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <select style={styles.input} value={form.division}
            onChange={e => setForm({ ...form, division: e.target.value })}>
            <option value="">Select division</option>
            {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <input style={styles.input} placeholder="Coach name"
            value={form.coach_name} onChange={e => setForm({ ...form, coach_name: e.target.value })} />
          <button style={styles.button} onClick={handleSubmit}>Add</button>
        </div>
        {error && <p style={styles.error}>{error}</p>}
      </div>

      {DIVISIONS.map(div => grouped[div]?.length > 0 && (
        <div key={div} style={{ marginBottom: '24px' }}>
          <h3 style={styles.divHeading}>{div}</h3>
          {grouped[div].map(team => (
            <div key={team.id} style={styles.teamCard}>
              <strong>{team.name}</strong>
              <span style={styles.meta}>Coach: {team.coach_name}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const styles = {
  heading: { marginBottom: '24px', fontSize: '24px' },
  subheading: { marginBottom: '12px', fontSize: '16px', fontWeight: '500' },
  divHeading: { fontSize: '14px', fontWeight: '600', color: '#666', textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: '8px' },
  card: { background: '#f8f8f8', padding: '20px', borderRadius: '8px', marginBottom: '32px' },
  formRow: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  input: { padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd',
    fontSize: '14px', flex: '1', minWidth: '150px' },
  button: { padding: '8px 20px', background: '#1a1a2e', color: 'white',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
  error: { color: 'red', marginTop: '8px', fontSize: '14px' },
  teamCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 16px', background: 'white', borderRadius: '8px',
    border: '1px solid #eee', marginBottom: '8px' },
  meta: { color: '#888', fontSize: '14px' },
};

export default Teams;