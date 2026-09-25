import { useEffect, useState } from 'react';
import { getTeams, getTeamAnalytics, getTeamTrend, getPlayerAnalytics,
         getPlayerMatchHistory, getTopPerformers, getMatchCount,
         getTeamMatchHistory, getRotationAnalytics,
         getHomeAwayAnalytics } from '../api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from 'recharts';

function StatCard({ label, value, unit = '', color = '#F5C800', help, detail }) {
  return (
    <div style={styles.statCard} title={help || ''}>
      <div style={styles.statValue}>
        <span style={{ color }}>{value}</span>
        <span style={styles.statUnit}>{unit}</span>
      </div>
      <div style={styles.statLabel}>{label}{help ? ' ⓘ' : ''}</div>
      {detail && <div style={styles.statDetail}>{detail}</div>}
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
  const [teamHistory, setTeamHistory] = useState([]);
  const [rotationStats, setRotationStats] = useState(null);
  const [homeAwayStats, setHomeAwayStats] = useState(null);
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
    getTeamMatchHistory(selectedTeam).then(res => setTeamHistory(res.data)).catch(() => {});
    getRotationAnalytics(selectedTeam, n).then(res => setRotationStats(res.data));
    getHomeAwayAnalytics(selectedTeam, n).then(res => setHomeAwayStats(res.data));
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
            setTeamHistory([]);
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

      {/* ── TEAM VIEW ── */}
      {selectedTeam && view === 'team' && teamStats && (
        <>
          <h3 style={styles.sectionTitle}>Team overview</h3>
          <div style={styles.statRow}>
            <StatCard label="Attack efficiency" value={teamStats.team_attack_efficiency ?? '—'}
              unit={teamStats.team_attack_efficiency == null ? '' : '%'}
              help="(Kills − attack errors) ÷ attack attempts"
              detail={`${teamStats.total_kills} kills · ${teamStats.total_attack_errors} errors · ${teamStats.total_attacks} attempts`} />
            <StatCard label="Total kills" value={teamStats.total_kills} color="#2ecc71" />
            <StatCard label="Attack attempts" value={teamStats.total_attacks} />
            <StatCard label="Attack errors" value={teamStats.total_attack_errors} color="#e74c3c" />
            <StatCard label="Block points" value={teamStats.total_block_points} color="#9b59b6" />
            <StatCard label="Block touches" value={teamStats.total_block_touches} color="#e67e22" />
          </div>
          <div style={styles.statRow}>
            <StatCard label="Serve in %" value={teamStats.team_serve_in_pct ?? '—'}
              unit={teamStats.team_serve_in_pct == null ? '' : '%'} color="#3498db"
              help="Serves that entered play, including aces. Attempts are inferred automatically from completed rallies."
              detail={`${teamStats.total_serves - teamStats.total_serve_errors}/${teamStats.total_serves} in`} />
            <StatCard label="Ace %" value={teamStats.team_ace_pct ?? '—'}
              unit={teamStats.team_ace_pct == null ? '' : '%'} color="#2980b9" />
            <StatCard label="Serve efficiency" value={teamStats.team_serve_efficiency ?? '—'}
              unit={teamStats.team_serve_efficiency == null ? '' : '%'} color="#1abc9c"
              help="(Aces − serve errors) ÷ serve attempts. A negative value is valid when errors exceed aces."
              detail={`${teamStats.total_aces} aces · ${teamStats.total_serve_errors} errors · ${teamStats.total_serves} attempts`} />
            <StatCard label="Serve errors" value={teamStats.total_serve_errors} color="#e74c3c" />
            <StatCard label="Serve attempts" value={teamStats.total_serves} />
            <StatCard label="Side-out %" value={rotationStats?.sideout_pct ?? '—'}
              unit={rotationStats?.sideout_pct == null ? '' : '%'} color="#2ecc71" />
          </div>
          <div style={styles.statRow}>
            <StatCard label="Pass average" value={teamStats.team_pass_average ?? '—'}
              unit={teamStats.team_pass_average == null ? '' : '/3'} color="#1abc9c" />
            <StatCard label="Positive pass %" value={teamStats.team_positive_pass_pct ?? '—'}
              unit={teamStats.team_positive_pass_pct == null ? '' : '%'} color="#2ecc71"
              help="Receptions rated 2 or 3"
              detail={`${teamStats.positive_passes ?? '—'}/${teamStats.team_pass_count} receptions`} />
            <StatCard label="Perfect pass %" value={teamStats.team_perfect_pass_pct ?? '—'}
              unit={teamStats.team_perfect_pass_pct == null ? '' : '%'} color="#F5C800"
              help="Receptions rated 3"
              detail={`${teamStats.perfect_passes ?? '—'}/${teamStats.team_pass_count} receptions`} />
            <StatCard label="Reception error %" value={teamStats.team_reception_error_pct ?? '—'}
              unit={teamStats.team_reception_error_pct == null ? '' : '%'} color="#e74c3c" />
            <StatCard label="Rated receptions" value={teamStats.team_pass_count} />
            <StatCard label="Assists" value={teamStats.total_assists} color="#e67e22" />
            <StatCard label="Attributed sets" value={teamStats.total_set_attempts} color="#9b59b6" />
            <StatCard label="Set-to-assist conversion" value={teamStats.team_assist_conversion_pct ?? '—'}
              unit={teamStats.team_assist_conversion_pct == null ? '' : '%'} color="#f39c12"
              help="Assists ÷ attributed set attempts" />
          </div>

          {homeAwayStats && (homeAwayStats.home.matches > 0 || homeAwayStats.away.matches > 0) && (
            <>
              <h3 style={styles.sectionTitle}>Home vs away</h3>
              <div style={styles.comparisonGrid}>
                {['home', 'away'].map(location => {
                  const stats = homeAwayStats[location];
                  return (
                    <div key={location} style={styles.comparisonCard}>
                      <div style={styles.comparisonTitle}>{location}</div>
                      {stats.matches === 0 ? (
                        <div style={styles.comparisonEmpty}>No completed matches</div>
                      ) : (
                        <div style={styles.comparisonRows}>
                          <div style={styles.comparisonRow}><span>Record</span><strong>{stats.wins}–{stats.losses}</strong></div>
                          <div style={styles.comparisonRow}><span>Win rate</span><strong>{stats.win_pct}%</strong></div>
                          <div style={styles.comparisonRow}><span>Kill rate</span><strong>{stats.kill_pct ?? '—'}{stats.kill_pct == null ? '' : '%'}</strong></div>
                          <div style={styles.comparisonRow}><span>Serve error</span><strong>{stats.serve_error_rate ?? '—'}{stats.serve_error_rate == null ? '' : '%'}</strong></div>
                          <div style={styles.comparisonRow}><span>Side-out</span><strong>{stats.sideout_pct ?? '—'}{stats.sideout_pct == null ? '' : '%'}</strong></div>
                          <div style={styles.comparisonRow}><span>Matches</span><strong>{stats.matches}</strong></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {rotationStats?.rotations?.some(rotation =>
            rotation.points_for + rotation.points_against > 0) && (
            <>
              <h3 style={styles.sectionTitle}>Performance by rotation</h3>
              <div style={styles.chartCard}>
                <div style={styles.chartTitle}>Point difference by starting rotation</div>
                <ResponsiveContainer width="100%" height={chartH}>
                  <BarChart data={rotationStats.rotations}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                    <XAxis dataKey="rotation" tickFormatter={value => `R${value}`}
                      tick={{ fontSize: 10, fill: '#888' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#888' }} width={30} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="point_difference" fill="#F5C800" name="Point difference" />
                  </BarChart>
                </ResponsiveContainer>
                <div style={styles.rotationGrid}>
                  {rotationStats.rotations.map(rotation => (
                    <div key={rotation.rotation} style={styles.rotationCard}>
                      <strong style={{ color: '#F5C800' }}>R{rotation.rotation}</strong>
                      <span>{rotation.points_for}–{rotation.points_against} points</span>
                      <span>{rotation.sideout_pct == null ? 'No receptions' : `${rotation.sideout_pct}% side-out`}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {topPerformers && Object.values(topPerformers).some(v => v) && (
            <>
              <h3 style={styles.sectionTitle}>Top performers</h3>
              <div style={styles.topRow}>
                <TopPerformerBadge label="Most kills" name={topPerformers.most_kills?.name} value={topPerformers.most_kills?.value} />
                <TopPerformerBadge label="Most block points" name={topPerformers.most_blocks?.name} value={topPerformers.most_blocks?.value} />
                <TopPerformerBadge label="Most digs" name={topPerformers.most_digs?.name} value={topPerformers.most_digs?.value} />
                <TopPerformerBadge label="Most aces" name={topPerformers.most_aces?.name} value={topPerformers.most_aces?.value} />
                <TopPerformerBadge label="Best kill rate" name={topPerformers.highest_kill_pct?.name} value={topPerformers.highest_kill_pct?.value} unit="%" />
              </div>
            </>
          )}

          {trend.length > 1 && (
            <>
              <h3 style={styles.sectionTitle}>Trends</h3>
              <div style={mobile ? styles.chartColStack : styles.chartRow}>
                <div style={styles.chartCard}>
                  <div style={styles.chartTitle}>Kill rate per match</div>
                  <ResponsiveContainer width="100%" height={chartH}>
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#888' }} unit="%" width={30} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="kill_pct"
                        stroke="#F5C800" strokeWidth={2}
                        dot={{ r: 3, fill: '#F5C800' }} name="Kill rate" unit="%" />
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

          {/* Match history */}
          {teamHistory.length > 0 && (
            <>
              <h3 style={styles.sectionTitle}>Match history</h3>
              <div style={styles.table}>
                <div style={{ ...styles.tableHeader, gridTemplateColumns: '1fr 1.8fr 0.5fr 0.7fr' }}>
                  <span>Date</span>
                  <span>Opponent</span>
                  <span>Result</span>
                  <span>Sets</span>
                </div>
                {teamHistory.map(h => (
                  <div key={h.match_id}
                    style={{ ...styles.tableRow, gridTemplateColumns: '1fr 1.8fr 0.5fr 0.7fr' }}>
                    <span style={{ color: '#888' }}>{h.date}</span>
                    <span style={{ color: '#f0f0f0' }}>{h.opponent}</span>
                    <span style={{
                      fontWeight: '700',
                      color: h.result === 'W' ? '#2ecc71' : '#e74c3c'
                    }}>
                      {h.result}
                    </span>
                    <span style={{ color: '#F5C800' }}>{h.our_sets}–{h.their_sets}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── PLAYER VIEW ── */}
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
                <div style={styles.playerBtnStat}>{p.kill_pct ?? '—'}{p.kill_pct == null ? '' : '%'} kill rate</div>
              </button>
            ))}
          </div>

          {playerStats && activePlayer && (
            <>
              <h3 style={styles.sectionTitle}>{playerStats.name}</h3>
              <div style={styles.statRow}>
                <StatCard label="Attack efficiency" value={playerStats.attack_efficiency ?? '—'}
                  unit={playerStats.attack_efficiency == null ? '' : '%'} />
                <StatCard label="Kill rate" value={playerStats.kill_pct ?? '—'}
                  unit={playerStats.kill_pct == null ? '' : '%'}
                  help="Kills ÷ attack attempts. Unlike attack efficiency, this does not subtract attack errors." />
                <StatCard label="Attack attempts" value={playerStats.total_attacks} />
                <StatCard label="Attack errors" value={playerStats.attack_errors} color="#e74c3c" />
                <StatCard label="Setter dumps" value={playerStats.setter_dumps} color="#8e44ad" />
              </div>
              <div style={styles.statRow}>
                <StatCard label="Kills" value={playerStats.kills} color="#2ecc71" />
                <StatCard label="Block points" value={playerStats.block_points} color="#9b59b6" />
                <StatCard label="Block touches" value={playerStats.block_touches} color="#e67e22" />
                <StatCard label="Aces" value={playerStats.aces} color="#3498db" />
                <StatCard label="Digs" value={playerStats.digs} color="#1abc9c" />
                <StatCard label="Assists" value={playerStats.assists} color="#f39c12" />
                <StatCard label="Set attempts" value={playerStats.set_attempts} color="#9b59b6" />
                <StatCard label="Set-to-assist conversion" value={playerStats.assist_conversion_pct ?? '—'}
                  unit={playerStats.assist_conversion_pct == null ? '' : '%'} color="#f39c12"
                  help="Assists ÷ attributed set attempts" />
                <StatCard label="Total points" value={playerStats.total_points} color="#F5C800" />
                <StatCard label="Foot faults" value={playerStats.foot_faults} color="#e74c3c" />
                <StatCard label="Net touches" value={playerStats.net_touches} color="#e74c3c" />
              </div>
              <div style={styles.statRow}>
                <StatCard label="Serve in %" value={playerStats.serve_in_pct ?? '—'}
                  unit={playerStats.serve_in_pct == null ? '' : '%'} color="#3498db" />
                <StatCard label="Ace %" value={playerStats.ace_pct ?? '—'}
                  unit={playerStats.ace_pct == null ? '' : '%'} color="#2980b9" />
                <StatCard label="Serve efficiency" value={playerStats.serve_efficiency ?? '—'}
                  unit={playerStats.serve_efficiency == null ? '' : '%'} color="#1abc9c" />
                <StatCard label="Serve errors" value={playerStats.serve_errors} color="#e74c3c" />
                <StatCard label="Serve attempts" value={playerStats.serve_attempts} />
              </div>
              <div style={styles.statRow}>
                <StatCard label="Pass average" value={playerStats.pass_average ?? '—'}
                  unit={playerStats.pass_average == null ? '' : '/3'} color="#1abc9c" />
                <StatCard label="Positive pass %" value={playerStats.positive_pass_pct ?? '—'}
                  unit={playerStats.positive_pass_pct == null ? '' : '%'} color="#2ecc71" />
                <StatCard label="Perfect pass %" value={playerStats.perfect_pass_pct ?? '—'}
                  unit={playerStats.perfect_pass_pct == null ? '' : '%'} color="#F5C800" />
                <StatCard label="Reception error %" value={playerStats.reception_error_pct ?? '—'}
                  unit={playerStats.reception_error_pct == null ? '' : '%'} color="#e74c3c" />
                <StatCard label="Rated receptions" value={playerStats.reception_attempts} />
              </div>
              <div style={styles.statRow}>
                <StatCard label="Sets played" value={playerStats.sets_played || '—'} />
                <StatCard label="Kills / set" value={playerStats.kills_per_set ?? '—'} />
                <StatCard label="Aces / set" value={playerStats.aces_per_set ?? '—'} />
                <StatCard label="Digs / set" value={playerStats.digs_per_set ?? '—'} />
                <StatCard label="Assists / set" value={playerStats.assists_per_set ?? '—'} />
                <StatCard label="Blocks / set" value={playerStats.blocks_per_set ?? '—'} />
              </div>

              {playerHistory.length > 1 && (
                <>
                  <h3 style={styles.sectionTitle}>Performance over time</h3>
                  <div style={styles.chartCard}>
                    <div style={styles.chartTitle}>Kill rate over time</div>
                    <ResponsiveContainer width="100%" height={chartH}>
                      <LineChart data={[...playerHistory].reverse()}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#888' }} unit="%" width={30} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="kill_pct"
                          stroke="#F5C800" strokeWidth={2}
                          dot={{ r: 3, fill: '#F5C800' }} name="Kill rate" unit="%" />
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
                      <div style={styles.chartTitle}>Block points & digs</div>
                      <ResponsiveContainer width="100%" height={mobile ? 140 : 180}>
                        <BarChart data={[...playerHistory].reverse()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#888' }} />
                          <YAxis tick={{ fontSize: 9, fill: '#888' }} width={20} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#2a2a2a' }} />
                          <Bar dataKey="kill_blocks" name="Block points" radius={[4,4,0,0]} fill="#9b59b6" fillOpacity={0.8} />
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
                    <div style={{ ...styles.tableHeader, gridTemplateColumns: '1.2fr 0.7fr repeat(6, 0.5fr)' }}>
                      <span>Date</span>
                      <span>Res</span>
                      <span>K</span>
                      <span>KB</span>
                      <span>A</span>
                      <span>B</span>
                      <span>D</span>
                      <span>Kill rate</span>
                    </div>
                    {playerHistory.map(h => (
                      <div key={h.match_id}
                        style={{ ...styles.tableRow, gridTemplateColumns: '1.2fr 0.7fr repeat(6, 0.5fr)' }}>
                        <span style={{ color: '#888' }}>{h.date}</span>
                        <span style={{
                          fontWeight: '600',
                          color: h.result === 'W' ? '#2ecc71' : '#e74c3c'
                        }}>{h.result}</span>
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
  statDetail: { marginTop: '5px', fontSize: '9px', color: '#666', lineHeight: 1.35 },
  topRow: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' },
  topCard: {
    background: '#1a1a00', border: '1px solid #3a3a00', borderRadius: '10px',
    padding: '12px 14px', minWidth: '100px', flex: 1,
  },
  topLabel: { fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' },
  topName: { fontSize: '14px', fontWeight: '700', color: '#f0f0f0', marginBottom: '2px' },
  topValue: { fontSize: '13px', color: '#F5C800', fontWeight: '600' },
  chartRow: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  chartColStack: { display: 'flex', flexDirection: 'column', gap: '12px' },
  chartCard: {
    flex: 1, minWidth: '200px', background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: '10px', padding: '14px', marginBottom: '12px',
  },
  chartTitle: { fontSize: '12px', fontWeight: '500', marginBottom: '10px', color: '#888' },
  rotationGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))', gap: '6px', marginTop: '10px' },
  rotationCard: { display: 'flex', flexDirection: 'column', gap: '3px', padding: '8px', background: '#111', borderRadius: '7px', color: '#aaa', fontSize: '10px' },
  comparisonGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '8px' },
  comparisonCard: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '14px' },
  comparisonTitle: { color: '#F5C800', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '10px' },
  comparisonRows: { display: 'grid', gap: '7px', fontSize: '12px', color: '#888' },
  comparisonRow: { display: 'flex', justifyContent: 'space-between', gap: '12px' },
  comparisonEmpty: { color: '#555', fontSize: '12px' },
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
    display: 'grid',
    padding: '8px 12px', background: '#1e1e1e', fontSize: '10px',
    fontWeight: '600', color: '#F5C800', textTransform: 'uppercase',
  },
  tableRow: {
    display: 'grid',
    padding: '8px 12px', fontSize: '12px',
    borderTop: '1px solid #222', color: '#ccc',
  },
  empty: { color: '#555', fontSize: '14px', marginTop: '12px' },
};

export default Analytics;
