import { useEffect, useState } from 'react';
import { getPlayers, getTeams, getPlayerAnalytics,
         createPlayer, getPlayerMatchHistory } from '../api';
import { getRole } from '../auth';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const POSITIONS = [
  "Setter", "Outside Hitter", "Opposite",
  "Middle Blocker", "Libero"
];

const DIVISIONS = [
  "Men's Premier", "Men's Div 1", "Men's Div 2", "Men's Div 3",
  "Women's Premier", "Women's Div 1", "Women's Div 2", "Women's Div 3"
];

function Players() {
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [playerHistory, setPlayerHistory] = useState([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', jersey_number: '', position: '',
    team_id: '', is_recreational: false
  });
  const [error, setError] = useState('');
  const role = getRole();
  const isAdmin = role === 'admin';

  const load = () => {
    getPlayers().then(res => setPlayers(res.data));
    getTeams().then(res => setTeams(res.data));
  };

  useEffect(() => { load(); }, []);

  const teamName = (id) => teams.find(t => t.id === id)?.name ?? 'No team';

  const filtered = filter === 'all' ? players
    : filter === 'competitive' ? players.filter(p => !p.is_recreational)
    : players.filter(p => p.is_recreational);

  const handleSelectPlayer = async (player) => {
    if (selectedPlayer?.id === player.id) {
      setSelectedPlayer(null);
      setPlayerStats(null);
      setPlayerHistory([]);
      return;
    }
    setSelectedPlayer(player);
    setPlayerStats(null);
    setPlayerHistory([]);
    setStatsLoading(true);
    try {
      const [statsRes, histRes] = await Promise.all([
        getPlayerAnalytics(player.id),
        getPlayerMatchHistory(player.id),
      ]);
      setPlayerStats(statsRes.data);
      setPlayerHistory(histRes.data);
    } catch {
      setPlayerStats(null);
      setPlayerHistory([]);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleCreate = async () => {
    setError('');
    if (!form.name) { setError('Name is required.'); return; }
    if (!form.team_id) { setError('Team is required.'); return; }
    try {
      await createPlayer({
        name: form.name,
        jersey_number: form.jersey_number
          ? parseInt(form.jersey_number) : null,
        position: form.position || null,
        team_id: parseInt(form.team_id),
        is_recreational: form.is_recreational,
      });
      setForm({
        name: '', jersey_number: '', position: '',
        team_id: '', is_recreational: false
      });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong.');
    }
  };

  const tooltipStyle = {
    contentStyle: {
      background: '#1e1e1e', border: '1px solid #333', borderRadius: '8px',
    },
    labelStyle: { color: '#888', fontSize: '11px' },
    itemStyle: { fontSize: '12px' },
  };

  return (
    <div>
      <h2 style={styles.heading}>Players</h2>

      {isAdmin && (
        <div style={styles.card}>
          <h3 style={styles.subheading}>Add a player</h3>
          <div style={styles.formRow}>
            <input
              style={styles.input}
              placeholder="Full name"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
            <input
              style={styles.input}
              placeholder="Jersey number"
              type="number"
              value={form.jersey_number}
              onChange={e => setForm({ ...form, jersey_number: e.target.value })}
            />
            <select
              style={styles.input}
              value={form.position}
              onChange={e => setForm({ ...form, position: e.target.value })}>
              <option value="">Position (optional)</option>
              {POSITIONS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              style={{ ...styles.input, borderColor: !form.team_id ? '#e74c3c' : '#333' }}
              value={form.team_id}
              onChange={e => setForm({ ...form, team_id: e.target.value })}>
              <option value="">Select team *</option>
              {DIVISIONS.map(div => {
                const divTeams = teams.filter(t => t.division === div);
                if (!divTeams.length) return null;
                return (
                  <optgroup key={div} label={div}>
                    {divTeams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            <label style={styles.checkbox}>
              <input
                type="checkbox"
                checked={form.is_recreational}
                onChange={e => setForm({
                  ...form, is_recreational: e.target.checked
                })}
              />
              Recreational
            </label>
            <button style={styles.button} onClick={handleCreate}>
              Add
            </button>
          </div>
          {error && <p style={styles.error}>{error}</p>}
        </div>
      )}

      <div style={styles.filterRow}>
        {['all', 'competitive', 'recreational'].map(f => (
          <button key={f}
            style={{
              ...styles.filterBtn,
              ...(filter === f ? styles.filterActive : {})
            }}
            onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div style={styles.layout}>
        <div style={styles.list}>
          {filtered.map(player => (
            <div
              key={player.id}
              style={{
                ...styles.playerCard,
                ...(selectedPlayer?.id === player.id
                  ? styles.playerCardActive : {})
              }}
              onClick={() => handleSelectPlayer(player)}>
              <div style={styles.playerMain}>
                <strong style={styles.playerName}>{player.name}</strong>
                {player.jersey_number && (
                  <span style={styles.badge}>#{player.jersey_number}</span>
                )}
                {player.is_recreational && (
                  <span style={styles.recBadge}>Rec</span>
                )}
              </div>
              <div style={styles.playerMeta}>
                {player.position ? `${player.position} · ` : ''}
                {teamName(player.team_id)}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p style={styles.empty}>No players yet.</p>
          )}
        </div>

        {selectedPlayer && (
          <div style={styles.statsPanel}>
            <div style={styles.statsHeader}>
              <div style={styles.statsAvatar}>
                {selectedPlayer.name[0].toUpperCase()}
              </div>
              <div>
                <div style={styles.statsName}>{selectedPlayer.name}</div>
                <div style={styles.statsMeta}>
                  {selectedPlayer.position ?? 'No position'}
                  {selectedPlayer.jersey_number
                    ? ` · #${selectedPlayer.jersey_number}` : ''}
                </div>
                <div style={styles.statsTeam}>
                  {teamName(selectedPlayer.team_id)}
                </div>
              </div>
            </div>

            {statsLoading && <p style={styles.empty}>Loading stats...</p>}

            {!statsLoading && playerStats && (
              <>
                <div style={styles.statGrid}>
                  {[
                    { label: 'Kills', value: playerStats.kills, color: '#2ecc71' },
                    { label: 'Aces', value: playerStats.aces, color: '#3498db' },
                    { label: 'Blocks', value: playerStats.blocks, color: '#9b59b6' },
                    { label: 'Digs', value: playerStats.digs, color: '#1abc9c' },
                    { label: 'Assists', value: playerStats.assists, color: '#e67e22' },
                  ].map(s => (
                    <div key={s.label} style={styles.statBox}>
                      <div style={{ ...styles.statVal, color: s.color }}>
                        {s.value}
                      </div>
                      <div style={styles.statLabel}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{
                  ...styles.statGrid,
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  marginBottom: '20px'
                }}>
                  {[
                    { label: 'Kill %', value: `${playerStats.kill_pct}%` },
                    { label: 'Serve %', value: `${playerStats.serve_pct}%` },
                    { label: 'Atk eff.', value: `${playerStats.attack_efficiency}%` },
                  ].map(s => (
                    <div key={s.label} style={styles.statBox}>
                      <div style={{ ...styles.statVal, color: '#F5C800' }}>
                        {s.value}
                      </div>
                      <div style={styles.statLabel}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {playerHistory.length > 1 && (
                  <>
                    <div style={styles.chartTitle}>Kill % over time</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={[...playerHistory].reverse()}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                        <XAxis dataKey="date"
                          tick={{ fontSize: 10, fill: '#888' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#888' }} unit="%" />
                        <Tooltip {...tooltipStyle} />
                        <Line type="monotone" dataKey="kill_pct"
                          stroke="#F5C800" strokeWidth={2}
                          dot={{ r: 3, fill: '#F5C800' }} name="Kill %" />
                      </LineChart>
                    </ResponsiveContainer>

                    <div style={styles.chartRow}>
                      <div style={{ flex: 1 }}>
                        <div style={styles.chartTitle}>Kills per match</div>
                        <ResponsiveContainer width="100%" height={130}>
                          <BarChart data={[...playerHistory].reverse()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                            <XAxis dataKey="date"
                              tick={{ fontSize: 9, fill: '#888' }} />
                            <YAxis tick={{ fontSize: 9, fill: '#888' }} />
                            <Tooltip {...tooltipStyle}
                              cursor={{ fill: '#2a2a2a' }} />
                            <Bar dataKey="kills" fill="#2ecc71"
                              radius={[3, 3, 0, 0]} name="Kills" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={styles.chartTitle}>Blocks & digs</div>
                        <ResponsiveContainer width="100%" height={130}>
                          <BarChart data={[...playerHistory].reverse()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                            <XAxis dataKey="date"
                              tick={{ fontSize: 9, fill: '#888' }} />
                            <YAxis tick={{ fontSize: 9, fill: '#888' }} />
                            <Tooltip {...tooltipStyle}
                              cursor={{ fill: '#2a2a2a' }} />
                            <Bar dataKey="blocks" fill="#9b59b6"
                              radius={[3, 3, 0, 0]} name="Blocks" />
                            <Bar dataKey="digs" fill="#1abc9c"
                              radius={[3, 3, 0, 0]} name="Digs" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </>
                )}

                {playerHistory.length > 0 && (
                  <>
                    <div style={{ ...styles.chartTitle, marginTop: '16px' }}>
                      Match history
                    </div>
                    <div style={styles.histTable}>
                      <div style={styles.histHeader}>
                        <span>Date</span>
                        <span>Result</span>
                        <span>K</span>
                        <span>A</span>
                        <span>B</span>
                        <span>D</span>
                        <span>K%</span>
                      </div>
                      {playerHistory.map(h => (
                        <div key={h.match_id} style={styles.histRow}>
                          <span style={{ color: '#888' }}>{h.date}</span>
                          <span style={{ fontWeight: '600' }}>{h.result}</span>
                          <span>{h.kills}</span>
                          <span>{h.aces}</span>
                          <span>{h.blocks}</span>
                          <span>{h.digs}</span>
                          <span style={{ color: '#F5C800' }}>
                            {h.kill_pct}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {!statsLoading && !playerStats && (
              <p style={styles.empty}>No stats yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  heading: { marginBottom: '24px', fontSize: '24px', color: '#f0f0f0' },
  subheading: {
    marginBottom: '12px', fontSize: '16px',
    fontWeight: '500', color: '#ccc',
  },
  card: {
    background: '#1e1e1e', padding: '20px', borderRadius: '10px',
    marginBottom: '24px', border: '1px solid #2a2a2a',
  },
  formRow: {
    display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center',
  },
  input: {
    padding: '8px 12px', borderRadius: '6px', border: '1px solid #333',
    fontSize: '14px', flex: '1', minWidth: '140px',
    background: '#2a2a2a', color: '#f0f0f0',
  },
  checkbox: {
    display: 'flex', alignItems: 'center', gap: '6px',
    fontSize: '14px', cursor: 'pointer', color: '#ccc',
  },
  button: {
    padding: '8px 20px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontSize: '14px', fontWeight: '600',
  },
  error: { color: '#ff6b6b', marginTop: '8px', fontSize: '14px' },
  filterRow: { display: 'flex', gap: '8px', marginBottom: '20px' },
  filterBtn: {
    padding: '6px 16px', borderRadius: '20px', border: '1px solid #333',
    background: '#1a1a1a', cursor: 'pointer', fontSize: '13px', color: '#ccc',
  },
  filterActive: {
    background: '#F5C800', color: '#111',
    border: '1px solid #F5C800', fontWeight: '600',
  },
  layout: { display: 'flex', gap: '20px', alignItems: 'flex-start' },
  list: {
    display: 'flex', flexDirection: 'column',
    gap: '8px', width: '280px', flexShrink: 0,
  },
  playerCard: {
    padding: '14px 16px', background: '#1a1a1a', borderRadius: '8px',
    border: '1px solid #2a2a2a', cursor: 'pointer',
  },
  playerCardActive: { border: '1px solid #F5C800', background: '#1a1a00' },
  playerMain: {
    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px',
  },
  playerName: { color: '#f0f0f0', fontSize: '14px' },
  badge: {
    background: '#2a2a2a', color: '#888',
    padding: '1px 7px', borderRadius: '10px', fontSize: '11px',
  },
  recBadge: {
    background: '#1a3a1a', color: '#4caf50',
    padding: '1px 7px', borderRadius: '10px', fontSize: '11px',
  },
  playerMeta: { color: '#666', fontSize: '12px' },
  statsPanel: {
    flex: 1, background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: '10px', padding: '20px', minWidth: 0,
  },
  statsHeader: {
    display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '20px',
  },
  statsAvatar: {
    width: '48px', height: '48px', borderRadius: '50%', background: '#F5C800',
    color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '20px', fontWeight: '700', flexShrink: 0,
  },
  statsName: {
    fontSize: '18px', fontWeight: '700', color: '#f0f0f0', marginBottom: '2px',
  },
  statsMeta: { fontSize: '13px', color: '#888' },
  statsTeam: {
    fontSize: '12px', color: '#F5C800', marginTop: '4px',
    background: '#1a1a00', display: 'inline-block',
    padding: '2px 8px', borderRadius: '10px', border: '1px solid #3a3a00',
  },
  statGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '8px', marginBottom: '10px',
  },
  statBox: {
    background: '#111', border: '1px solid #2a2a2a',
    borderRadius: '8px', padding: '10px', textAlign: 'center',
  },
  statVal: { fontSize: '20px', fontWeight: '700', marginBottom: '4px' },
  statLabel: { fontSize: '10px', color: '#888', textTransform: 'uppercase' },
  chartTitle: {
    fontSize: '11px', color: '#888', textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: '8px', marginTop: '14px',
  },
  chartRow: { display: 'flex', gap: '12px', marginTop: '10px' },
  histTable: {
    background: '#111', border: '1px solid #2a2a2a',
    borderRadius: '8px', overflow: 'hidden',
  },
  histHeader: {
    display: 'grid', gridTemplateColumns: '1.2fr 0.8fr repeat(5, 0.6fr)',
    padding: '8px 12px', background: '#1e1e1e', fontSize: '10px',
    fontWeight: '600', color: '#F5C800', textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  histRow: {
    display: 'grid', gridTemplateColumns: '1.2fr 0.8fr repeat(5, 0.6fr)',
    padding: '8px 12px', fontSize: '12px',
    borderTop: '1px solid #1e1e1e', color: '#ccc',
  },
  empty: { color: '#555', fontSize: '14px' },
};

export default Players;