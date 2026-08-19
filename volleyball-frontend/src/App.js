import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { loadStoredToken, setAuthToken, getRole, isLoggedIn } from './auth';
import Teams from './pages/Teams';
import Players from './pages/Players';
import Matches from './pages/Matches';
import LiveMatch from './pages/LiveMatch';
import Analytics from './pages/Analytics';
import Login from './pages/Login';
import Profile from './pages/Profile';
import TeamDetail from './pages/TeamDetail';
import SpectatorView from './pages/SpectatorView';
import AdminPanel from './pages/AdminPanel';
import ProtectedRoute from './ProtectedRoute';

loadStoredToken();

const PAGE_NAMES = {
  '/teams': 'Teams',
  '/players': 'Players',
  '/matches': 'Matches',
  '/analytics': 'Analytics',
  '/profile': 'Profile',
  '/admin': 'Admin',
};

function Nav({ loggedIn, onLogout }) {
  const location = useLocation();
  const role = getRole();
  const name = localStorage.getItem('name') || '';
  const [menuOpen, setMenuOpen] = useState(false);

  if (location.pathname === '/login' || location.pathname === '/') return null;

  const pageName = Object.entries(PAGE_NAMES).find(
    ([path]) => location.pathname.startsWith(path)
  )?.[1] ?? '';

  const navLinks = [
    { to: '/teams', label: 'Teams' },
    { to: '/players', label: 'Players' },
    { to: '/matches', label: 'Matches' },
    { to: '/analytics', label: 'Analytics' },
  ];

  return (
    <nav style={styles.nav}>
      <span style={styles.pageTitle}>{pageName}</span>

      <div className="desktop-nav" style={styles.navLinks}>
        {navLinks.map(l => (
          <Link key={l.to} to={l.to} style={{
            ...styles.link,
            ...(location.pathname.startsWith(l.to) ? styles.linkActive : {})
          }}>{l.label}</Link>
        ))}
      </div>

      <div style={styles.navRight}>
        {loggedIn ? (
          <>
            {role === 'admin' && (
              <Link to="/admin" style={styles.adminLink}>Admin</Link>
            )}
            <Link to="/profile" style={styles.avatar} title={name}>
              {name?.[0]?.toUpperCase() ?? '?'}
            </Link>
            <button style={styles.logoutBtn} onClick={onLogout}>
              Sign out
            </button>
          </>
        ) : (
          <Link to="/login" style={styles.loginLink}>Sign in</Link>
        )}
      </div>

      <button
        className="hamburger-btn"
        style={styles.hamburger}
        onClick={() => setMenuOpen(!menuOpen)}>
        {menuOpen ? '✕' : '☰'}
      </button>

      {menuOpen && (
        <div style={styles.mobileMenu}>
          {navLinks.map(l => (
            <Link key={l.to} to={l.to}
              style={{
                ...styles.mobileLink,
                ...(location.pathname.startsWith(l.to) ? styles.mobileLinkActive : {})
              }}
              onClick={() => setMenuOpen(false)}>
              {l.label}
            </Link>
          ))}
          {loggedIn ? (
            <>
              {role === 'admin' && (
                <Link to="/admin" style={styles.mobileLink}
                  onClick={() => setMenuOpen(false)}>Admin</Link>
              )}
              <Link to="/profile" style={styles.mobileLink}
                onClick={() => setMenuOpen(false)}>
                Profile ({name})
              </Link>
              <button style={styles.mobileSignOut} onClick={() => {
                onLogout();
                setMenuOpen(false);
              }}>Sign out</button>
            </>
          ) : (
            <Link to="/login" style={styles.mobileLink}
              onClick={() => setMenuOpen(false)}>Sign in</Link>
          )}
        </div>
      )}
    </nav>
  );
}

