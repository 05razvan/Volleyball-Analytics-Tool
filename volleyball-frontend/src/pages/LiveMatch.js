import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getScore, logEvent, undoEvent, endSet,
         completeMatch, getPlayersByTeam, getMatches, getTeams } from '../api';

const EVENTS = [
  { type: 'kill',        label: 'Kill',        color: '#27ae60', points: 'us'   },
  { type: 'ace',         label: 'Ace',         color: '#2980b9', points: 'us'   },
  { type: 'spike',       label: 'Spike',       color: '#8e44ad', points: null   },
  { type: 'dig',         label: 'Dig',         color: '#16a085', points: null   },
  { type: 'block',       label: 'Block',       color: '#d35400', points: null   },
  { type: 'assist',      label: 'Assist',      color: '#7f8c8d', points: null   },
  { type: 'serve_error', label: 'Serve Error', color: '#c0392b', points: 'them' },
];

const MAX_ON_COURT = 7;

function LiveMatch() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState('lineup');
  const [score, setScore] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [match, setMatch] = useState(null);
  const [teams, setTeams] = useState([]);
  const [onCourt, setOnCourt] = useState([]);
  const [bench, setBench] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [subMode, setSubMode] = useState(false);
  const [subTarget, setSubTarget] = useState(null);
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
        getPlayersByTeam(m.our_team_id).then(res => {
          setAllPlayers(res.data);
          setBench(res.data);
        });
      }
    });
  }, [matchId, fetchScore]);

  const teamName = (id) => teams.find(t => t.id === id)?.name ?? '...';

  const toggleLineup = (player) => {
    const isOn = onCourt.find(p => p.id === player.id);
    if (isOn) {
      setOnCourt(onCourt.filter(p => p.id !== player.id));
      setBench(prev => [...prev, player]
        .sort((a, b) => a.name.localeCompare(b.name)));
    } else {
      if (onCourt.length >= MAX_ON_COURT) return;
      setOnCourt([...onCourt, player]);
      setBench(bench.filter(p => p.id !== player.id));
    }
  };

  const handleStartTracking = () => {
    if (onCourt.length === 0) {
      alert('Select at least 1 player to start.');
      return;
    }
    setPhase('tracking');
  };

  const handleEvent = async (eventType) => {
    if (!selectedPlayer &&
        eventType !== 'opponent_point' &&
        eventType !== 'our_point') {
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
    setSelectedPlayer(null);
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
    setSelectedPlayer(null);
    fetchScore();
  };

  const handleComplete = async () => {
    if (!window.confirm('End the match?')) return;
    await completeMatch(matchId);
    navigate('/matches');
  };

  const handleSubOut = (player) => {
    setSubTarget(player);
    setSubMode(true);
    setSelectedPlayer(null);
  };

  const handleSubIn = (benchPlayer) => {
    if (!subTarget) return;
    setOnCourt(onCourt.map(p =>
      p.id === subTarget.id ? benchPlayer : p));
    setBench(prev => [...prev.filter(p => p.id !== benchPlayer.id), subTarget]
      .sort((a, b) => a.name.localeCompare(b.name)));
    setSubMode(false);
    setSubTarget(null);
  };

  const cancelSub = () => {
    setSubMode(false);
    setSubTarget(null);
  };

  if (!score || !match) {
    return <div style={styles.loading}>Loading match...</div>;
  }

  const ourTeamName = teamName(match.our_team_id);
  const opponentId = match.home_team_id === match.our_team_id
    ? match.away_team_id : match.home_team_id;
  const opponentName = teamName(opponentId);
  const setsWon = (score.sets || []).filter(s => s.us > s.them).length;
  const setsLost = (score.sets || []).filter(s => s.them > s.us).length;

  // =====================
  // LINEUP PHASE
  // =====================
  if (phase === 'lineup') {
    return (
      <div style={styles.page}>
        <div style={styles.lineupHeader}>
          <div style={styles.lineupTitle}>
            {ourTeamName} vs {opponentName}
          </div>
          <div style={styles.lineupSub}>
            Select your starting {MAX_ON_COURT} (including libero)
          </div>
        </div>

        <div style={styles.lineupBody}>
          <div style={styles.lineupLeft}>
            <div style={styles.lineupSectionTitle}>
              Full squad ({allPlayers.length})
            </div>
            <div style={styles.lineupList}>
              {allPlayers.map(p => {
                const isSelected = !!onCourt.find(x => x.id === p.id);
                const isFull = onCourt.length >= MAX_ON_COURT && !isSelected;
                return (
                  <div
                    key={p.id}
                    style={{
                      ...styles.lineupPlayerCard,
                      ...(isSelected ? styles.lineupPlayerSelected : {}),
                      ...(isFull ? styles.lineupPlayerDisabled : {}),
                    }}
                    onClick={() => !isFull && toggleLineup(p)}>
                    <div style={styles.lineupPlayerLeft}>
                      {p.jersey_number && (
                        <span style={styles.lineupJersey}>
                          #{p.jersey_number}
                        </span>
                      )}
                      <div>
                        <div style={styles.lineupPlayerName}>{p.name}</div>
                        <div style={styles.lineupPlayerPos}>
                          {p.position ?? 'No position'}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <span style={styles.lineupCheck}>✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={styles.lineupRight}>
            <div style={styles.lineupSectionTitle}>
              Starting lineup ({onCourt.length}/{MAX_ON_COURT})
            </div>

            <div style={styles.courtGrid}>
              {Array.from({ length: MAX_ON_COURT }).map((_, i) => {
                const player = onCourt[i];
                return (
                  <div
                    key={i}
                    style={{
                      ...styles.courtSlot,
                      ...(player ? styles.courtSlotFilled : {}),
                    }}
                    onClick={() => player && toggleLineup(player)}>
                    {player ? (
                      <>
                        {player.jersey_number && (
                          <div style={styles.courtJersey}>
                            #{player.jersey_number}
                          </div>
                        )}
                        <div style={styles.courtSlotName}>{player.name}</div>
                        <div style={styles.courtSlotPos}>
                          {player.position ?? '—'}
                        </div>
                        <div style={styles.courtSlotRemove}>✕ tap to remove</div>
                      </>
                    ) : (
                      <div style={styles.courtSlotEmpty}>
                        {i === 6 ? 'Libero slot' : `Player ${i + 1}`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              style={{
                ...styles.startTrackingBtn,
                opacity: onCourt.length === 0 ? 0.4 : 1,
              }}
              onClick={handleStartTracking}>
              Start tracking →
            </button>

            {onCourt.length > 0 && onCourt.length < MAX_ON_COURT && (
              <p style={styles.lineupHint}>
                You can start with {onCourt.length} player
                {onCourt.length !== 1 ? 's' : ''} if needed
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =====================
  // TRACKING PHASE
  // =====================
  return (
    <div style={styles.page}>

      <div style={styles.scoreHeader}>
        <div style={styles.scoreBlock}>
          <div style={styles.teamLabel}>{ourTeamName}</div>
          <div style={styles.scoreNum}>{score.current_set_our}</div>
          <div style={styles.setsLabel}>
            {setsWon} set{setsWon !== 1 ? 's' : ''}
          </div>
        </div>

        <div style={styles.scoreMid}>
          <div style={styles.setLabel}>Set {score.current_set}</div>
          {(score.sets || []).map(s => (
            <div key={s.set} style={styles.setPill}>
              S{s.set}: {s.us}–{s.them}
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button style={styles.ourBtn}
              onClick={() => handleEvent('our_point')}>
              + {ourTeamName}
            </button>
            <button style={styles.opponentBtn}
              onClick={() => handleEvent('opponent_point')}>
              + {opponentName}
            </button>
          </div>
        </div>

        <div style={styles.scoreBlock}>
          <div style={styles.teamLabel}>{opponentName}</div>
          <div style={styles.scoreNum}>{score.current_set_opponent}</div>
          <div style={styles.setsLabel}>
            {setsLost} set{setsLost !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div style={styles.controls}>
        <button style={styles.undoBtn} onClick={handleUndo}>↩ Undo</button>
        {undoMsg && <span style={styles.undoMsg}>{undoMsg}</span>}
        <div style={{ flex: 1 }} />
        <button style={styles.endSetBtn} onClick={handleEndSet}>
          End Set
        </button>
        <button style={styles.endMatchBtn} onClick={handleComplete}>
          End Match
        </button>
      </div>

      {subMode && (
        <div style={styles.subBanner}>
          <span>
            Subbing out <strong>{subTarget?.name}</strong> —
            tap a bench player to bring them on
          </span>
          <button style={styles.subCancelBtn} onClick={cancelSub}>
            Cancel
          </button>
        </div>
      )}

      <div style={styles.body}>
        <div style={styles.playerPanel}>
          <div style={styles.panelTitle}>On court</div>
          {onCourt.map(p => (
            <div key={p.id} style={styles.playerSlot}>
              <button
                style={{
                  ...styles.playerBtn,
                  ...(selectedPlayer?.id === p.id
                    ? styles.playerBtnActive : {}),
                  ...(subMode ? styles.playerBtnSubOut : {}),
                }}
                onClick={() => {
                  if (subMode) {
                    handleSubOut(p);
                  } else {
                    setSelectedPlayer(
                      selectedPlayer?.id === p.id ? null : p
                    );
                  }
                }}>
                <span style={styles.jerseyNum}>
                  {p.jersey_number ? `#${p.jersey_number}` : '—'}
                </span>
                <span style={styles.playerName}>{p.name}</span>
                <span style={styles.playerPos}>
                  {p.position ?? 'No position'}
                </span>
              </button>
              {!subMode && (
                <button
                  style={styles.subBtn}
                  onClick={() => handleSubOut(p)}
                  title="Sub out">
                  ⇄
                </button>
              )}
            </div>
          ))}

          {bench.length > 0 && (
            <>
              <div style={{ ...styles.panelTitle, marginTop: '16px' }}>
                {subMode ? '👇 Tap to sub in' : 'Bench'}
              </div>
              {bench.map(p => (
                <button
                  key={p.id}
                  style={{
                    ...styles.playerBtn,
                    ...styles.benchBtn,
                    ...(subMode ? styles.benchBtnActive : {}),
                  }}
                  onClick={() => subMode && handleSubIn(p)}>
                  <span style={styles.jerseyNum}>
                    {p.jersey_number ? `#${p.jersey_number}` : '—'}
                  </span>
                  <span style={styles.playerName}>{p.name}</span>
                  <span style={styles.playerPos}>
                    {p.position ?? 'No position'}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>

        <div style={styles.eventPanel}>
          <div style={styles.panelTitle}>
            {subMode
              ? 'Tap ⇄ on a player to sub them out'
              : selectedPlayer
                ? `Logging for ${selectedPlayer.name}`
                : 'Select a player on the left'}
          </div>
          <div style={styles.eventGrid}>
            {EVENTS.map(ev => (
              <button
                key={ev.type}
                style={{
                  ...styles.eventBtn,
                  background: ev.color,
                  opacity: (selectedPlayer && !subMode) ? 1 : 0.35,
                  cursor: (selectedPlayer && !subMode)
                    ? 'pointer' : 'not-allowed',
                }}
                onClick={() => !subMode && handleEvent(ev.type)}>
                <span>{ev.label}</span>
                {ev.points === 'us' && (
                  <span style={styles.pointHint}>+1 {ourTeamName}</span>
                )}
                {ev.points === 'them' && (
                  <span style={styles.pointHint}>+1 {opponentName}</span>
                )}
              </button>
            ))}
          </div>

          {lastEvent && (
            <div style={styles.lastEvent}>
              Last: <strong>{lastEvent.event_type}</strong>
              {lastEvent.player_id && ` · ${
                [...onCourt, ...bench]
                  .find(p => p.id === lastEvent.player_id)?.name
                  ?? 'Unknown'
              }`}
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
  lineupHeader: {
    padding: '24px 32px 16px', background: '#1a1a2e',
    borderBottom: '1px solid #2a2a4a',
  },
  lineupTitle: { fontSize: '20px', fontWeight: '700', marginBottom: '4px' },
  lineupSub: { fontSize: '14px', color: '#aaa' },
  lineupBody: { display: 'flex', height: 'calc(100vh - 88px)' },
  lineupLeft: {
    width: '280px', flexShrink: 0, background: '#141428',
    borderRight: '1px solid #2a2a4a', padding: '16px', overflowY: 'auto',
  },
  lineupRight: { flex: 1, padding: '24px', overflowY: 'auto' },
  lineupSectionTitle: {
    fontSize: '11px', color: '#F5C800', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: '12px', fontWeight: '600',
  },
  lineupList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  lineupPlayerCard: {
    padding: '10px 12px', background: '#1e1e38', borderRadius: '8px',
    border: '1px solid #2a2a4a', cursor: 'pointer',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  lineupPlayerSelected: { background: '#1a3a1a', border: '1px solid #2ecc71' },
  lineupPlayerDisabled: { opacity: 0.35, cursor: 'not-allowed' },
  lineupPlayerLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
  lineupJersey: { color: '#F5C800', fontSize: '12px', fontWeight: '600', minWidth: '28px' },
  lineupPlayerName: { fontSize: '14px', fontWeight: '600', marginBottom: '2px' },
  lineupPlayerPos: { fontSize: '11px', color: '#888' },
  lineupCheck: { color: '#2ecc71', fontWeight: '700', fontSize: '16px' },
  courtGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '10px', marginBottom: '20px',
  },
  courtSlot: {
    padding: '14px', background: '#1e1e38', borderRadius: '10px',
    border: '2px dashed #2a2a4a', minHeight: '90px',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', textAlign: 'center',
  },
  courtSlotFilled: {
    border: '2px solid #F5C800', background: '#1a1a00', cursor: 'pointer',
  },
  courtJersey: { color: '#F5C800', fontSize: '11px', marginBottom: '3px' },
  courtSlotName: { fontSize: '13px', fontWeight: '600', marginBottom: '2px' },
  courtSlotPos: { fontSize: '11px', color: '#888', marginBottom: '4px' },
  courtSlotRemove: { fontSize: '10px', color: '#555' },
  courtSlotEmpty: { color: '#444', fontSize: '12px' },
  startTrackingBtn: {
    width: '100%', padding: '14px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '10px', cursor: 'pointer',
    fontSize: '16px', fontWeight: '700',
  },
  lineupHint: {
    color: '#555', fontSize: '12px', marginTop: '10px', textAlign: 'center',
  },
  scoreHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 24px', background: '#1a1a2e',
    borderBottom: '1px solid #2a2a4a',
  },
  scoreBlock: { textAlign: 'center', flex: 1 },
  teamLabel: {
    fontSize: '12px', color: '#aaa', marginBottom: '4px',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  scoreNum: { fontSize: '56px', fontWeight: '700', lineHeight: 1 },
  setsLabel: { fontSize: '12px', color: '#aaa', marginTop: '4px' },
  scoreMid: {
    flex: 1, textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
  },
  setLabel: { fontSize: '15px', fontWeight: '600', color: '#ccc' },
  setPill: {
    fontSize: '11px', background: '#2a2a4a',
    padding: '2px 8px', borderRadius: '10px', color: '#aaa',
  },
  ourBtn: {
    padding: '7px 14px', background: '#1a5e38', color: 'white',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontSize: '12px', fontWeight: '600',
  },
  opponentBtn: {
    padding: '7px 14px', background: '#922b21', color: 'white',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontSize: '12px', fontWeight: '600',
  },
  controls: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '8px 24px', background: '#141428',
    borderBottom: '1px solid #2a2a4a',
  },
  undoBtn: {
    padding: '7px 14px', background: '#2a2a4a', color: 'white',
    border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
  },
  undoMsg: { fontSize: '12px', color: '#2ecc71' },
  endSetBtn: {
    padding: '7px 14px', background: '#d35400', color: 'white',
    border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
  },
  endMatchBtn: {
    padding: '7px 14px', background: '#922b21', color: 'white',
    border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
  },
  subBanner: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 24px', background: '#1a3a00',
    borderBottom: '1px solid #2a4a00', fontSize: '14px', color: '#aaa',
  },
  subCancelBtn: {
    padding: '5px 12px', background: 'transparent', color: '#e74c3c',
    border: '1px solid #e74c3c', borderRadius: '6px',
    cursor: 'pointer', fontSize: '12px',
  },
  body: { display: 'flex', height: 'calc(100vh - 130px)' },
  playerPanel: {
    width: '200px', background: '#141428', padding: '14px',
    overflowY: 'auto', borderRight: '1px solid #2a2a4a', flexShrink: 0,
  },
  panelTitle: {
    fontSize: '10px', color: '#F5C800', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: '10px', fontWeight: '600',
  },
  playerSlot: { display: 'flex', alignItems: 'stretch', gap: '4px', marginBottom: '6px' },
  playerBtn: {
    flex: 1, padding: '8px 10px', background: '#1e1e38',
    color: 'white', border: '1px solid #2a2a4a', borderRadius: '8px',
    cursor: 'pointer', textAlign: 'left',
    display: 'flex', flexDirection: 'column', gap: '1px',
  },
  playerBtnActive: { background: '#1a3a6e', border: '1px solid #2e6ab5' },
  playerBtnSubOut: { border: '1px solid #e74c3c' },
  benchBtn: {
    background: '#111120', border: '1px solid #1e1e38',
    opacity: 0.7, marginBottom: '6px', width: '100%',
  },
  benchBtnActive: {
    opacity: 1, border: '1px solid #2ecc71',
    background: '#0a2a0a', cursor: 'pointer',
  },
  subBtn: {
    padding: '0 8px', background: '#2a2a4a', color: '#aaa',
    border: '1px solid #3a3a5a', borderRadius: '6px',
    cursor: 'pointer', fontSize: '14px', flexShrink: 0,
  },
  jerseyNum: { fontSize: '10px', color: '#F5C800' },
  playerName: { fontSize: '13px', fontWeight: '600' },
  playerPos: { fontSize: '10px', color: '#555' },
  eventPanel: { flex: 1, padding: '16px', overflowY: 'auto' },
  eventGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '10px', marginBottom: '16px',
  },
  eventBtn: {
    padding: '18px 10px', border: 'none', borderRadius: '12px',
    cursor: 'pointer', color: 'white', fontWeight: '700', fontSize: '15px',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: '5px', minHeight: '75px',
    justifyContent: 'center',
  },
  pointHint: { fontSize: '10px', fontWeight: '400', opacity: 0.8 },
  lastEvent: {
    fontSize: '12px', color: '#aaa', padding: '8px 12px',
    background: '#1a1a2e', borderRadius: '6px', display: 'inline-block',
  },
};

export default LiveMatch;