import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { loadStoredToken, setAuthToken, getRole, isLoggedIn } from './auth';
import Teams from './pages/Teams';
import Players from './pages/Players';
import Matches from './pages/Matches';
import LiveMatch from './pages/LiveMatch';
import Analytics from './pages/Analytics';
import Login from './pages/Login';
import JoinTeam from './pages/JoinTeam';
import CoachDashboard from './pages/CoachDashboard';
import Profile from './pages/Profile';
import ProtectedRoute from './ProtectedRoute';
import TeamDetail from './pages/TeamDetail';
import SpectatorView from './pages/SpectatorView';

loadStoredToken();

const PAGE_NAMES = {
  '/teams': 'Teams',
  '/players': 'Players',
  '/matches': 'Matches',
  '/analytics': 'Analytics',
  '/join': 'Join a team',
  '/coach': 'Join requests',
  '/profile': 'Profile',
};

function Nav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const role = getRole();
  const email = localStorage.getItem('email') || '';

  if (!loggedIn || location.pathname === '/login' || location.pathname === '/') return null;

  const pageName = Object.entries(PAGE_NAMES).find(([path]) =>
    location.pathname.startsWith(path)
  )?.[1] ?? '';

  const handleLogout = () => {
    setAuthToken(null);
    setLoggedIn(false);
    navigate('/login');
  };

  return (
    <nav style={styles.nav}>
      <span style={styles.pageTitle}>{pageName}</span>

      <div style={styles.navLinks}>
        <Link to="/teams" style={{
          ...styles.link,
          ...(location.pathname === '/teams' ? styles.linkActive : {})
        }}>Teams</Link>
        <Link to="/players" style={{
          ...styles.link,
          ...(location.pathname === '/players' ? styles.linkActive : {})
        }}>Players</Link>
        <Link to="/matches" style={{
          ...styles.link,
          ...(location.pathname === '/matches' ? styles.linkActive : {})
        }}>Matches</Link>
        <Link to="/analytics" style={{
          ...styles.link,
          ...(location.pathname === '/analytics' ? styles.linkActive : {})
        }}>Analytics</Link>
        {role === 'coach' && (
          <Link to="/coach" style={{
            ...styles.link,
            ...(location.pathname === '/coach' ? styles.linkActive : {})
          }}>Requests</Link>
        )}
        {role === 'player' && (
          <Link to="/join" style={{
            ...styles.link,
            ...(location.pathname === '/join' ? styles.linkActive : {})
          }}>Join team</Link>
        )}
      </div>

      <div style={styles.navRight}>
        <Link to="/profile" style={styles.avatar} title="Profile">
          {email?.[0]?.toUpperCase() ?? '?'}
        </Link>
        <button style={styles.logoutBtn} onClick={handleLogout}>Sign out</button>
      </div>
    </nav>
  );
}

function App() {
  return (
    <BrowserRouter>
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Inter', sans-serif;
            background: #111111;
            color: #f0f0f0;
            min-height: 100vh;
          }
          a { text-decoration: none; }
          input, select, button, textarea {
            font-family: 'Inter', sans-serif;
          }
        `}</style>
        <Nav />
        <div style={styles.container}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Login />} />
            <Route path="/teams" element={<ProtectedRoute><Teams /></ProtectedRoute>} />
            <Route path="/players" element={<ProtectedRoute><Players /></ProtectedRoute>} />
            <Route path="/matches" element={<ProtectedRoute><Matches /></ProtectedRoute>} />
            <Route path="/match/:matchId" element={<ProtectedRoute><LiveMatch /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
            <Route path="/join" element={<ProtectedRoute requiredRole="player"><JoinTeam /></ProtectedRoute>} />
            <Route path="/coach" element={<ProtectedRoute requiredRole="coach"><CoachDashboard /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/teams/:teamId" element={<ProtectedRoute><TeamDetail /></ProtectedRoute>} />
            <Route path="/spectator/:matchId" element={<SpectatorView />} />
          </Routes>
        </div>
      </>
    </BrowserRouter>
  );
}

const styles = {
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 32px',
    height: '58px',
    background: '#F5C800',
    width: '100%',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  pageTitle: {
    fontWeight: '700',
    fontSize: '17px',
    color: '#111',
    minWidth: '120px',
  },
  navLinks: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
  },
  link: {
    color: '#111',
    fontSize: '14px',
    fontWeight: '500',
    padding: '6px 12px',
    borderRadius: '6px',
    transition: 'background 0.15s',
  },
  linkActive: {
    background: 'rgba(0,0,0,0.12)',
    fontWeight: '600',
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '120px',
    justifyContent: 'flex-end',
  },
  avatar: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    background: '#111',
    color: '#F5C800',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '15px',
    cursor: 'pointer',
    textDecoration: 'none',
    flexShrink: 0,
  },
  logoutBtn: {
    padding: '6px 12px',
    background: 'transparent',
    color: '#111',
    border: '1.5px solid rgba(0,0,0,0.25)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
  },
  container: {
    padding: '32px',
    maxWidth: '1100px',
    margin: '0 auto',
  },
};

export default App;