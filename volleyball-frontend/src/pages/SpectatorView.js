import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';

const api_base = 'http://localhost:8000';

const EVENT_LABELS = {
  kill: { label: 'Kill', emoji: '⚡', color: '#2ecc71' },
  ace: { label: 'Ace', emoji: '🎯', color: '#3498db' },
  spike: { label: 'Spike', emoji: '👊', color: '#9b59b6' },
  dig: { label: 'Dig', emoji: '🤿', color: '#1abc9c' },
  block: { label: 'Block', emoji: '🛡', color: '#e67e22' },
  assist: { label: 'Assist', emoji: '🤝', color: '#95a5a6' },
  serve_error: { label: 'Serve Error', emoji: '❌', color: '#e74c3c' },
  our_point: { label: 'Point', emoji: '✅', color: '#2ecc71' },
  opponent_point: { label: 'Opponent Point', emoji: '🔴', color: '#e74c3c' },
};

function SpectatorView() {
  const { matchId } = useParams();
  const [score, setScore] = useState(null);
  const [events, setEvents] = useState([]);
  const [players, setPlayers] = useState({});
  const [error, setError] = useState(false);
  const feedRef = useRef(null);

  const fetchAll = async () => {
    try {
      const [scoreRes, eventsRes] = await Promise.all([
        fetch(`${api_base}/matches/${matchId}/score`),
        fetch(`${api_base}/matches/${matchId}/events`),
      ]);
      if (!scoreRes.ok) throw new Error();
      const scoreData = await scoreRes.json();
      const eventsData = await eventsRes.json();
      setScore(scoreData);
      setEvents(eventsData.slice().reverse());

      // fetch player names we haven't seen yet
      const unknownIds = eventsData
        .map(e => e.player_id)
        .filter(id => id && !players[id]);
      const unique = [...new Set(unknownIds)];
      if (unique.length > 0) {
        const fetched = await Promise.all(
          unique.map(id =>
            fetch(`${api_base}/players/${id}`)
              .then(r => r.ok ? r.json() : null)
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
  }, [matchId]);

  if (error) return (
    <div style={styles.page}>
      <div style={styles.errorBox}>Match not found.</div>
    </div>
  );

  if (!score) return (
    <div style={styles.page}>
      <div style={styles.loading}>Loading match...</div>
    </div>
  );

  const ourName = score.our_team_name;
  const opponentName = score.home_team_name === ourName
    ? score.away_team_name : score.home_team_name;
  const setsWon = (score.sets || []).filter(s => s.us > s.them).length;
  const setsLost = (score.sets || []).filter(s => s.them > s.us).length;

  return (
    <div style={styles.page}>

      {/* Score card */}
      <div style={styles.card}>
        <div style={styles.liveRow}>
          {score.status === 'live'
            ? <span style={styles.liveDot}>● LIVE</span>
            : <span style={styles.statusTag}>{score.status.toUpperCase()}</span>
          }
          <span style={styles.setInfo}>Set {score.current_set}</span>
        </div>

        <div style={styles.scoreRow}>
          <div style={styles.team}>
            <div style={styles.teamName}>{ourName}</div>
            <div style={styles.bigScore}>{score.current_set_our}</div>
            <div style={styles.setsWon}>{setsWon} set{setsWon !== 1 ? 's' : ''}</div>
          </div>
          <div style={styles.divider}>–</div>
          <div style={styles.team}>
            <div style={styles.teamName}>{opponentName}</div>
            <div style={styles.bigScore}>{score.current_set_opponent}</div>
            <div style={styles.setsWon}>{setsLost} set{setsLost !== 1 ? 's' : ''}</div>
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

      {/* Live feed */}
      {events.length > 0 && (
        <div style={styles.feedCard}>
          <div style={styles.feedTitle}>Live feed</div>
          <div style={styles.feedList} ref={feedRef}>
            {events.map((event, i) => {
              const info = EVENT_LABELS[event.event_type] ?? {
                label: event.event_type, emoji: '•', color: '#888'
              };
              const playerName = event.player_id
                ? (players[event.player_id] ?? `Player ${event.player_id}`)
                : null;
              const time = new Date(event.timestamp).toLocaleTimeString('en-GB', {
                hour: '2-digit', minute: '2-digit', second: '2-digit'
              });
              const isFirst = i === 0;
              return (
                <div key={event.id} style={{
                  ...styles.feedItem,
                  ...(isFirst ? styles.feedItemLatest : {}),
                }}>
                  <span style={styles.feedEmoji}>{info.emoji}</span>
                  <div style={styles.feedContent}>
                    <span style={{ ...styles.feedAction, color: info.color }}>
                      {info.label}
                    </span>
                    {playerName && (
                      <span style={styles.feedPlayer}> · {playerName}</span>
                    )}
                    <span style={styles.feedSet}>Set {event.set_number}</span>
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

const styles = {
  page: {
    minHeight: '100vh', background: '#111', display: 'flex',
    flexDirection: 'column', alignItems: 'center',
    padding: '24px 16px', gap: '16px',
  },
  card: {
    background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '16px',
    padding: '32px 24px', width: '100%', maxWidth: '480px', textAlign: 'center',
  },
  liveRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '12px', marginBottom: '24px',
  },
  liveDot: { color: '#ff6b6b', fontWeight: '700', fontSize: '14px' },
  statusTag: { color: '#888', fontSize: '13px' },
  setInfo: { color: '#888', fontSize: '13px' },
  scoreRow: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: '16px', marginBottom: '24px',
  },
  team: { flex: 1 },
  teamName: {
    fontSize: '13px', color: '#ccc', marginBottom: '8px',
    fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  bigScore: {
    fontSize: '72px', fontWeight: '800', color: '#F5C800',
    lineHeight: 1, marginBottom: '8px',
  },
  setsWon: { fontSize: '13px', color: '#888' },
  divider: { fontSize: '36px', color: '#333', fontWeight: '300' },
  setsRow: {
    display: 'flex', gap: '8px', justifyContent: 'center',
    flexWrap: 'wrap', marginBottom: '16px',
  },
  setPill: {
    background: '#222', border: '1px solid #2a2a2a', borderRadius: '8px',
    padding: '6px 12px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: '2px',
  },
  setNum: { fontSize: '10px', color: '#666', textTransform: 'uppercase' },
  setScore: { fontSize: '15px', fontWeight: '600', color: '#f0f0f0' },
  refreshNote: { fontSize: '11px', color: '#444', marginTop: '8px' },
  feedCard: {
    background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '16px',
    padding: '20px', width: '100%', maxWidth: '480px',
  },
  feedTitle: {
    fontSize: '12px', fontWeight: '600', color: '#F5C800',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px',
  },
  feedList: { display: 'flex', flexDirection: 'column', gap: '2px' },
  feedItem: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '9px 10px', borderRadius: '8px',
    background: '#1e1e1e',
  },
  feedItemLatest: {
    background: '#1e1e00', border: '1px solid #3a3a00',
  },
  feedEmoji: { fontSize: '16px', flexShrink: 0, width: '24px', textAlign: 'center' },
  feedContent: { flex: 1, fontSize: '14px' },
  feedAction: { fontWeight: '600' },
  feedPlayer: { color: '#ccc' },
  feedSet: { color: '#555', fontSize: '12px', marginLeft: '6px' },
  feedTime: { color: '#555', fontSize: '11px', flexShrink: 0 },
  noEvents: { color: '#555', fontSize: '14px', textAlign: 'center', padding: '20px 0' },
  loading: { color: '#888', fontSize: '16px' },
  errorBox: { color: '#ff6b6b', fontSize: '16px' },
};

export default SpectatorView;