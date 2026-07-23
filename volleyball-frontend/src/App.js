import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Teams from './pages/Teams';
import Players from './pages/Players';
import Matches from './pages/Matches';

function App() {
  return (
    <BrowserRouter>
      <nav style={styles.nav}>
        <span style={styles.logo}>Volleyball Manager</span>
        <div style={styles.links}>
          <Link to="/teams" style={styles.link}>Teams</Link>
          <Link to="/players" style={styles.link}>Players</Link>
          <Link to="/matches" style={styles.link}>Matches</Link>
        </div>
      </nav>
      <div style={styles.container}>
        <Routes>
          <Route path="/teams" element={<Teams />} />
          <Route path="/players" element={<Players />} />
          <Route path="/matches" element={<Matches />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

const styles = {
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 32px', background: '#1a1a2e', color: 'white' },
  logo: { fontWeight: 'bold', fontSize: '20px' },
  links: { display: 'flex', gap: '24px' },
  link: { color: 'white', textDecoration: 'none', fontSize: '15px' },
  container: { padding: '32px', maxWidth: '1000px', margin: '0 auto' },
};

export default App;