import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPlayerAnalytics } from '../api';
import { getRole } from '../auth';

const api_base = 'http://localhost:8000';

function TeamDetail() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const role = getRole();

  useEffect(() => {
    fetch(`${api_base}/teams/${teamId}`)
      .then(r => r.json()).then(setTeam);
    const token = localStorage.getItem('token');
    fetch(`${api_base}/teams/${teamId}/players`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }).then(r => r.json()).then(setPlayers);
  }, [teamId]);

  const handleSelectPlayer = async (player) => {
    if (player.is_private) {
      setSelectedPlayer({ ...player, private: true });
      setPlayerStats(null);
      return;
    }
    setSelectedPlayer(player);
    const res = await getPlayerAnalytics(player.id);
    setPlayerStats(res.data);
  };

  if (!team) return <div style={styles.loading}>Loading...</div>;

  return (
    <div>
      <button style={styles.back} onClick={() => navigate('/teams')}>← Back</button>
      <h2 style={styles.heading}>{team.name}</h2>
      <p style={styles.division}>{team.division}</p>

      <div style={styles.coaches}>
        {team.head_coach && (
          <span style={styles.coachTag}>Head coach: {team.head_coach}</span>
        )}
        {team.assistant_coach && (
          <span style={styles.coachTag}>Assistant: {team.assistant_coach}</span>
        )}
      </div>

      <div style={styles.layout}>
        <div style={styles.playerList}>
          <h3 style={styles.sectionTitle}>Players ({players.length})</h3>
          {players.length === 0 && (
            <p style={styles.empty}>No players yet.</p>
          )}
          {players.map(p => (
            <div
              key={p.id}
              style={{
                ...styles.playerCard,
                ...(selectedPlayer?.id === p.id ? styles.playerCardActive : {})
              }}
              onClick={() => handleSelectPlayer(p)}>
              <div style={styles.playerMain}>
                <span style={styles.playerName}>{p.name}</span>
                {p.jersey_number && (
                  <span style={styles.badge}>#{p.jersey_number}</span>
                )}
                {p.is_private && (
                  <span style={styles.privateBadge}>🔒 Private</span>
                )}
              </div>
              <span style={styles.position}>{p.position ?? 'Recreational'}</span>
            </div>
          ))}
        </div>

        <div style={styles.statsPanel}>
          {!selectedPlayer && (
            <div style={styles.placeholder}>
              <p>Select a player to view their stats</p>
            </div>
          )}

          {selectedPlayer?.private && (
            <div style={styles.privateMsg}>
              <div style={styles.privateLock}>🔒</div>
              <p style={styles.privateName}>{selectedPlayer.name}</p>
              <p style={styles.privateText}>This player has set their profile to private.</p>
            </div>
          )}

          {selectedPlayer && !selectedPlayer.private && playerStats && (
            <div>
              <div style={styles.playerHeader}>
                <div style={styles.playerAvatar}>
                  {selectedPlayer.name[0].toUpperCase()}
                </div>
                <div>
                  <div style={styles.playerFullName}>{selectedPlayer.name}</div>
                  <div style={styles.playerMeta}>
                    {selectedPlayer.position ?? 'Recreational'}
                    {selectedPlayer.jersey_number && ` · #${selectedPlayer.jersey_number}`}
                  </div>
                </div>
              </div>

              <div style={styles.statGrid}>
                {[
                  { label: 'Kills', value: playerStats.kills, color: '#2ecc71' },
                  { label: 'Aces', value: playerStats.aces, color: '#3498db' },
                  { label: 'Blocks', value: playerStats.blocks, color: '#9b59b6' },
                  { label: 'Digs', value: playerStats.digs, color: '#1abc9c' },
                  { label: 'Assists', value: playerStats.assists, color: '#e67e22' },
                  { label: 'Kill %', value: `${playerStats.kill_pct}%`, color: '#F5C800' },
                  { label: 'Serve %', value: `${playerStats.serve_pct}%`, color: '#F5C800' },
                  { label: 'Atk eff.', value: `${playerStats.attack_efficiency}%`, color: '#F5C800' },
                ].map(s => (
                  <div key={s.label} style={styles.statBox}>
                    <div style={{ ...styles.statVal, color: s.color }}>{s.value}</div>
                    <div style={styles.statLabel}>{s.label}</div>
                  </div>
                ))}
              </div>

              <button
                style={styles.fullProfileBtn}
                onClick={() => navigate(`/player/${selectedPlayer.id}`)}>
                View full profile →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  loading: { color: '#888', padding: '40px' },
  back: {
    background: 'none', border: 'none', color: '#F5C800',
    cursor: 'pointer', fontSize: '14px', marginBottom: '16px', padding: 0,
  },
  heading: { fontSize: '26px', color: '#f0f0f0', marginBottom: '4px' },
  division: { color: '#888', fontSize: '14px', marginBottom: '12px' },
  coaches: { display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' },
  coachTag: {
    background: '#1e1e1e', border: '1px solid #2a2a2a', color: '#ccc',
    padding: '4px 12px', borderRadius: '20px', fontSize: '13px',
  },
  layout: { display: 'flex', gap: '20px', alignItems: 'flex-start' },
  playerList: { width: '260px', flexShrink: 0 },
  sectionTitle: { fontSize: '13px', color: '#F5C800', textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: '12px' },
  playerCard: {
    padding: '12px 14px', background: '#1a1a1a', borderRadius: '8px',
    border: '1px solid #2a2a2a', marginBottom: '8px', cursor: 'pointer',
  },
  playerCardActive: { border: '1px solid #F5C800', background: '#1a1a00' },
  playerMain: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' },
  playerName: { color: '#f0f0f0', fontWeight: '600', fontSize: '14px' },
  badge: {
    background: '#2a2a2a', color: '#888', padding: '1px 7px',
    borderRadius: '10px', fontSize: '11px',
  },
  privateBadge: { fontSize: '11px', color: '#888' },
  position: { color: '#666', fontSize: '12px' },
  statsPanel: { flex: 1 },
  placeholder: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '200px', color: '#555', fontSize: '14px',
    background: '#1a1a1a', borderRadius: '10px', border: '1px solid #2a2a2a',
  },
  privateMsg: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '40px', background: '#1a1a1a',
    borderRadius: '10px', border: '1px solid #2a2a2a',
  },
  privateLock: { fontSize: '32px', marginBottom: '12px' },
  privateName: { color: '#f0f0f0', fontWeight: '600', marginBottom: '6px' },
  privateText: { color: '#888', fontSize: '14px' },
  playerHeader: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' },
  playerAvatar: {
    width: '48px', height: '48px', borderRadius: '50%', background: '#F5C800',
    color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: '700', fontSize: '20px', flexShrink: 0,
  },
  playerFullName: { color: '#f0f0f0', fontWeight: '700', fontSize: '18px' },
  playerMeta: { color: '#888', fontSize: '13px', marginTop: '3px' },
  statGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '10px', marginBottom: '16px',
  },
  statBox: {
    background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px',
    padding: '12px', textAlign: 'center',
  },
  statVal: { fontSize: '22px', fontWeight: '700', marginBottom: '4px' },
  statLabel: { fontSize: '11px', color: '#888', textTransform: 'uppercase' },
  fullProfileBtn: {
    background: 'none', border: '1px solid #F5C800', color: '#F5C800',
    padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
  },
  empty: { color: '#555', fontSize: '14px' },
};

export default TeamDetail;