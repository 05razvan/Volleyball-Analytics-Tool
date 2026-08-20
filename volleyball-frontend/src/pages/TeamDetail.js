import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPlayerAnalytics, promoteCaptain, removeFromTeam,
         updatePlayerProfile } from '../api';

const POSITIONS = ["Setter", "Outside Hitter", "Opposite", "Middle Blocker", "Libero"];
const BASE_URL = 'https://volleyball-analytics-tool-production.up.railway.app';

function TeamDetail() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ jersey_number: '', position: '' });
  const [msg, setMsg] = useState('');
  const [mobile, setMobile] = useState(window.innerWidth <= 600);

  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  const isCoachOrAdmin = role === 'coach' || role === 'admin' || role === 'captain';

  useEffect(() => {
    const handleResize = () => setMobile(window.innerWidth <= 600);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const load = () => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${BASE_URL}/teams/${teamId}`)
      .then(r => r.json()).then(setTeam);
    fetch(`${BASE_URL}/teams/${teamId}/players`, { headers })
      .then(r => r.json()).then(data => {
        setPlayers(Array.isArray(data) ? data : []);
      });
  };

  useEffect(() => { load(); }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectPlayer = async (player) => {
    if (selectedPlayer?.id === player.id) {
      setSelectedPlayer(null);
      setPlayerStats(null);
      return;
    }
    setSelectedPlayer(player);
    setProfileForm({
      jersey_number: player.jersey_number ?? '',
      position: player.position ?? '',
    });
    setMsg('');
    try {
      const res = await getPlayerAnalytics(player.id);
      setPlayerStats(res.data);
    } catch {
      setPlayerStats(null);
    }
  };

  const handlePromote = async (playerId) => {
    if (!window.confirm('Promote this player to captain?')) return;
    try {
      await promoteCaptain(playerId);
      setMsg('Player promoted to captain.');
      load();
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Something went wrong.');
    }
  };

  const handleRemove = async (playerId) => {
    if (!window.confirm('Remove this player from the team?')) return;
    try {
      await removeFromTeam(playerId);
      setSelectedPlayer(null);
      setPlayerStats(null);
      load();
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Something went wrong.');
    }
  };

  const handleProfileSave = async () => {
    try {
      await updatePlayerProfile(selectedPlayer.id, {
        jersey_number: profileForm.jersey_number ? parseInt(profileForm.jersey_number) : null,
        position: profileForm.position || null,
      });
      setMsg('Profile updated.');
      setEditingProfile(false);
      load();
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Something went wrong.');
    }
  };

  const StatBox = ({ label, value, color = '#f0f0f0' }) => (
    <div style={styles.statBox}>
      <div style={{ ...styles.statVal, color }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );

  const PlayerStatsPanel = ({ player }) => (
    <div style={styles.statsPanel}>
      <div style={styles.playerHeader}>
        <div style={styles.playerAvatar}>
          {player.name[0].toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={styles.playerFullName}>{player.name}</div>
          <div style={styles.playerMeta}>
            {player.position ?? 'No position'}
            {player.jersey_number ? ` · #${player.jersey_number}` : ''}
            {player.user_role === 'captain' && (
              <span style={styles.captainBadge}> C</span>
            )}
          </div>
        </div>
      </div>

      {msg && <p style={styles.msg}>{msg}</p>}

      {isCoachOrAdmin && (
        <div style={styles.editSection}>
          {!editingProfile ? (
            <button style={styles.editBtn} onClick={() => setEditingProfile(true)}>
              ✏️ Edit position & jersey
            </button>
          ) : (
            <div style={styles.editForm}>
              <select style={styles.input} value={profileForm.position}
                onChange={e => setProfileForm({ ...profileForm, position: e.target.value })}>
                <option value="">No position</option>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input style={styles.input} type="number" placeholder="Jersey number"
                value={profileForm.jersey_number}
                onChange={e => setProfileForm({ ...profileForm, jersey_number: e.target.value })} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={styles.saveBtn} onClick={handleProfileSave}>Save</button>
                <button style={styles.cancelBtn} onClick={() => setEditingProfile(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {isCoachOrAdmin && (
        <div style={styles.coachActions}>
          <button style={styles.promoteBtn} onClick={() => handlePromote(player.id)}>
            ⭐ Captain
          </button>
          <button style={styles.removeBtn} onClick={() => handleRemove(player.id)}>
            ✕ Remove
          </button>
        </div>
      )}

      {playerStats ? (
        <>
          <div style={styles.statGrid}>
            <StatBox label="Kills" value={playerStats.kills} color="#2ecc71" />
            <StatBox label="Aces" value={playerStats.aces} color="#3498db" />
            <StatBox label="Blocks" value={playerStats.blocks} color="#9b59b6" />
            <StatBox label="Digs" value={playerStats.digs} color="#1abc9c" />
            <StatBox label="Assists" value={playerStats.assists} color="#e67e22" />
          </div>
          <div style={{ ...styles.statGrid, gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <StatBox label="Kill %" value={`${playerStats.kill_pct}%`} color="#F5C800" />
            <StatBox label="Serve %" value={`${playerStats.serve_pct}%`} color="#F5C800" />
            <StatBox label="Serve err" value={`${playerStats.serve_error_rate ?? 0}%`} color="#e74c3c" />
          </div>
        </>
      ) : (
        <p style={styles.empty}>No stats yet.</p>
      )}
    </div>
  );

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

      <div style={styles.sectionTitle}>
        Players ({players.length})
      </div>

      {mobile ? (
        // Mobile: collapsible cards
        <div>
          {players.map(p => (
            <div key={p.id}>
              <div
                style={{
                  ...styles.playerCard,
                  ...(selectedPlayer?.id === p.id ? styles.playerCardActive : {})
                }}
                onClick={() => handleSelectPlayer(p)}>
                <div style={styles.playerCardMain}>
                  <span style={styles.playerName}>{p.name}</span>
                  {p.jersey_number && <span style={styles.badge}>#{p.jersey_number}</span>}
                  {p.user_role === 'captain' && <span style={styles.captainBadge}>C</span>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={styles.position}>{p.position ?? 'No position'}</span>
                  <span style={{ color: '#F5C800', fontSize: '11px' }}>
                    {selectedPlayer?.id === p.id ? '▲' : '▼ stats'}
                  </span>
                </div>
              </div>
              {selectedPlayer?.id === p.id && (
                <div style={{ marginBottom: '8px' }}>
                  <PlayerStatsPanel player={p} />
                </div>
              )}
            </div>
          ))}
          {players.length === 0 && <p style={styles.empty}>No players yet.</p>}
        </div>
      ) : (
        // Desktop: side by side
        <div style={styles.layout}>
          <div style={styles.playerList}>
            {players.map(p => (
              <div key={p.id}
                style={{
                  ...styles.playerCard,
                  ...(selectedPlayer?.id === p.id ? styles.playerCardActive : {})
                }}
                onClick={() => handleSelectPlayer(p)}>
                <div style={styles.playerCardMain}>
                  <span style={styles.playerName}>{p.name}</span>
                  {p.jersey_number && <span style={styles.badge}>#{p.jersey_number}</span>}
                  {p.user_role === 'captain' && <span style={styles.captainBadge}>C</span>}
                </div>
                <span style={styles.position}>{p.position ?? 'No position'}</span>
              </div>
            ))}
            {players.length === 0 && <p style={styles.empty}>No players yet.</p>}
          </div>

          <div style={{ flex: 1 }}>
            {!selectedPlayer && (
              <div style={styles.placeholder}>
                Select a player to view their stats
              </div>
            )}
            {selectedPlayer && <PlayerStatsPanel player={selectedPlayer} />}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  loading: { color: '#888', padding: '40px' },
  back: {
    background: 'none', border: 'none', color: '#F5C800',
    cursor: 'pointer', fontSize: '14px', marginBottom: '16px', padding: 0,
  },
  heading: { fontSize: '24px', color: '#f0f0f0', marginBottom: '4px' },
  division: { color: '#888', fontSize: '14px', marginBottom: '12px' },
  coaches: { display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' },
  coachTag: {
    background: '#1e1e1e', border: '1px solid #2a2a2a',
    color: '#ccc', padding: '4px 12px', borderRadius: '20px', fontSize: '13px',
  },
  sectionTitle: {
    fontSize: '12px', fontWeight: '600', color: '#F5C800',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px',
  },
  layout: { display: 'flex', gap: '20px', alignItems: 'flex-start' },
  playerList: { width: '240px', flexShrink: 0 },
  playerCard: {
    padding: '12px 14px', background: '#1a1a1a', borderRadius: '8px',
    border: '1px solid #2a2a2a', marginBottom: '8px', cursor: 'pointer',
  },
  playerCardActive: { border: '1px solid #F5C800', background: '#1a1a00' },
  playerCardMain: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' },
  playerName: { color: '#f0f0f0', fontWeight: '600', fontSize: '14px' },
  badge: {
    background: '#2a2a2a', color: '#888',
    padding: '1px 7px', borderRadius: '10px', fontSize: '11px',
  },
  captainBadge: {
    background: '#F5C800', color: '#111', padding: '1px 6px',
    borderRadius: '10px', fontSize: '10px', fontWeight: '700',
  },
  position: { color: '#666', fontSize: '12px' },
  placeholder: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '200px', color: '#555', fontSize: '14px',
    background: '#1a1a1a', borderRadius: '10px', border: '1px solid #2a2a2a',
  },
  statsPanel: {
    background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: '10px', padding: '16px', marginBottom: '8px',
  },
  playerHeader: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' },
  playerAvatar: {
    width: '44px', height: '44px', borderRadius: '50%', background: '#F5C800',
    color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: '700', fontSize: '18px', flexShrink: 0,
  },
  playerFullName: { color: '#f0f0f0', fontWeight: '700', fontSize: '16px' },
  playerMeta: { color: '#888', fontSize: '12px', marginTop: '2px' },
  msg: { fontSize: '12px', color: '#F5C800', marginBottom: '10px' },
  editSection: { marginBottom: '12px' },
  editBtn: {
    background: 'none', border: '1px solid #333', color: '#888',
    padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
  },
  editForm: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' },
  input: {
    padding: '8px 10px', borderRadius: '6px', border: '1px solid #333',
    background: '#2a2a2a', color: '#f0f0f0', fontSize: '13px',
  },
  saveBtn: {
    padding: '6px 14px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontSize: '12px', fontWeight: '600',
  },
  cancelBtn: {
    padding: '6px 14px', background: 'transparent', color: '#888',
    border: '1px solid #333', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
  },
  coachActions: { display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' },
  promoteBtn: {
    padding: '6px 12px', background: 'transparent', color: '#F5C800',
    border: '1px solid #F5C800', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
  },
  removeBtn: {
    padding: '6px 12px', background: 'transparent', color: '#e74c3c',
    border: '1px solid #e74c3c', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
  },
  statGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '6px', marginBottom: '8px',
  },
  statBox: {
    background: '#111', border: '1px solid #2a2a2a',
    borderRadius: '8px', padding: '8px 4px', textAlign: 'center',
  },
  statVal: { fontSize: '18px', fontWeight: '700', marginBottom: '3px' },
  statLabel: { fontSize: '9px', color: '#888', textTransform: 'uppercase' },
  empty: { color: '#555', fontSize: '13px' },
};

export default TeamDetail;