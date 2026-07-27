import { useEffect, useState } from 'react';
import { getTeams } from '../api';
import { createAccount } from '../api';

const DIVISIONS = [
  "Men's Premier", "Men's Div 1", "Men's Div 2", "Men's Div 3",
  "Women's Premier", "Women's Div 1", "Women's Div 2", "Women's Div 3"
];

function AdminPanel() {
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'coach', team_id: ''
  });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getTeams().then(res => setTeams(res.data));
  }, []);

  const handleCreate = async () => {
    setMsg(''); setError('');
    if (!form.name || !form.email || !form.password) {
      setError('Name, email and password are required.');
      return;
    }
    try {
      await createAccount(form);
      setMsg(`Account created for ${form.name}.`);
      setForm({ name: '', email: '', password: '', role: 'coach', team_id: '' });
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong.');
    }
  };

  const divisionTeams = (div) => teams.filter(t => t.division === div);

  return (
    <div>
      <h2 style={styles.heading}>Admin panel</h2>

      <div style={styles.card}>
        <h3 style={styles.subheading}>Create coach or captain account</h3>
        <div style={styles.formCol}>
          <input style={styles.input} placeholder="Full name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })} />
          <input style={styles.input} placeholder="Email"
            type="email" value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })} />
          <input style={styles.input} placeholder="Password"
            type="password" value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })} />
          <select style={styles.input} value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="coach">Coach</option>
            <option value="captain">Captain</option>
            <option value="admin">Admin</option>
          </select>
          <select style={styles.input} value={form.team_id}
            onChange={e => setForm({ ...form, team_id: e.target.value })}>
            <option value="">No team (assign later)</option>
            {DIVISIONS.map(div => {
              const dt = divisionTeams(div);
              if (!dt.length) return null;
              return (
                <optgroup key={div} label={div}>
                  {dt.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {error && <p style={styles.error}>{error}</p>}
          {msg && <p style={styles.success}>{msg}</p>}
          <button style={styles.button} onClick={handleCreate}>
            Create account
          </button>
        </div>
      </div>

      <div style={styles.infoCard}>
        <p style={styles.infoText}>
          Players do not need accounts. Add them directly from the Players page.
          Only coaches, captains, and admins need login credentials.
        </p>
      </div>
    </div>
  );
}

const styles = {
  heading: { marginBottom: '24px', fontSize: '24px', color: '#f0f0f0' },
  subheading: { marginBottom: '16px', fontSize: '16px',
    fontWeight: '500', color: '#ccc' },
  card: {
    background: '#1e1e1e', padding: '24px', borderRadius: '10px',
    marginBottom: '20px', border: '1px solid #2a2a2a', maxWidth: '400px',
  },
  formCol: { display: 'flex', flexDirection: 'column', gap: '12px' },
  input: {
    padding: '10px 14px', borderRadius: '8px', border: '1px solid #333',
    fontSize: '14px', background: '#2a2a2a', color: '#f0f0f0',
  },
  button: {
    padding: '11px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontSize: '14px', fontWeight: '700',
  },
  error: { color: '#ff6b6b', fontSize: '13px' },
  success: { color: '#2ecc71', fontSize: '13px' },
  infoCard: {
    background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: '10px', padding: '16px', maxWidth: '400px',
  },
  infoText: { color: '#888', fontSize: '13px', lineHeight: 1.6 },
};

export default AdminPanel;