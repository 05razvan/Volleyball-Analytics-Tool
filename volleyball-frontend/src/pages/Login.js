import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register, getTeams } from '../api';
import { setAuthToken } from '../auth';

const DIVISIONS = [
  "Men's Premier", "Men's Div 1", "Men's Div 2", "Men's Div 3",
  "Women's Premier", "Women's Div 1", "Women's Div 2", "Women's Div 3"
];

function Login() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    email: '', password: '', name: '', role: 'player', team_id: ''
  });
  const [teams, setTeams] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getTeams().then(res => setTeams(res.data)).catch(() => {});
  }, []);

  const isCoachRole = form.role === 'coach' || form.role === 'captain';

  const handleSubmit = async () => {
    setError('');
    if (!form.email || !form.password) {
      setError('Email and password are required.');
      return;
    }
    if (mode === 'register' && !form.name) {
      setError('Name is required.');
      return;
    }
    setLoading(true);
    try {
      const res = mode === 'login'
        ? await login({ email: form.email, password: form.password })
        : await register({
            email: form.email,
            password: form.password,
            name: form.name,
            role: form.role,
            team_id: form.team_id ? parseInt(form.team_id) : null,
          });
      const { access_token, role, user_id, name } = res.data;
      setAuthToken(access_token);
      localStorage.setItem('role', role);
      localStorage.setItem('user_id', user_id);
      localStorage.setItem('email', form.email);
      localStorage.setItem('name', name);
      if (role === 'player' || role === 'captain') navigate('/join');
      else navigate('/teams');
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const divisionTeams = (div) => teams.filter(t => t.division === div);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>🏐</div>
        <h1 style={styles.title}>Volleyball Analytics</h1>
        <p style={styles.subtitle}>Glasgow University Sports Club</p>

        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(mode === 'login' ? styles.tabActive : {}) }}
            onClick={() => { setMode('login'); setError(''); }}>
            Sign in
          </button>
          <button
            style={{ ...styles.tab, ...(mode === 'register' ? styles.tabActive : {}) }}
            onClick={() => { setMode('register'); setError(''); }}>
            Register
          </button>
        </div>

        {mode === 'register' && (
          <input
            style={styles.input}
            placeholder="Full name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            onKeyDown={handleKeyDown}
          />
        )}

        <input
          style={styles.input}
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })}
          onKeyDown={handleKeyDown}
        />
        <input
          style={styles.input}
          placeholder="Password"
          type="password"
          value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })}
          onKeyDown={handleKeyDown}
        />

        {mode === 'register' && (
          <>
            <select
              style={styles.input}
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value, team_id: '' })}>
              <option value="player">Player</option>
              <option value="captain">Captain</option>
              <option value="coach">Coach</option>
            </select>

            {isCoachRole && (
              <>
                <p style={styles.hint}>Select the team you coach</p>
                <select
                  style={styles.input}
                  value={form.team_id}
                  onChange={e => setForm({ ...form, team_id: e.target.value })}>
                  <option value="">Select your team</option>
                  {DIVISIONS.map(div => {
                    const divTeams = divisionTeams(div);
                    if (divTeams.length === 0) return null;
                    return (
                      <optgroup key={div} label={div}>
                        {divTeams.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </>
            )}
          </>
        )}

        {error && <p style={styles.error}>{error}</p>}

        <button
          style={{ ...styles.button, opacity: loading ? 0.7 : 1 }}
          onClick={handleSubmit}
          disabled={loading}>
          {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        {mode === 'login' && (
          <p style={styles.adminHint}>
            Admin? Use your admin credentials to sign in.
          </p>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: '#111', padding: '20px',
  },
  card: {
    background: '#1a1a1a', padding: '40px', borderRadius: '16px',
    width: '100%', maxWidth: '380px', border: '1px solid #2a2a2a',
  },
  logo: { fontSize: '40px', textAlign: 'center', marginBottom: '8px' },
  title: {
    fontSize: '20px', fontWeight: '700', textAlign: 'center',
    color: '#f0f0f0', marginBottom: '4px',
  },
  subtitle: {
    fontSize: '13px', textAlign: 'center', color: '#888',
    marginBottom: '28px',
  },
  tabs: {
    display: 'flex', marginBottom: '20px', border: '1px solid #2a2a2a',
    borderRadius: '8px', overflow: 'hidden',
  },
  tab: {
    flex: 1, padding: '10px', border: 'none', background: '#1e1e1e',
    cursor: 'pointer', fontSize: '14px', color: '#888',
  },
  tabActive: { background: '#F5C800', color: '#111', fontWeight: '600' },
  input: {
    display: 'block', width: '100%', padding: '11px 14px', marginBottom: '12px',
    borderRadius: '8px', border: '1px solid #333', fontSize: '14px',
    boxSizing: 'border-box', background: '#2a2a2a', color: '#f0f0f0',
  },
  hint: { fontSize: '12px', color: '#888', marginBottom: '6px', marginTop: '-4px' },
  button: {
    width: '100%', padding: '13px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontSize: '15px', fontWeight: '700', marginTop: '4px',
  },
  error: { color: '#ff6b6b', fontSize: '13px', marginBottom: '10px' },
  adminHint: { fontSize: '12px', color: '#555', textAlign: 'center', marginTop: '16px' },
};

export default Login;