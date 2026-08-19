import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTeams, createTeam } from '../api';
import { getRole } from '../auth';

const DIVISIONS = [
  "Men's Premier", "Men's Div 1", "Men's Div 2", "Men's Div 3",
  "Women's Premier", "Women's Div 1", "Women's Div 2", "Women's Div 3"
];

function Teams() {
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState({ name: '', division: '' });
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const role = getRole();
  const navigate = useNavigate();

  useEffect(() => {
    getTeams().then(res => setTeams(res.data));
  }, []);

  const handleSubmit = async () => {
    setError('');
    if (!form.name || !form.division) {
      setError('Name and division are required.');
      return;
    }
    try {
      const res = await createTeam(form);
      setTeams([...teams, res.data]);
      setForm({ name: '', division: '' });
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong.');
    }
  };

  const grouped = DIVISIONS.reduce((acc, div) => {
    acc[div] = teams.filter(t => t.division === div);
    return acc;
  }, {});

  return (
    <div>
      <div style={styles.pageHeader}>
        <h2 style={styles.heading}>Teams</h2>
        {role === 'admin' && (
          <button style={styles.addBtn} onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Add team'}
          </button>
        )}
      </div>

      {role === 'admin' && showForm && (
        <div style={styles.card}>
          <div style={styles.formCol}>
            <input style={styles.input}
              placeholder="Team name e.g. Glasgow Men's 1"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
            <select style={styles.input} value={form.division}
              onChange={e => setForm({ ...form, division: e.target.value })}>
              <option value="">Select division</option>
              {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <button style={styles.button} onClick={handleSubmit}>Add team</button>
          </div>
          {error && <p style={styles.error}>{error}</p>}
        </div>
      )}

      {DIVISIONS.map(div => {
        const divTeams = grouped[div];
        if (!divTeams || divTeams.length === 0) return null;
        return (
          <div key={div} style={{ marginBottom: '24px' }}>
            <h3 style={styles.divHeading}>{div}</h3>
            {divTeams.map(team => (
              <div key={team.id} style={styles.teamCard}
                onClick={() => navigate(`/teams/${team.id}`)}>
                <strong style={styles.teamName}>{team.name}</strong>
                <span style={styles.viewBtn}>→</span>
              </div>
            ))}
          </div>
        );
      })}

      {teams.length === 0 && (
        <p style={styles.empty}>No teams yet. Ask your admin to create one.</p>
      )}
    </div>
  );
}

const styles = {
  pageHeader: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: '20px',
  },
  heading: { fontSize: '22px', color: '#f0f0f0' },
  addBtn: {
    padding: '8px 16px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontSize: '13px', fontWeight: '600',
  },
  card: {
    background: '#1e1e1e', padding: '16px', borderRadius: '10px',
    marginBottom: '24px', border: '1px solid #2a2a2a',
  },
  formCol: { display: 'flex', flexDirection: 'column', gap: '10px' },
  input: {
    padding: '10px 12px', borderRadius: '6px', border: '1px solid #333',
    fontSize: '14px', background: '#2a2a2a', color: '#f0f0f0',
  },
  button: {
    padding: '10px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontSize: '14px', fontWeight: '600',
  },
  error: { color: '#ff6b6b', marginTop: '8px', fontSize: '13px' },
  divHeading: {
    fontSize: '12px', fontWeight: '600', color: '#F5C800',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px',
  },
  teamCard: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px', background: '#1a1a1a', borderRadius: '8px',
    border: '1px solid #2a2a2a', marginBottom: '8px', cursor: 'pointer',
  },
  teamName: { color: '#f0f0f0', fontSize: '15px' },
  viewBtn: { color: '#F5C800', fontSize: '16px' },
  empty: { color: '#555', fontSize: '14px' },
};

export default Teams;