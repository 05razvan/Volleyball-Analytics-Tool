import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api';
import { setAuthToken } from '../auth';

function Login({ onLogin }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    setError('');
    if (!form.email || !form.password) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    try {
      console.log('Attempting login...');
      const res = await login({ email: form.email, password: form.password });
      console.log('Response:', res.data);
      const { access_token, role, user_id, name } = res.data;
      setAuthToken(access_token);
      localStorage.setItem('role', role);
      localStorage.setItem('user_id', user_id);
      localStorage.setItem('email', form.email);
      localStorage.setItem('name', name);
      console.log('Calling onLogin...');
      onLogin();
      console.log('Navigating...');
      navigate('/teams');
    } catch (err) {
      console.error('Login error:', err);
      setError(err.response?.data?.detail || 'Incorrect email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = () => {
    navigate('/teams');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>🏐</div>
        <h1 style={styles.title}>Volleyball Analytics</h1>
        <p style={styles.subtitle}>Glasgow University Sports Club</p>

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

        {error && <p style={styles.error}>{error}</p>}

        <button
          style={{ ...styles.button, opacity: loading ? 0.7 : 1 }}
          onClick={handleLogin}
          disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <button style={styles.guestBtn} onClick={handleGuest}>
          Continue as guest →
        </button>
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
    width: '100%', maxWidth: '360px', border: '1px solid #2a2a2a',
  },
  logo: { fontSize: '40px', textAlign: 'center', marginBottom: '8px' },
  title: {
    fontSize: '20px', fontWeight: '700', textAlign: 'center',
    color: '#f0f0f0', marginBottom: '4px',
  },
  subtitle: {
    fontSize: '13px', textAlign: 'center',
    color: '#888', marginBottom: '28px',
  },
  input: {
    display: 'block', width: '100%', padding: '11px 14px',
    marginBottom: '12px', borderRadius: '8px', border: '1px solid #333',
    fontSize: '14px', boxSizing: 'border-box',
    background: '#2a2a2a', color: '#f0f0f0',
  },
  button: {
    width: '100%', padding: '13px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontSize: '15px', fontWeight: '700', marginBottom: '12px',
  },
  guestBtn: {
    width: '100%', padding: '12px', background: 'transparent',
    color: '#888', border: '1px solid #333', borderRadius: '8px',
    cursor: 'pointer', fontSize: '14px',
  },
  error: { color: '#ff6b6b', fontSize: '13px', marginBottom: '10px' },
};

export default Login;