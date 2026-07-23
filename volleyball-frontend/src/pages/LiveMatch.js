import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getScore, logEvent, undoEvent, endSet, completeMatch, getPlayersByTeam, getMatches, getTeams } from '../api';

const EVENTS = [
  { type: 'kill',        label: 'Kill',        color: '#27ae60', points: 'us'   },
  { type: 'ace',         label: 'Ace',         color: '#2980b9', points: 'us'   },
  { type: 'spike',       label: 'Spike',       color: '#8e44ad', points: null   },
  { type: 'dig',         label: 'Dig',         color: '#16a085', points: null   },
  { type: 'block',       label: 'Block',       color: '#d35400', points: null   },
  { type: 'assist',      label: 'Assist',      color: '#7f8c8d', points: null   },
  { type: 'serve_error', label: 'Serve Error', color: '#c0392b', points: 'them' },
];

function LiveMatch() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [score, setScore] = useState(null);
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [match, setMatch] = useState(null);
  const [teams, setTeams] = useState([]);
  const [lastEvent, setLastEvent] = useState(null);
  const [undoMsg, setUndoMsg] = useState('');

  const fetchScore = useCallback(() => {
    getScore(matchId).then(res => setScore(res.data));
  }, [matchId]);

  useEffect(() => {
    fetchScore();
    getTeams().then(res => setTeams(res.data));
    getMatches().then(res => {
      const m = res.data.find(m => m.id === parseInt(matchId));
      setMatch(m);
      if (m) {
        getPlayersByTeam(m.our_team_id).then(res => setPlayers(res.data));
      }
    });
  }, [matchId, fetchScore]);

  const teamName = (id) => teams.find(t => t.id === id)?.name ?? '...';

  const handleEvent = async (eventType) => {
    if (!selectedPlayer && eventType !== 'opponent_point') {
      alert('Select a player first');
      return;
    }
    const event = {
      match_id: parseInt(matchId),
      player_id: selectedPlayer?.id ?? null,
      event_type: eventType,
      set_number: score?.current_set ?? 1,
    };
    const res = await logEvent(matchId, event);
    setLastEvent(res.data);
    fetchScore();
  };

  const handleUndo = async () => {
    await undoEvent(matchId);
    setLastEvent(null);
    setUndoMsg('Last event undone');
    setTimeout(() => setUndoMsg(''), 2000);
    fetchScore();
  };

  const handleEndSet = async () => {
    if (!window.confirm(`End set ${score?.current_set}?`)) return;
    await endSet(matchId);
    fetchScore();
  };

  const handleComplete = async () => {
    if (!window.confirm('End the match?')) return;
    await completeMatch(matchId);
    navigate('/matches');
  };

  if (!score || !match) return <div style={styles.loading}>Loading match...</div>;

  const ourTeamName = teamName(match.our_team_id);
  const opponentId = match.home_team_id === match.our_team_id
    ? match.away_team_id : match.home_team_id;
  const opponentName = teamName(opponentId);

  const setsWon = (score.sets || []).filter(s => s.us > s.them).length;
  const setsLost = (score.sets || []).filter(s => s.them > s.us).length;

  return (
    <div style={styles.page}>

      {/* Score header */}
      <div style={styles.scoreHeader}>
        <div style={styles.scoreBlock}>
          <div style={styles.teamLabel}>{ourTeamName}</div>
          <div style={styles.scoreNum}>{score.current_set_our}</div>
          <div style={styles.setsLabel}>{setsWon} set{setsWon !== 1 ? 's' : ''}</div>
        </div>

        <div style={styles.scoreMid}>
          <div style={styles.setLabel}>Set {score.current_set}</div>
          {(score.sets || []).map(s => (
            <div key={s.set} style={styles.setPill}>
              S{s.set}: {s.us}–{s.them}
            </div>
          ))}
          <button style={styles.opponentBtn}
            onClick={() => handleEvent('opponent_point')}>
            + {opponentName} point
          </button>
        </div>

        <div style={styles.scoreBlock}>
          <div style={styles.teamLabel}>{opponentName}</div>
          <div style={styles.scoreNum}>{score.current_set_opponent}</div>
          <div style={styles.setsLabel}>{setsLost} set{setsLost !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Controls bar */}
      <div style={styles.controls}>
        <button style={styles.undoBtn} onClick={handleUndo}>↩ Undo</button>
        {undoMsg && <span style={styles.undoMsg}>{undoMsg}</span>}
        <div style={{ flex: 1 }} />
        <button style={styles.endSetBtn} onClick={handleEndSet}>End Set</button>
        <button style={styles.endMatchBtn} onClick={handleComplete}>End Match</button>
      </div>

      <div style={styles.body}>

        {/* Player list */}
        <div style={styles.playerPanel}>
          <div style={styles.panelTitle}>Players</div>
          {players.map(p => (
            <button key={p.id}
              style={{
                ...styles.playerBtn,
                ...(selectedPlayer?.id === p.id ? styles.playerBtnActive : {})
              }}
              onClick={() => setSelectedPlayer(selectedPlayer?.id === p.id ? null : p)}>
              <span style={styles.jerseyNum}>#{p.jersey_number ?? '–'}</span>
              <span style={styles.playerName}>{p.name}</span>
              <span style={styles.playerPos}>{p.position ?? ''}</span>
            </button>
          ))}
        </div>

        {/* Event buttons */}
        <div style={styles.eventPanel}>
          <div style={styles.panelTitle}>
            {selectedPlayer
              ? `Logging for ${selectedPlayer.name}`
              : 'Select a player on the left'}
          </div>
          <div style={styles.eventGrid}>
            {EVENTS.map(ev => (
              <button key={ev.type}
                style={{
                  ...styles.eventBtn,
                  background: ev.color,
                  opacity: selectedPlayer ? 1 : 0.35,
                  cursor: selectedPlayer ? 'pointer' : 'not-allowed',
                }}
                onClick={() => handleEvent(ev.type)}>
                <span>{ev.label}</span>
                {ev.points === 'us' &&
                  <span style={styles.pointHint}>+1 {ourTeamName}</span>}
                {ev.points === 'them' &&
                  <span style={styles.pointHint}>+1 {opponentName}</span>}
              </button>
            ))}
          </div>

          {lastEvent && (
            <div style={styles.lastEvent}>
              Last logged: <strong>{lastEvent.event_type}</strong>
              {lastEvent.player_id &&
                ` · ${players.find(p => p.id === lastEvent.player_id)?.name ?? 'Unknown'}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { background: '#0f0f1a', minHeight: '100vh', color: 'white' },
  loading: { padding: '40px', color: 'white' },
  scoreHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 24px', background: '#1a1a2e', borderBottom: '1px solid #2a2a4a',
  },
  scoreBlock: { textAlign: 'center', flex: 1 },
  teamLabel: { fontSize: '13px', color: '#aaa', marginBottom: '4px',
    textTransform: 'uppercase', letterSpacing: '0.05em' },
  scoreNum: { fontSize: '64px', fontWeight: '700', lineHeight: 1 },
  setsLabel: { fontSize: '13px', color: '#aaa', marginTop: '4px' },
  scoreMid: {
    flex: 1, textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
  },
  setLabel: { fontSize: '16px', fontWeight: '600', color: '#ccc' },
  setPill: {
    fontSize: '12px', background: '#2a2a4a',
    padding: '3px 10px', borderRadius: '10px', color: '#aaa',
  },
  opponentBtn: {
    marginTop: '4px', padding: '8px 16px', background: '#922b21',
    color: 'white', border: 'none', borderRadius: '8px',
    cursor: 'pointer', fontSize: '13px', fontWeight: '600',
  },
  controls: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '10px 24px', background: '#141428', borderBottom: '1px solid #2a2a4a',
  },
  undoBtn: {
    padding: '8px 16px', background: '#2a2a4a', color: 'white',
    border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px',
  },
  undoMsg: { fontSize: '13px', color: '#2ecc71' },
  endSetBtn: {
    padding: '8px 16px', background: '#d35400', color: 'white',
    border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px',
  },
  endMatchBtn: {
    padding: '8px 16px', background: '#922b21', color: 'white',
    border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px',
  },
  body: { display: 'flex', height: 'calc(100vh - 140px)' },
  playerPanel: {
    width: '220px', background: '#141428', padding: '16px',
    overflowY: 'auto', borderRight: '1px solid #2a2a4a', flexShrink: 0,
  },
  panelTitle: {
    fontSize: '11px', color: '#555', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: '12px',
  },
  playerBtn: {
    width: '100%', padding: '10px 12px', background: '#1e1e38',
    color: 'white', border: '1px solid #2a2a4a', borderRadius: '8px',
    cursor: 'pointer', marginBottom: '8px', textAlign: 'left',
    display: 'flex', flexDirection: 'column', gap: '2px',
  },
  playerBtnActive: { background: '#1a3a6e', border: '1px solid #2e6ab5' },
  jerseyNum: { fontSize: '11px', color: '#666' },
  playerName: { fontSize: '14px', fontWeight: '600' },
  playerPos: { fontSize: '11px', color: '#555' },
  eventPanel: { flex: 1, padding: '20px', overflowY: 'auto' },
  eventGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '12px', marginBottom: '20px',
  },
  eventBtn: {
    padding: '20px 12px', border: 'none', borderRadius: '12px',
    cursor: 'pointer', color: 'white', fontWeight: '700', fontSize: '16px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '6px', minHeight: '80px', justifyContent: 'center',
    transition: 'transform 0.08s, opacity 0.1s',
  },
  pointHint: { fontSize: '11px', fontWeight: '400', opacity: 0.8 },
  lastEvent: {
    fontSize: '13px', color: '#aaa', padding: '10px 14px',
    background: '#1a1a2e', borderRadius: '8px', display: 'inline-block',
  },
};

export default LiveMatch;