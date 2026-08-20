import { useEffect, useState } from 'react';
import { getTeams, getTeamAnalytics, getTeamTrend, getPlayerAnalytics,
         getPlayerMatchHistory, getTopPerformers, getMatchCount } from '../api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from 'recharts';

function StatCard({ label, value, unit = '', color = '#F5C800' }) {
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

function TopPerformerBadge({ label, name, value, unit = '' }) {
  if (!name) return null;
  return (
    <div style={styles.topCard}>
      <div style={styles.topLabel}>{label}</div>
      <div style={styles.topName}>{name}</div>
      <div style={styles.topValue}>{value}{unit}</div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={styles.tooltip}>
        <div style={styles.tooltipLabel}>{label}</div>
        {payload.map(p => (
          <div key={p.name} style={{ color: p.color, fontSize: '12px' }}>
            {p.name}: {p.value}{p.unit ?? ''}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

function Analytics() {
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [teamStats, setTeamStats] = useState(null);
  const [trend, setTrend] = useState([]);
  const [topPerformers, setTopPerformers] = useState(null);
  const [matchCount, setMatchCount] = useState(0);
  const [lastN, setLastN] = useState('all');
  const [activePlayer, setActivePlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [playerHistory, setPlayerHistory] = useState([]);
  const [view, setView] = useState('team');
  const [mobile, setMobile] = useState(window.innerWidth <= 600);

  useEffect(() => {
    const handleResize = () => setMobile(window.innerWidth <= 600);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    getTeams().then(res => setTeams(res.data));
  }, []);

  useEffect(() => {
    if (!selectedTeam) return;
    const n = lastN === 'all' ? null : parseInt(lastN);
    getTeamAnalytics(selectedTeam, n ? `?last_n=${n}` : '')
      .then(res => setTeamStats(res.data));
    getTeamTrend(selectedTeam, lastN === 'all' ? 99 : parseInt(lastN))
      .then(res => setTrend(res.data));
    getTopPerformers(selectedTeam).then(res => setTopPerformers(res.data));
    getMatchCount(selectedTeam).then(res => setMatchCount(res.data.count));
    setActivePlayer(null);
    setPlayerStats(null);
    setPlayerHistory([]);
  }, [selectedTeam, lastN]);

  useEffect(() => {
    if (!activePlayer) return;
    const n = lastN === 'all' ? undefined : parseInt(lastN);
    getPlayerAnalytics(activePlayer.player_id, n).then(res => setPlayerStats(res.data));
    getPlayerMatchHistory(activePlayer.player_id)
      .then(res => setPlayerHistory(
        res.data.slice(0, lastN === 'all' ? 999 : parseInt(lastN))
      ));
  }, [activePlayer, lastN]);

  const chartH = mobile ? 160 : 200;

  return (
    <div>
      <h2 style={styles.heading}>Analytics</h2>

      <div style={styles.controls}>
        <select style={styles.select} value={selectedTeam}
          onChange={e => {
            setSelectedTeam(e.target.value);
            setView('team');
            setActivePlayer(null);
          }}>
          <option value="">Select a team</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        {selectedTeam && matchCount > 0 && (
          <select style={styles.select} value={lastN}
            onChange={e => setLastN(e.target.value)}>
            <option value="all">All matches ({matchCount})</option>
            {Array.from({ length: matchCount }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>Last {n} match{n !== 1 ? 'es' : ''}</option>
            ))}
          </select>
        )}

        {selectedTeam && (
          <div style={styles.viewToggle}>
            <button
              style={{ ...styles.toggleBtn, ...(view === 'team' ? styles.toggleActive : {}) }}
              onClick={() => { setView('team'); setActivePlayer(null); }}>
              Team
            </button>
            <button
              style={{ ...styles.toggleBtn, ...(view === 'player' ? styles.toggleActive : {}) }}
              onClick={() => setView('player')}>
              Player
            </button>
          </div>
        )}
      </div>

      {!selectedTeam && (
        <p style={styles.empty}>Select a team to view analytics.</p>
      )}

      {selectedTeam && view === 'team' && teamStats && (
        <>
          <h3 style={styles.sectionTitle}>Team overview</h3>
          <div style={styles.statRow}>
            <StatCard label="Kill %" value={teamStats.team_kill_pct} unit="%" />
            <StatCard label="Kill block %" value={teamStats.team_kill_block_pct} unit="%" color="#9b59b6" />
            <StatCard label="Serve %" value={teamStats.team_serve_pct} unit="%" color="#3498db" />
            <StatCard label="Serve error rate" value={teamStats.team_serve_error_rate} unit="%" color="#e74c3c" />
          </div>

          {topPerformers && Object.values(topPerformers).some(v => v) && (
            <>
              <h3 style={styles.sectionTitle}>Top performers</h3>
              <div style={styles.topRow}>
                <TopPerformerBadge label="Most kills" name={topPerformers.most_kills?.name} value={topPerformers.most_kills?.value} />
                <TopPerformerBadge label="Most blocks" name={topPerformers.most_blocks?.name} value={topPerformers.most_blocks?.value} />
                <TopPerformerBadge label="Most digs" name={topPerformers.most_digs?.name} value={topPerformers.most_digs?.value} />
                <TopPerformerBadge label="Most aces" name={topPerformers.most_aces?.name} value={topPerformers.most_aces?.value} />
                <TopPerformerBadge label="Best kill %" name={topPerformers.highest_kill_pct?.name} value={topPerformers.highest_kill_pct?.value} unit="%" />
              </div>
            </>
          )}

          {trend.length > 1 && (
            <>
              <h3 style={styles.sectionTitle}>Trends — last {trend.length} matches</h3>
              <div style={mobile ? styles.chartColStack : styles.chartRow}>
                <div style={styles.chartCard}>
                  <div style={styles.chartTitle}>Kill % per match</div>
                  <ResponsiveContainer width="100%" height={chartH}>
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#888' }} unit="%" width={30} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="kill_pct"
                        stroke="#F5C800" strokeWidth={2}
                        dot={{ r: 3, fill: '#F5C800' }} name="Kill %" unit="%" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div style={styles.chartCard}>
                  <div style={styles.chartTitle}>Serve error rate</div>
                  <ResponsiveContainer width="100%" height={chartH}>
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#888' }} unit="%" width={30} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="serve_error_rate"
                        stroke="#e74c3c" strokeWidth={2}
                        dot={{ r: 3, fill: '#e74c3c' }} name="Serve errors" unit="%" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {trend.length <= 1 && (
            <p style={styles.empty}>Complete more matches to see trend charts.</p>
          )}
        </>
      )}

      {selectedTeam && view === 'player' && teamStats && (
        <>
          <h3 style={styles.sectionTitle}>Select a player</h3>
          <div style={styles.playerGrid}>
            {teamStats.players.map(p => (
              <button key={p.player_id}
                style={{
                  ...styles.playerBtn,
                  ...(activePlayer?.player_id === p.player_id ? styles.playerBtnActive : {})
                }}
                onClick={() => setActivePlayer(
                  activePlayer?.player_id === p.player_id ? null : p
                )}>
                <div style={styles.playerBtnName}>{p.name}</div>
                <div style={styles.playerBtnPos}>{p.position ?? 'Rec'}</div>
                <div style={styles.playerBtnStat}>{p.kill_pct}% kill</div>
              </button>
            ))}
          </div>

          {playerStats && activePlayer && (
            <>
              <h3 style={styles.sectionTitle}>{playerStats.name}</h3>
              <div style={styles.statRow}>
                <StatCard label="Kill %" value={playerStats.kill_pct} unit="%" />
                <StatCard label="Serve %" value={playerStats.serve_pct} unit="%" color="#3498db" />
                <StatCard label="Serve errors" value={playerStats.serve_error_rate} unit="%" color="#e74c3c" />
              </div>
              <div style={styles.statRow}>
                <StatCard label="Kills" value={playerStats.kills} color="#2ecc71" />
                <StatCard label="Kill blocks" value={playerStats.kill_blocks ?? 0} color="#9b59b6" />
                <StatCard label="Aces" value={playerStats.aces} color="#3498db" />
                <StatCard label="Blocks" value={playerStats.blocks} color="#e67e22" />
                <StatCard label="Digs" value={playerStats.digs} color="#1abc9c" />
              </div>

              {playerHistory.length > 1 && (
                <>
                  <h3 style={styles.sectionTitle}>Performance over time</h3>
                  <div style={styles.chartCard}>
                    <div style={styles.chartTitle}>Kill % over time</div>
                    <ResponsiveContainer width="100%" height={chartH}>
                      <LineChart data={[...playerHistory].reverse()}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#888' }} unit="%" width={30} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="kill_pct"
                          stroke="#F5C800" strokeWidth={2}
                          dot={{ r: 3, fill: '#F5C800' }} name="Kill %" unit="%" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={mobile ? styles.chartColStack : styles.chartRow}>
                    <div style={styles.chartCard}>
                      <div style={styles.chartTitle}>Kills per match</div>
                      <ResponsiveContainer width="100%" height={mobile ? 140 : 180}>
                        <BarChart data={[...playerHistory].reverse()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#888' }} />
                          <YAxis tick={{ fontSize: 9, fill: '#888' }} width={20} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#2a2a2a' }} />
                          <Bar dataKey="kills" name="Kills" radius={[4,4,0,0]} fill="#2ecc71" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={styles.chartCard}>
                      <div style={styles.chartTitle}>Blocks & digs</div>
                      <ResponsiveContainer width="100%" height={mobile ? 140 : 180}>
                        <BarChart data={[...playerHistory].reverse()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#888' }} />
                          <YAxis tick={{ fontSize: 9, fill: '#888' }} width={20} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#2a2a2a' }} />
                          <Bar dataKey="blocks" name="Blocks" radius={[4,4,0,0]} fill="#9b59b6" fillOpacity={0.8} />
                          <Bar dataKey="digs" name="Digs" radius={[4,4,0,0]} fill="#1abc9c" fillOpacity={0.8} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}

              {playerHistory.length > 0 && (
                <>
                  <h3 style={styles.sectionTitle}>Match history</h3>
                  <div style={styles.table}>
                    <div style={styles.tableHeader}>
                      <span>Date</span>
                      <span>Res</span>
                      <span>K</span>
                      <span>KB</span>
                      <span>A</span>
                      <span>B</span>
                      <span>D</span>
                      <span>K%</span>
                    </div>
                    {playerHistory.map(h => (
                      <div key={h.match_id} style={styles.tableRow}>
                        <span style={{ color: '#888' }}>{h.date}</span>
                        <span style={{ fontWeight: '600' }}>{h.result}</span>
                        <span>{h.kills}</span>
                        <span>{h.kill_blocks ?? 0}</span>
                        <span>{h.aces}</span>
                        <span>{h.blocks}</span>
                        <span>{h.digs}</span>
                        <span style={{ color: '#F5C800' }}>{h.kill_pct}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {!activePlayer && (
            <p style={styles.empty}>Select a player above to view their stats.</p>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  heading: { marginBottom: '20px', fontSize: '22px', color: '#f0f0f0' },
  controls: { display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' },
  select: {
    padding: '9px 12px', borderRadius: '8px', border: '1px solid #333',
    fontSize: '14px', background: '#2a2a2a', color: '#f0f0f0',
    flex: '1', minWidth: '140px',
  },
  viewToggle: { display: 'flex', border: '1px solid #333', borderRadius: '8px', overflow: 'hidden' },
  toggleBtn: {
    padding: '8px 18px', border: 'none', background: '#1a1a1a',
    color: '#888', cursor: 'pointer', fontSize: '14px',
  },
  toggleActive: { background: '#F5C800', color: '#111', fontWeight: '600' },
  sectionTitle: {
    fontSize: '13px', fontWeight: '600', color: '#F5C800',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    marginBottom: '12px', marginTop: '24px',
  },
  statRow: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' },
  statCard: {
    background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px',
    padding: '14px 16px', minWidth: '80px', flex: 1,
  },
  statValue: { fontSize: '24px', fontWeight: '700', lineHeight: 1, marginBottom: '6px' },
  statUnit: { fontSize: '14px', fontWeight: '400', color: '#555' },
  statLabel: { fontSize: '11px', color: '#888' },
  topRow: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' },
  topCard: {
    background: '#1a1a00', border: '1px solid #3a3a00', borderRadius: '10px',
    padding: '12px 14px', minWidth: '100px', flex: 1,
  },
  topLabel: { fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' },
  topName: { fontSize: '14px', fontWeight: '700', color: '#f0f0f0', marginBottom: '2px' },
  topValue: { fontSize: '13px', color: '#F5C800', fontWeight: '600' },
  chartRow: { display: 'flex', gap: '12px', marginBottom: '0', flexWrap: 'wrap' },
  chartColStack: { display: 'flex', flexDirection: 'column', gap: '12px' },
  chartCard: {
    flex: 1, minWidth: '200px', background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: '10px', padding: '14px', marginBottom: '12px',
  },
  chartTitle: { fontSize: '12px', fontWeight: '500', marginBottom: '10px', color: '#888' },
  tooltip: {
    background: '#1e1e1e', border: '1px solid #333', borderRadius: '8px',
    padding: '8px 12px', fontSize: '12px',
  },
  tooltipLabel: { color: '#888', marginBottom: '4px', fontSize: '11px' },
  playerGrid: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' },
  playerBtn: {
    padding: '10px 14px', background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: '10px', cursor: 'pointer', textAlign: 'left', minWidth: '110px',
  },
  playerBtnActive: { background: '#1a1a00', border: '1px solid #F5C800' },
  playerBtnName: { fontWeight: '600', fontSize: '13px', marginBottom: '2px', color: '#f0f0f0' },
  playerBtnPos: { fontSize: '11px', color: '#888', marginBottom: '4px' },
  playerBtnStat: { fontSize: '12px', color: '#F5C800', fontWeight: '500' },
  table: {
    background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: '10px', overflow: 'hidden', marginBottom: '16px',
  },
  tableHeader: {
    display: 'grid', gridTemplateColumns: '1.2fr 0.7fr repeat(6, 0.5fr)',
    padding: '8px 12px', background: '#1e1e1e', fontSize: '10px',
    fontWeight: '600', color: '#F5C800', textTransform: 'uppercase',
  },
  tableRow: {
    display: 'grid', gridTemplateColumns: '1.2fr 0.7fr repeat(6, 0.5fr)',
    padding: '8px 12px', fontSize: '12px',
    borderTop: '1px solid #222', color: '#ccc',
  },
  empty: { color: '#555', fontSize: '14px', marginTop: '12px' },
};

export default Analytics;