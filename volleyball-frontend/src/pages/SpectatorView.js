import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';

const api_base = 'volleyball-analytics-tool-production.up.railway.app';

const EVENT_LABELS = {
  kill:           { label: 'Kill',         emoji: '⚡', color: '#2ecc71', point: 'us'   },
  ace:            { label: 'Ace',          emoji: '🎯', color: '#3498db', point: 'us'   },
  serve:          { label: 'Serve',        emoji: '🏐', color: '#1a5276', point: null   },
  spike:          { label: 'Spike',        emoji: '👊', color: '#9b59b6', point: null   },
  dig:            { label: 'Dig',          emoji: '🤿', color: '#1abc9c', point: null   },
  block:          { label: 'Block',        emoji: '🛡', color: '#e67e22', point: null   },
  assist:         { label: 'Assist',       emoji: '🤝', color: '#95a5a6', point: null   },
  serve_error:    { label: 'Serve Error',  emoji: '❌', color: '#e74c3c', point: 'them' },
  our_point:      { label: 'Opponent Error',        emoji: '✅', color: '#2ecc71', point: 'us'   },
  opponent_point: { label: 'GUVC Error',   emoji: '🔴', color: '#e74c3c', point: 'them' },
};

function SpectatorView() {
  const { matchId } = useParams();
  const [score, setScore] = useState(null);
  const [events, setEvents] = useState([]);
  const [players, setPlayers] = useState({});
  const [lineup, setLineup] = useState(null);
  const [error, setError] = useState(false);
  const fetchedPlayerIds = useRef(new Set());

  const fetchAll = async () => {
    try {
      const [scoreRes, eventsRes, lineupRes] = await Promise.all([
        fetch(`${api_base}/matches/${matchId}/score`),
        fetch(`${api_base}/matches/${matchId}/events`),
        fetch(`${api_base}/matches/${matchId}/lineup`),
      ]);
      if (!scoreRes.ok) throw new Error();
      const scoreData = await scoreRes.json();
      const eventsData = await eventsRes.json();
      const lineupData = lineupRes.ok ? await lineupRes.json() : null;
      setScore(scoreData);
      setEvents([...eventsData].reverse());
      if (lineupData) setLineup(lineupData);

      const unknownIds = eventsData
        .map(e => e.player_id)
        .filter(id => id && !fetchedPlayerIds.current.has(id));
      const unique = [...new Set(unknownIds)];
      if (unique.length > 0) {
        unique.forEach(id => fetchedPlayerIds.current.add(id));
        const fetched = await Promise.all(
          unique.map(id =>
            fetch(`${api_base}/players/${id}`)
              .then(r => r.ok ? r.json() : null)
              .catch(() => null)
          )
        );
        const newPlayers = {};
        fetched.forEach(p => { if (p) newPlayers[p.id] = p.name; });
        setPlayers(prev => ({ ...prev, ...newPlayers }));
      }
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  if (error) return (
    <div style={styles.page}>
      <Header />
      <div style={styles.errorBox}>Match not found.</div>
    </div>
  );

  if (!score) return (
    <div style={styles.page}>
      <Header />
      <div style={styles.loading}>Loading match...</div>
    </div>
  );

  const ourName = score.our_team_name;
  const opponentName = score.home_team_name === ourName
    ? score.away_team_name : score.home_team_name;
  const setsWon = (score.sets||[]).filter(s => s.us > s.them).length;
  const setsLost = (score.sets||[]).filter(s => s.them > s.us).length;

  return (
    <div style={styles.page}>
      <Header />

      {/* Score */}
      <div style={styles.card}>
        <div style={styles.liveRow}>
          {score.status === 'live'
            ? <span style={styles.liveDot}>● LIVE</span>
            : <span style={styles.statusTag}>{score.status.toUpperCase()}</span>}
          <span style={styles.setInfo}>Set {score.current_set}</span>
        </div>

        <div style={styles.scoreRow}>
          <div style={styles.team}>
            <div style={styles.teamName}>{ourName}</div>
            <div style={styles.bigScore}>{score.current_set_our}</div>
            <div style={styles.setsWon}>{setsWon} set{setsWon!==1?'s':''}</div>
          </div>
          <div style={styles.divider}>–</div>
          <div style={styles.team}>
            <div style={styles.teamName}>{opponentName}</div>
            <div style={styles.bigScore}>{score.current_set_opponent}</div>
            <div style={styles.setsWon}>{setsLost} set{setsLost!==1?'s':''}</div>
          </div>
        </div>

        {score.sets && score.sets.length > 0 && (
          <div style={styles.setsRow}>
            {score.sets.map(s => (
              <div key={s.set} style={styles.setPill}>
                <span style={styles.setNum}>Set {s.set}</span>
                <span style={styles.setScore}>{s.us} – {s.them}</span>
              </div>
            ))}
          </div>
        )}
        <div style={styles.refreshNote}>Updates every 5 seconds</div>
      </div>

      {/* Court diagram */}
      {lineup && lineup.on_court.length > 0 && (
        <div style={styles.feedCard}>
          <div style={styles.feedTitle}>Current lineup — {ourName}</div>

          <div style={styles.courtCard}>
            <div style={styles.courtNetLabel}>NET</div>

            {/* Front row: P4 P3 P2 — indices 3,2,1 in on_court array */}
            <div style={styles.courtRow}>
              {[3,2,1].map(i => {
                const p = lineup.on_court[i];
                return (
                  <div key={i} style={styles.courtSlot}>
                    <div style={styles.courtPosTag}>P{i+1}</div>
                    {p ? (
                      <>
                        <div style={styles.courtJersey}>
                          {p.jersey_number ? `#${p.jersey_number}` : ''}
                        </div>
                        <div style={styles.courtName}>{p.name}</div>
                        <div style={styles.courtPos}>{p.position ?? ''}</div>
                      </>
                    ) : <div style={styles.courtEmpty}>—</div>}
                  </div>
                );
              })}
            </div>

            <div style={styles.courtDivider} />

            {/* Back row: P5 P6 P1 — indices 4,5,0 */}
            <div style={styles.courtRow}>
              {[4,5,0].map(i => {
                const p = lineup.on_court[i];
                const isServer = i === 0;
                return (
                  <div key={i} style={{
                    ...styles.courtSlot,
                    ...(isServer ? styles.courtSlotServer : {}),
                  }}>
                    <div style={styles.courtPosTag}>P{i===0?1:i+1}</div>
                    {isServer && <div style={styles.courtServTag}>SERVING</div>}
                    {p ? (
                      <>
                        <div style={styles.courtJersey}>
                          {p.jersey_number ? `#${p.jersey_number}` : ''}
                        </div>
                        <div style={styles.courtName}>{p.name}</div>
                        <div style={styles.courtPos}>{p.position ?? ''}</div>
                      </>
                    ) : <div style={styles.courtEmpty}>—</div>}
                  </div>
                );
              })}
            </div>

            <div style={styles.courtBaseLabel}>BASELINE</div>
          </div>

          {/* Bench */}
          {lineup.bench && lineup.bench.length > 0 && (
            <>
              <div style={styles.benchLabel}>Bench</div>
              <div style={styles.benchRow}>
                {lineup.bench.map(p => (
                  <div key={p.id} style={styles.benchPlayer}>
                    <div style={styles.benchJersey}>
                      {p.jersey_number ? `#${p.jersey_number}` : '—'}
                    </div>
                    <div style={styles.benchName}>{p.name}</div>
                    <div style={styles.benchPos}>{p.position ?? ''}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Live feed */}
      {events.length > 0 && (
        <div style={styles.feedCard}>
          <div style={styles.feedTitle}>Live feed</div>
          <div style={styles.feedList}>
            {events.map((event, i) => {
              const info = EVENT_LABELS[event.event_type] ?? {
                label: event.event_type, emoji: '•', color: '#888', point: null,
              };
              const playerName = event.player_id
                ? (players[event.player_id] ?? `Player ${event.player_id}`)
                : null;
              const time = new Date(event.timestamp).toLocaleTimeString('en-GB', {
                hour: '2-digit', minute: '2-digit', second: '2-digit',
              });
              const isLatest = i === 0;

              // point description
              let pointDesc = null;
              if (info.point === 'us') {
                pointDesc = `→ point to ${ourName}`;
              } else if (info.point === 'them') {
                pointDesc = `→ point to ${opponentName}`;
              }

              return (
                <div key={event.id} style={{
                  ...styles.feedItem,
                  ...(isLatest ? styles.feedItemLatest : {}),
                }}>
                  <span style={styles.feedEmoji}>{info.emoji}</span>
                  <div style={styles.feedContent}>
                    <span style={{ ...styles.feedAction, color: info.color }}>
                      {info.label}
                    </span>
                    {playerName && (
                      <span style={styles.feedPlayer}> · {playerName}</span>
                    )}
                    {pointDesc && (
                      <span style={{
                        ...styles.feedPoint,
                        color: info.point === 'us' ? '#2ecc71' : '#e74c3c',
                      }}>
                        {' '}{pointDesc}
                      </span>
                    )}
                    <span style={styles.feedSet}> S{event.set_number}</span>
                  </div>
                  <span style={styles.feedTime}>{time}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {events.length === 0 && score.status === 'live' && (
        <div style={styles.feedCard}>
          <div style={styles.feedTitle}>Live feed</div>
          <p style={styles.noEvents}>Waiting for events...</p>
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <div style={styles.header}>
      <span style={styles.headerLeft}>👁👁 Spectating</span>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh', background: '#111',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', padding: '0 16px 32px', gap: '14px',
  },
  header: {
    width: '100%', maxWidth: '520px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 0',
  },
  headerLeft: { fontSize: '14px', fontWeight: '700', color: '#F5C800' },
  headerRight: { fontSize: '13px', color: '#555' },

  card: {
    background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: '16px', padding: '28px 20px',
    width: '100%', maxWidth: '520px', textAlign: 'center',
  },
  liveRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '12px', marginBottom: '20px',
  },
  liveDot: { color: '#ff6b6b', fontWeight: '700', fontSize: '14px' },
  statusTag: { color: '#888', fontSize: '13px', textTransform: 'uppercase' },
  setInfo: { color: '#888', fontSize: '13px' },
  scoreRow: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: '16px', marginBottom: '20px',
  },
  team: { flex: 1 },
  teamName: {
    fontSize: '12px', color: '#ccc', marginBottom: '6px',
    fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  bigScore: {
    fontSize: '68px', fontWeight: '800',
    color: '#F5C800', lineHeight: 1, marginBottom: '6px',
  },
  setsWon: { fontSize: '12px', color: '#888' },
  divider: { fontSize: '32px', color: '#333', fontWeight: '300' },
  setsRow: {
    display: 'flex', gap: '8px', justifyContent: 'center',
    flexWrap: 'wrap', marginBottom: '12px',
  },
  setPill: {
    background: '#222', border: '1px solid #2a2a2a', borderRadius: '8px',
    padding: '5px 10px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: '2px',
  },
  setNum: { fontSize: '9px', color: '#666', textTransform: 'uppercase' },
  setScore: { fontSize: '14px', fontWeight: '600', color: '#f0f0f0' },
  refreshNote: { fontSize: '11px', color: '#444', marginTop: '6px' },

  feedCard: {
    background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: '16px', padding: '18px',
    width: '100%', maxWidth: '520px',
  },
  feedTitle: {
    fontSize: '11px', fontWeight: '600', color: '#F5C800',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px',
  },

  // court diagram
  courtCard: {
    background: '#1a1a38', borderRadius: '10px',
    padding: '12px', marginBottom: '14px', border: '1px solid #2a2a4a',
  },
  courtNetLabel: {
    textAlign: 'center', fontSize: '10px', color: '#F5C800',
    fontWeight: '700', letterSpacing: '0.15em', marginBottom: '8px',
  },
  courtBaseLabel: {
    textAlign: 'center', fontSize: '10px', color: '#555',
    letterSpacing: '0.1em', marginTop: '8px',
  },
  courtRow: { display: 'flex', gap: '6px', marginBottom: '4px' },
  courtDivider: { height: '2px', background: '#2a2a4a', margin: '6px 0' },
  courtSlot: {
    flex: 1, background: '#1e1e38', borderRadius: '8px',
    padding: '8px 4px', minHeight: '72px',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    textAlign: 'center', position: 'relative',
    border: '1px solid #2a2a4a',
  },
  courtSlotServer: { border: '1px solid #2ecc71' },
  courtPosTag: {
    position: 'absolute', top: '3px', left: '4px',
    fontSize: '9px', color: '#555', fontWeight: '700',
  },
  courtServTag: {
    fontSize: '8px', color: '#2ecc71', fontWeight: '700',
    letterSpacing: '0.05em', marginBottom: '2px',
  },
  courtJersey: { fontSize: '11px', color: '#F5C800', fontWeight: '700', marginBottom: '2px' },
  courtName: { fontSize: '11px', fontWeight: '600', color: '#f0f0f0', marginBottom: '1px' },
  courtPos: { fontSize: '9px', color: '#666' },
  courtEmpty: { color: '#333', fontSize: '12px' },

  // bench
  benchLabel: {
    fontSize: '10px', color: '#555', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: '8px', fontWeight: '600',
  },
  benchRow: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  benchPlayer: {
    background: '#111', border: '1px solid #1e1e1e',
    borderRadius: '6px', padding: '6px 8px', textAlign: 'center',
    opacity: 0.7, minWidth: '60px',
  },
  benchJersey: { fontSize: '10px', color: '#F5C800', fontWeight: '600', marginBottom: '2px' },
  benchName: { fontSize: '10px', color: '#ccc', fontWeight: '500' },
  benchPos: { fontSize: '9px', color: '#555' },

  // feed
  feedList: { display: 'flex', flexDirection: 'column', gap: '4px' },
  feedItem: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '8px 10px', borderRadius: '8px', background: '#1e1e1e',
  },
  feedItemLatest: { background: '#1e1e00', border: '1px solid #3a3a00' },
  feedEmoji: { fontSize: '15px', flexShrink: 0, width: '22px', textAlign: 'center' },
  feedContent: { flex: 1, fontSize: '13px', lineHeight: 1.4 },
  feedAction: { fontWeight: '600' },
  feedPlayer: { color: '#ccc' },
  feedPoint: { fontSize: '12px', fontWeight: '500' },
  feedSet: { color: '#444', fontSize: '11px' },
  feedTime: { color: '#444', fontSize: '10px', flexShrink: 0 },
  noEvents: { color: '#555', fontSize: '14px', textAlign: 'center', padding: '16px 0' },
  loading: { color: '#888', fontSize: '16px' },
  errorBox: { color: '#ff6b6b', fontSize: '16px' },
};

export default SpectatorView;