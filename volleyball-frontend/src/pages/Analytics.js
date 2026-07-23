import { useEffect, useState } from 'react';
import { getTeams, getTeamAnalytics, getTeamTrend } from '../api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, BarChart, Bar
} from 'recharts';

function StatCard({ label, value, unit = '', color = '#3498db' }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statValue}>
        <span style={{ color }}>{value}</span>
        <span style={styles.statUnit}>{unit}</span>
      </div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function Analytics() {
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [teamStats, setTeamStats] = useState(null);
  const [trend, setTrend] = useState([]);
  const [activePlayer, setActivePlayer] = useState(null);

  useEffect(() => {
    getTeams().then(res => setTeams(res.data));
  }, []);

  useEffect(() => {
    if (!selectedTeam) return;
    getTeamAnalytics(selectedTeam).then(res => {
      setTeamStats(res.data);
      setActivePlayer(null);
    });
    getTeamTrend(selectedTeam).then(res => setTrend(res.data));
  }, [selectedTeam]);

  const displayedPlayer = activePlayer
    ? teamStats?.players?.find(p => p.player_id === activePlayer)
    : null;

  return (
    <div>
      <h2 style={styles.heading}>Analytics</h2>

      <div style={styles.teamSelect}>
        <select style={styles.select} value={selectedTeam}
          onChange={e => setSelectedTeam(e.target.value)}>
          <option value="">Select a team</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {teamStats && (
        <>
          <h3 style={styles.sectionTitle}>Team overview</h3>
          <div style={styles.statRow}>
            <StatCard label="Attack efficiency" value={teamStats.team_attack_efficiency} unit="%" color="#2ecc71" />
            <StatCard label="Kill %" value={teamStats.team_kill_pct} unit="%" color="#3498db" />
            <StatCard label="Serve %" value={teamStats.team_serve_pct} unit="%" color="#9b59b6" />
            <StatCard label="Serve error rate" value={teamStats.team_serve_error_rate} unit="%" color="#e74c3c" />
          </div>

          {trend.length > 0 && (
            <>
              <h3 style={styles.sectionTitle}>Last {trend.length} matches</h3>
              <div style={styles.chartRow}>
                <div style={styles.chartCard}>
                  <div style={styles.chartTitle}>Attack efficiency</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} unit="%" />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Line type="monotone" dataKey="attack_efficiency"
                        stroke="#2ecc71" strokeWidth={2} dot={{ r: 4 }} name="Attack eff." />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={styles.chartCard}>
                  <div style={styles.chartTitle}>Serve error rate</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} unit="%" />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Line type="monotone" dataKey="serve_error_rate"
                        stroke="#e74c3c" strokeWidth={2} dot={{ r: 4 }} name="Serve errors" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={styles.chartCard}>
                <div style={styles.chartTitle}>Kill % per match</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} unit="%" />
                    <Tooltip formatter={(v) => `${v}%`}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.opponent ?? ''} />
                    <Bar dataKey="kill_pct" fill="#3498db" name="Kill %" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {trend.length === 0 && (
            <p style={styles.empty}>Complete some matches to see trend data.</p>
          )}

          <h3 style={styles.sectionTitle}>Player breakdown</h3>
          <div style={styles.playerGrid}>
            {teamStats.players.map(p => (
              <button key={p.player_id}
                style={{ ...styles.playerBtn, ...(activePlayer === p.player_id ? styles.playerBtnActive : {}) }}
                onClick={() => setActivePlayer(activePlayer === p.player_id ? null : p.player_id)}>
                <div style={styles.playerBtnName}>{p.name}</div>
                <div style={styles.playerBtnPos}>{p.position ?? 'Rec'}</div>
                <div style={styles.playerBtnStat}>{p.kill_pct}% kill</div>
              </button>
            ))}
          </div>

          {displayedPlayer && (
            <div style={styles.playerDetail}>
              <h4 style={{ marginBottom: '16px' }}>{displayedPlayer.name}</h4>
              <div style={styles.statRow}>
                <StatCard label="Kills" value={displayedPlayer.kills} color="#2ecc71" />
                <StatCard label="Errors" value={displayedPlayer.errors} color="#e74c3c" />
                <StatCard label="Aces" value={displayedPlayer.aces} color="#3498db" />
                <StatCard label="Blocks" value={displayedPlayer.blocks} color="#1abc9c" />
                <StatCard label="Digs" value={displayedPlayer.digs} color="#9b59b6" />
                <StatCard label="Assists" value={displayedPlayer.assists} color="#e67e22" />
              </div>
              <div style={{ ...styles.statRow, marginTop: '12px' }}>
                <StatCard label="Kill %" value={displayedPlayer.kill_pct} unit="%" color="#2ecc71" />
                <StatCard label="Serve %" value={displayedPlayer.serve_pct} unit="%" color="#3498db" />
                <StatCard label="Attack efficiency" value={displayedPlayer.attack_efficiency} unit="%" color="#9b59b6" />
              </div>
            </div>
          )}
        </>
      )}

      {!selectedTeam && (
        <p style={styles.empty}>Select a team above to see analytics.</p>
      )}
    </div>
  );
}

const styles = {
  heading: { marginBottom: '24px', fontSize: '24px' },
  teamSelect: { marginBottom: '28px' },
  select: { padding: '10px 14px', borderRadius: '8px', border: '1px solid #ddd',
    fontSize: '15px', minWidth: '240px' },
  sectionTitle: { fontSize: '16px', fontWeight: '600', marginBottom: '14px', marginTop: '28px' },
  statRow: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' },
  statCard: { background: 'white', border: '1px solid #eee', borderRadius: '10px',
    padding: '16px 20px', minWidth: '130px', flex: 1,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  statValue: { fontSize: '28px', fontWeight: '700', lineHeight: 1, marginBottom: '6px' },
  statUnit: { fontSize: '16px', fontWeight: '400', color: '#aaa' },
  statLabel: { fontSize: '13px', color: '#888' },
  chartRow: { display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' },
  chartCard: { flex: 1, minWidth: '280px', background: 'white', border: '1px solid #eee',
    borderRadius: '10px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    marginBottom: '16px' },
  chartTitle: { fontSize: '14px', fontWeight: '500', marginBottom: '12px', color: '#444' },
  playerGrid: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' },
  playerBtn: { padding: '12px 16px', background: 'white', border: '1px solid #eee',
    borderRadius: '10px', cursor: 'pointer', textAlign: 'left', minWidth: '130px' },
  playerBtnActive: { background: '#f0f4ff', border: '1px solid #3498db' },
  playerBtnName: { fontWeight: '600', fontSize: '14px', marginBottom: '2px' },
  playerBtnPos: { fontSize: '12px', color: '#888', marginBottom: '6px' },
  playerBtnStat: { fontSize: '13px', color: '#3498db', fontWeight: '500' },
  playerDetail: { background: 'white', border: '1px solid #eee', borderRadius: '10px',
    padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  empty: { color: '#aaa', fontSize: '14px', marginTop: '12px' },
};

export default Analytics;