function AppInner() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const navigate = useNavigate();

  const handleLogout = () => {
    setAuthToken(null);
    setLoggedIn(false);
    navigate('/teams');
  };

  const handleLogin = () => setLoggedIn(true);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #111111;
          color: #f0f0f0; min-height: 100vh; }
        a { text-decoration: none; }
        input, select, button, textarea { font-family: 'Inter', sans-serif; }
        .hamburger-btn { display: none !important; }
        @media (max-width: 600px) {
          .desktop-nav { display: none !important; }
          .hamburger-btn { display: flex !important; }
        }
        @media (max-width: 600px) {
          .tracker-body { flex-direction: column !important; height: auto !important; }
          .tracker-player-panel { width: 100% !important; border-right: none !important; border-bottom: 1px solid #2a2a4a; max-height: 280px; }
          .tracker-event-panel { height: auto !important; }
          .rotation-mini { display: flex; gap: 8px; }
        }
      `}</style>
      <Nav loggedIn={loggedIn} onLogout={handleLogout} />
      <div style={styles.container}>
        <Routes>
          <Route path="/" element={<Teams />} />
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/teams/:teamId" element={<TeamDetail />} />
          <Route path="/players" element={<Players />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/match/:matchId" element={
            <ProtectedRoute><LiveMatch /></ProtectedRoute>
          } />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/profile" element={
            <ProtectedRoute><Profile /></ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute requiredRole="admin"><AdminPanel /></ProtectedRoute>
          } />
          <Route path="/spectator/:matchId" element={<SpectatorView />} />
        </Routes>
      </div>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}

const styles = {
  nav: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: '58px', background: '#F5C800',
    width: '100%', position: 'sticky', top: 0, zIndex: 100,
    flexWrap: 'nowrap',
  },
  pageTitle: {
    fontWeight: '700', fontSize: '16px', color: '#111', flexShrink: 0,
  },
  navLinks: {
    display: 'flex', gap: '2px', alignItems: 'center',
  },
  link: {
    color: '#111', fontSize: '14px', fontWeight: '500',
    padding: '6px 10px', borderRadius: '6px', whiteSpace: 'nowrap',
  },
  linkActive: { background: 'rgba(0,0,0,0.12)', fontWeight: '600' },
  navRight: {
    display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0,
  },
  avatar: {
    width: '32px', height: '32px', borderRadius: '50%', background: '#111',
    color: '#F5C800', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: '700', fontSize: '14px', cursor: 'pointer', flexShrink: 0,
  },
  logoutBtn: {
    padding: '5px 10px', background: 'transparent', color: '#111',
    border: '1.5px solid rgba(0,0,0,0.25)', borderRadius: '6px',
    cursor: 'pointer', fontSize: '12px', fontWeight: '500', whiteSpace: 'nowrap',
  },
  loginLink: {
    padding: '6px 14px', background: '#111', color: '#F5C800',
    borderRadius: '6px', fontSize: '13px', fontWeight: '600',
  },
  adminLink: {
    padding: '5px 10px', background: 'rgba(0,0,0,0.15)', color: '#111',
    borderRadius: '6px', fontSize: '12px', fontWeight: '600',
  },
  hamburger: {
    background: 'none', border: 'none', fontSize: '20px',
    cursor: 'pointer', color: '#111', padding: '4px 8px', flexShrink: 0,
  },
  mobileMenu: {
    position: 'absolute', top: '58px', left: 0, right: 0,
    background: '#F5C800', zIndex: 99, display: 'flex',
    flexDirection: 'column', borderTop: '1px solid rgba(0,0,0,0.1)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  },
  mobileLink: {
    display: 'block', padding: '14px 24px', color: '#111',
    fontSize: '15px', fontWeight: '500',
    borderBottom: '1px solid rgba(0,0,0,0.08)',
  },
  mobileLinkActive: { fontWeight: '700', background: 'rgba(0,0,0,0.08)' },
  mobileSignOut: {
    display: 'block', width: '100%', padding: '14px 24px',
    background: 'none', border: 'none', color: '#111',
    fontSize: '15px', fontWeight: '500', textAlign: 'left',
    cursor: 'pointer', borderTop: '1px solid rgba(0,0,0,0.08)',
  },
  container: { padding: '20px', maxWidth: '1100px', margin: '0 auto' },
};

export default App;