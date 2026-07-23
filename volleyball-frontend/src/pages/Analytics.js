import { useEffect, useState } from 'react';
import { getTeams, getTeamAnalytics, getTeamTrend, getPlayerAnalytics,
         getPlayerMatchHistory, getTopPerformers, getMatchCount } from '../api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell
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
          <div key={p.name} style={{ color: p.color, fontSize: '13px' }}>
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
  const [view, setView] = useState('team'); // 'team' or 'player'

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
    getMatchCount(selectedTeam).then(res => {
      setMatchCount(res.data.count);
    });
    setActivePlayer(null);
    setPlayerStats(null);
    setPlayerHistory([]);
  }, [selectedTeam, lastN]);

  useEffect(() => {
    if (!activePlayer) return;
    const n = lastN === 'all' ? undefined : parseInt(lastN);
    getPlayerAnalytics(activePlayer.player_id, n)
      .then(res => setPlayerStats(res.data));
    getPlayerMatchHistory(activePlayer.player_id)
      .then(res => setPlayerHistory(res.data.slice(0, lastN === 'all' ? 999 : parseInt(lastN))));
  }, [activePlayer, lastN]);

  const matchOptions = [];
  for (let i = 1; i <= matchCount; i++) {
    matchOptions.push(i);
  }

  return (
    <div>
      <h2 style={styles.heading}>Analytics</h2>

      <div style={styles.controls}>
        <select style={styles.select} value={selectedTeam}
          onChange={e => { setSelectedTeam(e.target.value); setView('team'); setActivePlayer(null); }}>
          <option value="">Select a team</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        {selectedTeam && matchCount > 0 && (
          <select style={styles.select} value={lastN}
            onChange={e => setLastN(e.target.value)}>
            <option value="all">All matches ({matchCount})</option>
            {matchOptions.slice(0, matchCount).map(n => (
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
            <StatCard label="Attack efficiency"
              value={teamStats.team_attack_efficiency} unit="%" />
            <StatCard label="Kill %" value={teamStats.team_kill_pct} unit="%" />
            <StatCard label="Serve %" value={teamStats.team_serve_pct} unit="%" />
            <StatCard label="Serve error rate"
              value={teamStats.team_serve_error_rate} unit="%" color="#e74c3c" />
          </div>

          {topPerformers && Object.values(topPerformers).some(v => v) && (
            <>
              <h3 style={styles.sectionTitle}>Top performers this season</h3>
              <div style={styles.topRow}>
                <TopPerformerBadge label="Most kills"
                  name={topPerformers.most_kills?.name}
                  value={topPerformers.most_kills?.value} />
                <TopPerformerBadge label="Most blocks"
                  name={topPerformers.most_blocks?.name}
                  value={topPerformers.most_blocks?.value} />
                <TopPerformerBadge label="Most digs"
                  name={topPerformers.most_digs?.name}
                  value={topPerformers.most_digs?.value} />
                <TopPerformerBadge label="Most aces"
                  name={topPerformers.most_aces?.name}
                  value={topPerformers.most_aces?.value} />
                <TopPerformerBadge label="Best kill %"
                  name={topPerformers.highest_kill_pct?.name}
                  value={topPerformers.highest_kill_pct?.value} unit="%" />
                <TopPerformerBadge label="Best attack eff."
                  name={topPerformers.highest_attack_efficiency?.name}
                  value={topPerformers.highest_attack_efficiency?.value} unit="%" />
              </div>
            </>
          )}

          {trend.length > 1 && (
            <>
              <h3 style={styles.sectionTitle}>
                Trends — last {trend.length} match{trend.length !== 1 ? 'es' : ''}
              </h3>
              <div style={styles.chartRow}>
                <div style={styles.chartCard}>
                  <div style={styles.chartTitle}>Attack efficiency</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#888' }} unit="%" />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="attack_efficiency"
                        stroke="#F5C800" strokeWidth={2} dot={{ r: 4, fill: '#F5C800' }}
                        name="Attack eff." unit="%" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={styles.chartCard}>
                  <div style={styles.chartTitle}>Serve error rate</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#888' }} unit="%" />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="serve_error_rate"
                        stroke="#e74c3c" strokeWidth={2} dot={{ r: 4, fill: '#e74c3c' }}
                        name="Serve errors" unit="%" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={styles.chartCard}>
                <div style={styles.chartTitle}>Kill % per match</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#888' }} unit="%" />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: '#2a2a2a' }} />
                    <Bar dataKey="kill_pct" name="Kill %" unit="%" radius={[4, 4, 0, 0]}>
                      {trend.map((_, i) => (
                        <Cell key={i} fill={i === trend.length - 1 ? '#F5C800' : '#3a3a00'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
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
                <StatCard label="Serve %" value={playerStats.serve_pct} unit="%" />
                <StatCard label="Attack eff."
                  value={playerStats.attack_efficiency} unit="%" />
              </div>
              <div style={styles.statRow}>
                <StatCard label="Kills" value={playerStats.kills} color="#2ecc71" />
                <StatCard label="Aces" value={playerStats.aces} color="#3498db" />
                <StatCard label="Blocks" value={playerStats.blocks} color="#9b59b6" />
                <StatCard label="Digs" value={playerStats.digs} color="#1abc9c" />
                <StatCard label="Assists" value={playerStats.assists} color="#e67e22" />
              </div>

              {playerHistory.length > 1 && (
                <>
                  <h3 style={styles.sectionTitle}>Performance per match</h3>
                  <div style={styles.chartCard}>
                    <div style={styles.chartTitle}>Kill % over time</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={[...playerHistory].reverse()}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#888' }} unit="%" />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="kill_pct"
                          stroke="#F5C800" strokeWidth={2}
                          dot={{ r: 4, fill: '#F5C800' }} name="Kill %" unit="%" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={styles.chartRow}>
                    <div style={styles.chartCard}>
                      <div style={styles.chartTitle}>Kills per match</div>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={[...playerHistory].reverse()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#888' }} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#2a2a2a' }} />
                          <Bar dataKey="kills" name="Kills" radius={[4, 4, 0, 0]}>
                            {playerHistory.map((_, i) => (
                              <Cell key={i} fill="#2ecc71" fillOpacity={0.7 + i * 0.05} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div style={styles.chartCard}>
                      <div style={styles.chartTitle}>Blocks & digs per match</div>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={[...playerHistory].reverse()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#888' }} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#2a2a2a' }} />
                          <Bar dataKey="blocks" name="Blocks"
                            radius={[4, 4, 0, 0]} fill="#9b59b6" fillOpacity={0.8} />
                          <Bar dataKey="digs" name="Digs"
                            radius={[4, 4, 0, 0]} fill="#1abc9c" fillOpacity={0.8} />
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
                      <span>Result</span>
                      <span>Kills</span>
                      <span>Aces</span>
                      <span>Blocks</span>
                      <span>Digs</span>
                      <span>Kill %</span>
                      <span>Atk eff.</span>
                    </div>
                    {playerHistory.map(h => (
                      <div key={h.match_id} style={styles.tableRow}>
                        <span style={{ color: '#888' }}>{h.date}</span>
                        <span style={{ fontWeight: '600' }}>{h.result}</span>
                        <span>{h.kills}</span>
                        <span>{h.aces}</span>
                        <span>{h.blocks}</span>
                        <span>{h.digs}</span>
                        <span style={{ color: '#F5C800' }}>{h.kill_pct}%</span>
                        <span style={{ color: '#F5C800' }}>{h.attack_efficiency}%</span>
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
  heading: { marginBottom: '24px', fontSize: '24px', color: '#f0f0f0' },
  controls: { display: 'flex', gap: '12px', marginBottom: '28px', flexWrap: 'wrap', alignItems: 'center' },
  select: {
    padding: '10px 14px', borderRadius: '8px', border: '1px solid #333',
    fontSize: '14px', background: '#2a2a2a', color: '#f0f0f0',
  },
  viewToggle: { display: 'flex', border: '1px solid #333', borderRadius: '8px', overflow: 'hidden' },
  toggleBtn: {
    padding: '8px 20px', border: 'none', background: '#1a1a1a',
    color: '#888', cursor: 'pointer', fontSize: '14px',
  },
  toggleActive: { background: '#F5C800', color: '#111', fontWeight: '600' },
  sectionTitle: { fontSize: '14px', fontWeight: '600', color: '#F5C800',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    marginBottom: '14px', marginTop: '28px' },
  statRow: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' },
  statCard: {
    background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px',
    padding: '16px 18px', minWidth: '120px', flex: 1,
  },
  statValue: { fontSize: '26px', fontWeight: '700', lineHeight: 1, marginBottom: '6px' },
  statUnit: { fontSize: '14px', fontWeight: '400', color: '#555' },
  statLabel: { fontSize: '12px', color: '#888' },
  topRow: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' },
  topCard: {
    background: '#1a1a00', border: '1px solid #3a3a00', borderRadius: '10px',
    padding: '14px 16px', minWidth: '130px', flex: 1,
  },
  topLabel: { fontSize: '11px', color: '#888', textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: '6px' },
  topName: { fontSize: '15px', fontWeight: '700', color: '#f0f0f0', marginBottom: '4px' },
  topValue: { fontSize: '13px', color: '#F5C800', fontWeight: '600' },
  chartRow: { display: 'flex', gap: '16px', marginBottom: '0', flexWrap: 'wrap' },
  chartCard: {
    flex: 1, minWidth: '280px', background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: '10px', padding: '16px', marginBottom: '16px',
  },
  chartTitle: { fontSize: '13px', fontWeight: '500', marginBottom: '12px', color: '#888' },
  tooltip: {
    background: '#1e1e1e', border: '1px solid #333', borderRadius: '8px',
    padding: '10px 14px', fontSize: '13px',
  },
  tooltipLabel: { color: '#888', marginBottom: '4px', fontSize: '12px' },
  playerGrid: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' },
  playerBtn: {
    padding: '12px 16px', background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: '10px', cursor: 'pointer', textAlign: 'left', minWidth: '130px',
  },
  playerBtnActive: { background: '#1a1a00', border: '1px solid #F5C800' },
  playerBtnName: { fontWeight: '600', fontSize: '14px', marginBottom: '2px', color: '#f0f0f0' },
  playerBtnPos: { fontSize: '12px', color: '#888', marginBottom: '6px' },
  playerBtnStat: { fontSize: '13px', color: '#F5C800', fontWeight: '500' },
  table: {
    background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: '10px', overflow: 'hidden', marginBottom: '20px',
  },
  tableHeader: {
    display: 'grid', gridTemplateColumns: '1.2fr 0.8fr repeat(6, 0.8fr)',
    padding: '10px 16px', background: '#1e1e1e', fontSize: '11px',
    fontWeight: '600', color: '#F5C800', textTransform: 'uppercase', letterSpacing: '0.04em',
  },
  tableRow: {
    display: 'grid', gridTemplateColumns: '1.2fr 0.8fr repeat(6, 0.8fr)',
    padding: '11px 16px', fontSize: '13px', borderTop: '1px solid #222', color: '#ccc',
  },
  empty: { color: '#555', fontSize: '14px', marginTop: '12px' },
};

export default Analytics;