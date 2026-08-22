import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPlayersByTeam, getMatches, getTeams } from '../api';

const BASE_URL = 'https://volleyball-analytics-tool-production.up.railway.app';

const authFetch = async (path, options = {}) => {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
};

const apiGetScore = (matchId) => authFetch(`/matches/${matchId}/score`);
const apiLogEvent = (matchId, data) => authFetch(`/matches/${matchId}/event`, { method: 'POST', body: data });
const apiUndoEvent = (matchId) => authFetch(`/matches/${matchId}/event/undo`, { method: 'DELETE' });
const apiEndSet = (matchId) => authFetch(`/matches/${matchId}/end-set`, { method: 'POST' });
const apiCompleteMatch = (matchId) => authFetch(`/matches/${matchId}/complete`, { method: 'POST' });
const apiSaveLineup = (matchId, data) => authFetch(`/matches/${matchId}/lineup`, { method: 'POST', body: data });

const EVENT_GROUPS = [
  {
    label: 'Serve',
    events: [
      { type: 'ace',         label: 'Ace',      color: '#2980b9', points: 'us',   serverOnly: true },
      { type: 'serve',       label: 'Serve',    color: '#1a5276', points: null,   serverOnly: true },
      { type: 'serve_error', label: 'Srv Err',  color: '#c0392b', points: 'them', serverOnly: true },
    ]
  },
  {
    label: 'Attack',
    events: [
      { type: 'kill',       label: 'Kill',     color: '#27ae60', points: 'us'  },
      { type: 'kill_block', label: 'Kill Blk', color: '#8e44ad', points: 'us'  },
      { type: 'spike',      label: 'Spike',    color: '#2c3e50', points: null  },
      { type: 'block',      label: 'Block',    color: '#d35400', points: null  },
    ]
  },
  {
    label: 'Defence',
    events: [
      { type: 'dig',    label: 'Dig',    color: '#16a085', points: null },
      { type: 'assist', label: 'Assist', color: '#7f8c8d', points: null },
    ]
  },
];

const ALL_EVENTS = EVENT_GROUPS.flatMap(g => g.events);

function rotateClockwise(positions) {
  return [positions[1], positions[2], positions[3], positions[4], positions[5], positions[0]];
}

function LiveMatch() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState(window.innerWidth <= 700);

  const [phase, setPhase] = useState('lineup');
  // eslint-disable-next-line no-unused-vars
  const [allPlayers, setAllPlayers] = useState([]);
  const [match, setMatch] = useState(null);
  const [teams, setTeams] = useState([]);
  const [score, setScore] = useState(null);

  const [positions, setPositions] = useState([null,null,null,null,null,null]);
  const [bench, setBench] = useState([]);
  const [liberos, setLiberos] = useState([]);
  const [activeLiberoSwap, setActiveLiberoSwap] = useState(null);
  const [showLiberoPrompt, setShowLiberoPrompt] = useState(false);
  const [pendingMiddle, setPendingMiddle] = useState(null);
  const [pendingMiddlePosIndex, setPendingMiddlePosIndex] = useState(null);

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [weAreServing, setWeAreServing] = useState(false);
  const [subMode, setSubMode] = useState(false);
  const [subTarget, setSubTarget] = useState(null);
  const [lastEvent, setLastEvent] = useState(null);
  const [undoMsg, setUndoMsg] = useState('');
  const [dragging, setDragging] = useState(null);

  useEffect(() => {
    const handleResize = () => setMobile(window.innerWidth <= 700);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchScore = useCallback(() => {
    apiGetScore(matchId).then(data => setScore(data)).catch(() => {});
  }, [matchId]);

  useEffect(() => {
    fetchScore();
    getTeams().then(res => setTeams(res.data));
    getMatches().then(res => {
      const m = res.data.find(m => m.id === parseInt(matchId));
      setMatch(m);
      if (m) {
        getPlayersByTeam(m.our_team_id).then(res => {
          const players = res.data;
          setAllPlayers(players);
          setBench(players);
          setLiberos(players.filter(p => p.position === 'Libero'));
        });
      }
    });
  }, [matchId, fetchScore]);

  const teamName = (id) => teams.find(t => t.id === id)?.name ?? '...';
  const initials = (name) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);

  const assignToPosition = (player, posIndex) => {
    const newPositions = positions.map(p => p?.id === player.id ? null : p);
    const displaced = newPositions[posIndex];
    newPositions[posIndex] = player;
    setPositions(newPositions);
    setBench(prev => {
      const without = prev.filter(p => p.id !== player.id);
      return displaced ? [...without, displaced].sort((a,b) => a.name.localeCompare(b.name)) : without;
    });
  };

  const removeFromPosition = (posIndex) => {
    const player = positions[posIndex];
    if (!player) return;
    setPositions(positions.map((p,i) => i === posIndex ? null : p));
    setBench(prev => [...prev, player].sort((a,b) => a.name.localeCompare(b.name)));
  };

  const handleStartLineup = () => {
    if (positions.filter(Boolean).length < 6) {
      alert(`Fill all 6 positions. Currently ${positions.filter(Boolean).length}/6.`);
      return;
    }
    setPhase('serve_select');
  };

  const handleServeSelect = async (weServe) => {
    setWeAreServing(weServe);
    await apiSaveLineup(matchId, {
      on_court: positions.filter(Boolean).map(p => p.id),
      bench: bench.map(p => p.id),
    });
    setPhase('tracking');
  };

  const isMiddle = (player) => player?.position === 'Middle Blocker';

  const checkLiberoSwapOut = (newPositions, swap) => {
    if (!swap) return { positions: newPositions };
    const libInPos = newPositions.findIndex(p => p?.id === swap.libero.id);
    if (libInPos === 3) {
      const updated = [...newPositions];
      updated[libInPos] = swap.middle;
      return { positions: updated, clearedSwap: true, returnedMiddle: swap.middle, returnedLibero: swap.libero };
    }
    return { positions: newPositions };
  };

  const triggerLiberoPrompt = (middle, posIndex) => {
    if (liberos.length === 0) return;
    setPendingMiddle(middle);
    setPendingMiddlePosIndex(posIndex);
    setShowLiberoPrompt(true);
  };

  const handleLiberoChoice = async (libero) => {
    const newPositions = [...positions];
    newPositions[pendingMiddlePosIndex] = libero;
    const newBench = [...bench.filter(p => p.id !== libero.id), pendingMiddle]
      .sort((a,b) => a.name.localeCompare(b.name));
    setPositions(newPositions);
    setBench(newBench);
    setActiveLiberoSwap({ posIndex: pendingMiddlePosIndex, middle: pendingMiddle, libero });
    setShowLiberoPrompt(false);
    setPendingMiddle(null);
    setPendingMiddlePosIndex(null);
    await apiSaveLineup(matchId, {
      on_court: newPositions.filter(Boolean).map(p => p.id),
      bench: newBench.map(p => p.id),
    });
  };

  const doRotation = (currentPositions, currentBench, currentSwap) => {
    const rotated = rotateClockwise(currentPositions);
    const { positions: final, clearedSwap, returnedMiddle, returnedLibero } =
      checkLiberoSwapOut(rotated, currentSwap);
    let newBench = currentBench;
    let newSwap = currentSwap;
    if (clearedSwap) {
      newSwap = null;
      newBench = [...currentBench.filter(p => p.id !== returnedMiddle.id), returnedLibero]
        .sort((a,b) => a.name.localeCompare(b.name));
    }
    apiSaveLineup(matchId, {
      on_court: final.filter(Boolean).map(p => p.id),
      bench: newBench.map(p => p.id),
    });
    return { positions: final, bench: newBench, swap: newSwap };
  };

  const serverPlayer = positions[0];

  const handleEvent = async (eventType) => {
    const ev = ALL_EVENTS.find(e => e.type === eventType);
    if (!selectedPlayer && eventType !== 'opponent_point' && eventType !== 'our_point') {
      alert('Select a player first');
      return;
    }
    if (ev?.serverOnly && selectedPlayer?.id !== serverPlayer?.id) {
      alert(`Only the server (${serverPlayer?.name ?? 'P1'}) can log ${ev.label}`);
      return;
    }
    const event = {
      match_id: parseInt(matchId),
      player_id: selectedPlayer?.id ?? null,
      event_type: eventType,
      set_number: score?.current_set ?? 1,
    };
    await apiLogEvent(matchId, event);
    setLastEvent({ ...event, playerName: selectedPlayer?.name });
    setSelectedPlayer(null);
    fetchScore();

    if (eventType === 'opponent_point') { setWeAreServing(false); return; }
    if (['kill','ace','our_point','kill_block'].includes(eventType)) {
      if (!weAreServing) {
        const { positions: newPos, bench: newBench, swap: newSwap } =
          doRotation(positions, bench, activeLiberoSwap);
        setPositions(newPos);
        setBench(newBench);
        setActiveLiberoSwap(newSwap);
        setWeAreServing(true);
      }
      return;
    }
    if (eventType === 'serve_error') {
      if (selectedPlayer && isMiddle(selectedPlayer) && serverPlayer?.id === selectedPlayer.id) {
        triggerLiberoPrompt(selectedPlayer, 0);
      }
      setWeAreServing(false);
      return;
    }
  };

  const handleUndo = async () => {
    await apiUndoEvent(matchId);
    setLastEvent(null);
    setUndoMsg('✓');
    setTimeout(() => setUndoMsg(''), 2000);
    fetchScore();
  };

  const handleEndSet = async () => {
    if (!window.confirm(`End set ${score?.current_set}?`)) return;
    await apiEndSet(matchId);
    setSelectedPlayer(null);
    const nextSet = (score?.current_set ?? 1) + 1;
    if (nextSet === 5) setPhase('serve_select');
    else setWeAreServing(prev => !prev);
    fetchScore();
  };

  const handleComplete = async () => {
    if (!window.confirm('End the match?')) return;
    await apiCompleteMatch(matchId);
    navigate('/matches');
  };

  const handleSubOut = (player) => { setSubTarget(player); setSubMode(true); setSelectedPlayer(null); };
  const handleSubIn = async (benchPlayer) => {
    if (!subTarget) return;
    const posIndex = positions.findIndex(p => p?.id === subTarget.id);
    if (posIndex === -1) return;
    const newPositions = [...positions];
    newPositions[posIndex] = benchPlayer;
    const newBench = [...bench.filter(p => p.id !== benchPlayer.id), subTarget]
      .sort((a,b) => a.name.localeCompare(b.name));
    setPositions(newPositions);
    setBench(newBench);
    setSubMode(false);
    setSubTarget(null);
    await apiSaveLineup(matchId, {
      on_court: newPositions.filter(Boolean).map(p => p.id),
      bench: newBench.map(p => p.id),
    });
  };
  const cancelSub = () => { setSubMode(false); setSubTarget(null); };

  if (!score || !match) return <div style={s.loading}>Loading...</div>;

  const ourTeamName = teamName(match.our_team_id);
  const opponentId = match.home_team_id === match.our_team_id ? match.away_team_id : match.home_team_id;
  const opponentName = teamName(opponentId);
  const setsWon = (score.sets||[]).filter(st => st.us > st.them).length;
  const setsLost = (score.sets||[]).filter(st => st.them > st.us).length;

  // ── LINEUP PHASE ─────────────────────────────────────────────
  if (phase === 'lineup') {
    const posLabels = [
      { label: 'P1', sub: 'Server' },
      { label: 'P2', sub: 'Front R' },
      { label: 'P3', sub: 'Front M' },
      { label: 'P4', sub: 'Front L' },
      { label: 'P5', sub: 'Back L' },
      { label: 'P6', sub: 'Back M' },
    ];
    return (
      <div style={s.page}>
        <div style={s.lineupHeader}>
          <div style={s.lineupTitle}>{ourTeamName} vs {opponentName}</div>
          <div style={s.lineupSub}>Tap a player then tap a position · {positions.filter(Boolean).length}/6</div>
        </div>
        <div style={{ ...s.lineupBody, flexDirection: mobile ? 'column' : 'row' }}>
          <div style={{ ...s.lineupLeft, width: mobile ? '100%' : '220px', maxHeight: mobile ? '160px' : 'calc(100vh - 76px)' }}>
            <div style={s.lineupSectionTitle}>Squad</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {bench.map(p => (
                <div key={p.id}
                  style={{ ...(mobile ? s.miniCard : s.lineupPlayerCard), ...(dragging?.id === p.id ? s.lineupPlayerDragging : {}) }}
                  onClick={() => setDragging(dragging?.id === p.id ? null : p)}>
                  {mobile ? (
                    <>
                      <div style={s.miniInitials}>{initials(p.name)}</div>
                      <div style={s.miniNum}>{p.jersey_number ? `#${p.jersey_number}` : ''}</div>
                      {dragging?.id === p.id && <div style={s.miniCheck}>✓</div>}
                    </>
                  ) : (
                    <div style={s.lineupPlayerLeft}>
                      <span style={s.lineupJersey}>{p.jersey_number ? `#${p.jersey_number}` : '—'}</span>
                      <div>
                        <div style={s.lineupPlayerName}>{p.name}</div>
                        <div style={s.lineupPlayerPos}>{p.position ?? 'No position'}</div>
                      </div>
                      {dragging?.id === p.id && <span style={{ color: '#F5C800', fontSize: '11px', marginLeft: '8px' }}>✓</span>}
                    </div>
                  )}
                </div>
              ))}
              {bench.length === 0 && <p style={s.empty}>All assigned</p>}
            </div>
          </div>
          <div style={{ ...s.lineupRight, flex: 1 }}>
            {dragging && <div style={s.draggingHint}>Tap a slot to place <strong>{dragging.name}</strong></div>}
            <div style={s.courtContainer}>
              <div style={s.courtNetLabel}>NET</div>
              <div style={s.courtRow}>
                {[3,2,1].map(i => (
                  <div key={i}
                    style={{ ...s.courtSlot, ...(positions[i] ? s.courtSlotFilled : {}), ...(dragging ? s.courtSlotHighlight : {}) }}
                    onClick={() => {
                      if (dragging) { assignToPosition(dragging, i); setDragging(null); }
                      else if (positions[i]) { setDragging(positions[i]); removeFromPosition(i); }
                    }}>
                    <div style={s.courtPosLabel}>{posLabels[i].label}</div>
                    {positions[i] ? (
                      <>
                        <div style={s.courtJersey}>{positions[i].jersey_number ? `#${positions[i].jersey_number}` : ''}</div>
                        <div style={s.courtSlotName}>{mobile ? initials(positions[i].name) : positions[i].name}</div>
                        {!mobile && <div style={s.courtSlotPos}>{positions[i].position ?? ''}</div>}
                      </>
                    ) : <div style={s.courtSlotEmpty}>{posLabels[i].sub}</div>}
                  </div>
                ))}
              </div>
              <div style={s.courtDivider} />
              <div style={s.courtRow}>
                {[4,5,0].map(i => (
                  <div key={i}
                    style={{ ...s.courtSlot, ...(positions[i] ? s.courtSlotFilled : {}), ...(dragging ? s.courtSlotHighlight : {}), ...(i === 0 ? s.courtSlotServer : {}) }}
                    onClick={() => {
                      if (dragging) { assignToPosition(dragging, i); setDragging(null); }
                      else if (positions[i]) { setDragging(positions[i]); removeFromPosition(i); }
                    }}>
                    <div style={s.courtPosLabel}>{posLabels[i].label}</div>
                    {i === 0 && <div style={s.serverTag}>SRV</div>}
                    {positions[i] ? (
                      <>
                        <div style={s.courtJersey}>{positions[i].jersey_number ? `#${positions[i].jersey_number}` : ''}</div>
                        <div style={s.courtSlotName}>{mobile ? initials(positions[i].name) : positions[i].name}</div>
                        {!mobile && <div style={s.courtSlotPos}>{positions[i].position ?? ''}</div>}
                      </>
                    ) : <div style={s.courtSlotEmpty}>{posLabels[i].sub}</div>}
                  </div>
                ))}
              </div>
              <div style={s.courtBaseLabel}>BASELINE</div>
            </div>
            <button style={{ ...s.startTrackingBtn, opacity: positions.filter(Boolean).length < 6 ? 0.4 : 1 }} onClick={handleStartLineup}>
              Confirm lineup →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── SERVE SELECT ─────────────────────────────────────────────
  if (phase === 'serve_select') {
    return (
      <div style={s.page}>
        <div style={s.serveSelectPage}>
          <div style={s.serveSelectTitle}>{(score?.current_set ?? 1) === 5 ? 'Set 5 — Coin toss' : `Set ${score?.current_set ?? 1}`}</div>
          <div style={s.serveSelectSub}>Who serves first?</div>
          <div style={s.serveSelectBtns}>
            <button style={s.serveBtn} onClick={() => handleServeSelect(true)}>🏐 {ourTeamName} serves first</button>
            <button style={{ ...s.serveBtn, ...s.serveBtnAlt }} onClick={() => handleServeSelect(false)}>{opponentName} serves first</button>
          </div>
        </div>
      </div>
    );
  }

  const LiberoPrompt = () => showLiberoPrompt ? (
    <div style={s.overlay}>
      <div style={s.promptCard}>
        <div style={s.promptTitle}>Libero swap</div>
        <div style={s.promptSub}><strong>{pendingMiddle?.name}</strong> serve error. Which libero?</div>
        <div style={s.promptBtns}>
          {liberos.map(lib => (
            <button key={lib.id} style={s.promptBtn} onClick={() => handleLiberoChoice(lib)}>
              {lib.name}{lib.jersey_number ? ` #${lib.jersey_number}` : ''}
            </button>
          ))}
          <button style={s.promptSkipBtn} onClick={() => { setShowLiberoPrompt(false); setPendingMiddle(null); setPendingMiddlePosIndex(null); }}>Skip</button>
        </div>
      </div>
    </div>
  ) : null;

  // ── MOBILE TRACKING ───────────────────────────────────────────
  if (mobile) {
    const courtDisplayOrder = [
      { posIdx: 3, label: 'P4' },
      { posIdx: 2, label: 'P3' },
      { posIdx: 1, label: 'P2' },
      { posIdx: 4, label: 'P5' },
      { posIdx: 5, label: 'P6' },
      { posIdx: 0, label: 'P1' },
    ];

    return (
      <div style={m.page}>
        <LiberoPrompt />

        <div style={m.scoreBar}>
          <div style={m.scoreTeamBlock}>
            <div style={m.scoreTeamName}>{ourTeamName}</div>
            <div style={m.scoreBig}>{score.current_set_our}</div>
            <div style={m.scoreSets}>{setsWon} sets</div>
          </div>
          <div style={m.scoreMid}>
            <div style={m.scoreSet}>Set {score.current_set}</div>
            <div style={{ fontSize: '10px', color: weAreServing ? '#2ecc71' : '#e74c3c', fontWeight: '600' }}>
              {weAreServing ? '● OUR SERVE' : '● THEIR SERVE'}
            </div>
            <div style={m.ptRow}>
              <button style={m.ptUs} onClick={() => handleEvent('our_point')}>+Us</button>
              <button style={m.ptThem} onClick={() => handleEvent('opponent_point')}>+Them</button>
            </div>
          </div>
          <div style={m.scoreTeamBlock}>
            <div style={m.scoreTeamName}>{opponentName}</div>
            <div style={m.scoreBig}>{score.current_set_opponent}</div>
            <div style={m.scoreSets}>{setsLost} sets</div>
          </div>
        </div>

        <div style={m.courtSection}>
          <div style={m.courtNet}>NET</div>
          <div style={m.courtRow}>
            {courtDisplayOrder.slice(0,3).map(({ posIdx, label }) => {
              const player = positions[posIdx];
              const isSelected = selectedPlayer?.id === player?.id;
              const isServer = posIdx === 0 && weAreServing;
              return (
                <button key={posIdx}
                  style={{ ...m.courtTile, ...(player && isSelected ? m.courtTileSelected : {}), ...(isServer ? m.courtTileServer : {}), ...(subMode && player ? m.courtTileSubMode : {}), ...(!player ? m.courtTileEmpty : {}) }}
                  onClick={() => { if (!player) return; if (subMode) handleSubOut(player); else setSelectedPlayer(isSelected ? null : player); }}>
                  <div style={m.courtTilePos}>{label}</div>
                  {player ? (
                    <>
                      <div style={m.courtTileInitials}>{initials(player.name)}</div>
                      <div style={m.courtTileNum}>{player.jersey_number ? `#${player.jersey_number}` : ''}</div>
                      {activeLiberoSwap?.libero.id === player.id && <div style={m.libBadge}>LIB</div>}
                    </>
                  ) : <div style={m.courtTileEmptyText}>—</div>}
                </button>
              );
            })}
          </div>
          <div style={m.courtBaseline} />
          <div style={m.courtRow}>
            {courtDisplayOrder.slice(3).map(({ posIdx, label }) => {
              const player = positions[posIdx];
              const isSelected = selectedPlayer?.id === player?.id;
              const isServer = posIdx === 0 && weAreServing;
              return (
                <button key={posIdx}
                  style={{ ...m.courtTile, ...(player && isSelected ? m.courtTileSelected : {}), ...(isServer ? m.courtTileServer : {}), ...(subMode && player ? m.courtTileSubMode : {}), ...(!player ? m.courtTileEmpty : {}) }}
                  onClick={() => { if (!player) return; if (subMode) handleSubOut(player); else setSelectedPlayer(isSelected ? null : player); }}>
                  <div style={m.courtTilePos}>{label}{isServer ? ' ▶' : ''}</div>
                  {player ? (
                    <>
                      <div style={m.courtTileInitials}>{initials(player.name)}</div>
                      <div style={m.courtTileNum}>{player.jersey_number ? `#${player.jersey_number}` : ''}</div>
                      {activeLiberoSwap?.libero.id === player.id && <div style={m.libBadge}>LIB</div>}
                    </>
                  ) : <div style={m.courtTileEmptyText}>—</div>}
                </button>
              );
            })}
          </div>
          <div style={m.courtBaselineLabel}>BASELINE</div>
        </div>

        {(bench.length > 0 || subMode) && (
          <div style={m.benchStrip}>
            <div style={m.benchLabel}>{subMode ? 'BENCH — tap to sub in' : 'BENCH'}</div>
            <div style={m.benchRow}>
              {bench.map(p => (
                <button key={p.id}
                  style={{ ...m.benchTile, ...(subMode ? m.benchTileActive : {}) }}
                  onClick={() => subMode && handleSubIn(p)}>
                  <div style={m.benchInitials}>{initials(p.name)}</div>
                  <div style={m.benchNum}>{p.jersey_number ? `#${p.jersey_number}` : '—'}</div>
                </button>
              ))}
              {subMode && <button style={m.cancelSubBtn} onClick={cancelSub}>✕</button>}
            </div>
          </div>
        )}

        <div style={m.statSection}>
          <div style={m.statBanner}>
            {subMode ? (
              <span style={{ color: '#e74c3c' }}>Tap court player to sub out</span>
            ) : selectedPlayer ? (
              <>
                <span style={{ color: '#F5C800', fontWeight: '700' }}>{selectedPlayer.name}</span>
                {selectedPlayer.id === serverPlayer?.id && <span style={{ color: '#2ecc71', fontSize: '10px' }}> (server)</span>}
                <button style={m.clearBtn} onClick={() => setSelectedPlayer(null)}>✕</button>
              </>
            ) : (
              <span style={{ color: '#555' }}>Tap a player on the court above</span>
            )}
          </div>

          {!subMode && (
            <div style={m.statGrid}>
              {EVENT_GROUPS.map(group => {
                const isServeGroup = group.label === 'Serve';
                const canUse = selectedPlayer && (!isServeGroup || selectedPlayer.id === serverPlayer?.id);
                return group.events.map(ev => (
                  <button key={ev.type}
                    style={{ ...m.statBtn, background: ev.color, opacity: canUse ? 1 : 0.2 }}
                    onClick={() => canUse && handleEvent(ev.type)}>
                    <div style={m.statBtnLabel}>{ev.label}</div>
                    {ev.points === 'us' && <div style={m.statBtnPts}>+pt</div>}
                    {ev.points === 'them' && <div style={m.statBtnPts}>opp+</div>}
                  </button>
                ));
              })}
            </div>
          )}

          {lastEvent && (
            <div style={m.lastEventBar}>✓ {lastEvent.event_type}{lastEvent.playerName ? ` · ${lastEvent.playerName}` : ''}</div>
          )}
        </div>

        <div style={m.bottomBar}>
          <button style={m.undoBtn} onClick={handleUndo}>↩{undoMsg}</button>
          <button style={m.endSetBtn} onClick={handleEndSet}>End Set</button>
          <button style={m.endMatchBtn} onClick={handleComplete}>End Match</button>
        </div>
      </div>
    );
  }

  // ── DESKTOP TRACKING ──────────────────────────────────────────
  return (
    <div style={s.page}>
      <LiberoPrompt />
      <div style={s.scoreHeader}>
        <div style={s.scoreBlock}>
          <div style={s.teamLabel}>{ourTeamName}</div>
          <div style={s.scoreNum}>{score.current_set_our}</div>
          <div style={s.setsLabel}>{setsWon} set{setsWon!==1?'s':''}</div>
        </div>
        <div style={s.scoreMid}>
          <div style={s.setLabel}>Set {score.current_set}</div>
          <div>{weAreServing ? <span style={s.servingUs}>● We are serving</span> : <span style={s.servingThem}>● They are serving</span>}</div>
          {(score.sets||[]).map(st => <div key={st.set} style={s.setPill}>S{st.set}: {st.us}–{st.them}</div>)}
          <div style={{ display:'flex', gap:'8px', marginTop:'4px' }}>
            <button style={s.ourBtn} onClick={() => handleEvent('our_point')}>+ {ourTeamName}</button>
            <button style={s.opponentBtn} onClick={() => handleEvent('opponent_point')}>+ {opponentName}</button>
          </div>
        </div>
        <div style={s.scoreBlock}>
          <div style={s.teamLabel}>{opponentName}</div>
          <div style={s.scoreNum}>{score.current_set_opponent}</div>
          <div style={s.setsLabel}>{setsLost} set{setsLost!==1?'s':''}</div>
        </div>
      </div>

      <div style={s.controls}>
        <button style={s.undoBtn} onClick={handleUndo}>↩ Undo</button>
        {undoMsg && <span style={s.undoMsg}>{undoMsg}</span>}
        <div style={{ flex:1 }} />
        <button style={s.endSetBtn} onClick={handleEndSet}>End Set</button>
        <button style={s.endMatchBtn} onClick={handleComplete}>End Match</button>
      </div>

      {subMode && (
        <div style={s.subBanner}>
          <span>Subbing out <strong>{subTarget?.name}</strong> — tap bench player</span>
          <button style={s.subCancelBtn} onClick={cancelSub}>Cancel</button>
        </div>
      )}

      <div style={s.body}>
        <div style={s.playerPanel}>
          <div style={s.rotationMini}>
            <div style={s.rotNetLine2} />
            <div style={s.rotationRow}>
              {[3,2,1].map(i => (
                <div key={i} style={{ ...s.rotationSlot, ...(positions[i]?.id===selectedPlayer?.id?s.rotationSlotSelected:{}) }}>
                  <div style={s.rotPosLabel}>P{i+1}</div>
                  <div style={s.rotName}>{positions[i]?.name?.split(' ')[0] ?? '—'}</div>
                </div>
              ))}
            </div>
            <div style={s.rotDivider} />
            <div style={s.rotationRow}>
              {[4,5,0].map(i => (
                <div key={i} style={{ ...s.rotationSlot, ...(i===0?s.rotationSlotServer:{}), ...(positions[i]?.id===selectedPlayer?.id?s.rotationSlotSelected:{}) }}>
                  <div style={s.rotPosLabel}>P{i===0?1:i+1}</div>
                  <div style={s.rotName}>{positions[i]?.name?.split(' ')[0] ?? '—'}</div>
                  {i===0&&weAreServing&&<div style={s.rotServeTag}>SRV</div>}
                </div>
              ))}
            </div>
          </div>

          <div style={s.panelTitle}>On court</div>
          {positions.map((player, i) => {
            if (!player) return null;
            const isServer = i === 0;
            return (
              <div key={i} style={s.playerSlot}>
                <button
                  style={{ ...s.playerBtn, ...(selectedPlayer?.id===player.id?s.playerBtnActive:{}), ...(subMode?s.playerBtnSubOut:{}), ...(isServer&&weAreServing?s.playerBtnServer:{}) }}
                  onClick={() => { if(subMode) handleSubOut(player); else setSelectedPlayer(selectedPlayer?.id===player.id?null:player); }}>
                  <div style={s.playerBtnTop}>
                    <span style={s.posTag}>P{i===0?1:i+1}</span>
                    {isServer&&weAreServing&&<span style={s.servTag}>SRV</span>}
                    {activeLiberoSwap?.libero.id===player.id&&<span style={s.libTag}>LIB</span>}
                  </div>
                  <span style={s.jerseyNum}>{player.jersey_number?`#${player.jersey_number}`:'—'}</span>
                  <span style={s.playerName}>{player.name}</span>
                  <span style={s.playerPos}>{player.position??''}</span>
                </button>
                {!subMode&&<button style={s.subBtn} onClick={() => handleSubOut(player)}>⇄</button>}
              </div>
            );
          })}

          {bench.length > 0 && (
            <>
              <div style={{...s.panelTitle, marginTop:'12px'}}>{subMode?'👇 Tap to sub in':'Bench'}</div>
              {bench.map(p => (
                <button key={p.id}
                  style={{ ...s.playerBtn, ...s.benchBtn, ...(subMode?s.benchBtnActive:{}) }}
                  onClick={() => subMode&&handleSubIn(p)}>
                  <span style={s.jerseyNum}>{p.jersey_number?`#${p.jersey_number}`:'—'}</span>
                  <span style={s.playerName}>{p.name}</span>
                  <span style={s.playerPos}>{p.position??''}</span>
                </button>
              ))}
            </>
          )}
        </div>

        <div style={s.eventPanel}>
          <div style={s.panelTitle}>
            {subMode?'Tap ⇄ to select who comes off':selectedPlayer?`Logging for ${selectedPlayer.name}`:'Tap a player on the left'}
          </div>
          {EVENT_GROUPS.map(group => {
            const isServeGroup = group.label === 'Serve';
            const canUseGroup = !isServeGroup || selectedPlayer?.id === serverPlayer?.id;
            return (
              <div key={group.label} style={s.eventGroup}>
                <div style={s.eventGroupLabel}>
                  {group.label}
                  {isServeGroup&&serverPlayer&&<span style={s.serverOnlyHint}> — {serverPlayer.name} only</span>}
                </div>
                <div style={s.eventGrid}>
                  {group.events.map(ev => (
                    <button key={ev.type}
                      style={{ ...s.eventBtn, background: ev.color, opacity:(selectedPlayer&&!subMode&&canUseGroup)?1:0.3, cursor:(selectedPlayer&&!subMode&&canUseGroup)?'pointer':'not-allowed' }}
                      onClick={() => !subMode&&handleEvent(ev.type)}>
                      <span>{ev.label}</span>
                      {ev.points==='us'&&<span style={s.pointHint}>+1 {ourTeamName}</span>}
                      {ev.points==='them'&&<span style={s.pointHint}>+1 {opponentName}</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {lastEvent&&(
            <div style={s.lastEvent}>Last: <strong>{lastEvent.event_type}</strong>{lastEvent.playerName&&` · ${lastEvent.playerName}`}</div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { background: '#0f0f1a', minHeight: '100vh', color: 'white' },
  loading: { padding: '40px', color: 'white', background: '#0f0f1a', minHeight: '100vh' },
  lineupHeader: { padding: '16px 20px 12px', background: '#1a1a2e', borderBottom: '1px solid #2a2a4a' },
  lineupTitle: { fontSize: '16px', fontWeight: '700', marginBottom: '3px' },
  lineupSub: { fontSize: '12px', color: '#aaa' },
  lineupBody: { display: 'flex' },
  lineupLeft: { flexShrink: 0, background: '#141428', borderRight: '1px solid #2a2a4a', padding: '12px', overflowY: 'auto' },
  lineupRight: { padding: '16px', overflowY: 'auto' },
  lineupSectionTitle: { fontSize: '10px', color: '#F5C800', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px', fontWeight: '600' },
  lineupPlayerCard: { padding: '8px 10px', background: '#1e1e38', borderRadius: '8px', border: '1px solid #2a2a4a', cursor: 'pointer', display: 'flex', alignItems: 'center', marginBottom: '6px' },
  lineupPlayerDragging: { border: '1px solid #F5C800', background: '#1a1a00' },
  lineupPlayerLeft: { display: 'flex', alignItems: 'center', gap: '10px', flex: 1 },
  lineupJersey: { color: '#F5C800', fontSize: '12px', fontWeight: '700', minWidth: '28px' },
  lineupPlayerName: { fontSize: '13px', fontWeight: '600', marginBottom: '1px' },
  lineupPlayerPos: { fontSize: '11px', color: '#888' },
  miniCard: { width: '52px', height: '52px', background: '#1e1e38', borderRadius: '8px', border: '1px solid #2a2a4a', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' },
  miniInitials: { fontSize: '13px', fontWeight: '700', color: '#f0f0f0' },
  miniNum: { fontSize: '9px', color: '#F5C800', fontWeight: '600' },
  miniCheck: { position: 'absolute', top: '2px', right: '4px', fontSize: '9px', color: '#F5C800' },
  draggingHint: { textAlign: 'center', color: '#F5C800', fontSize: '13px', marginBottom: '10px', padding: '7px', background: '#1a1a00', borderRadius: '6px', border: '1px solid #3a3a00' },
  courtContainer: { background: '#1a1a38', borderRadius: '12px', padding: '12px', marginBottom: '14px', border: '1px solid #2a2a4a' },
  courtNetLabel: { textAlign: 'center', fontSize: '9px', color: '#F5C800', fontWeight: '700', letterSpacing: '0.15em', marginBottom: '8px' },
  courtBaseLabel: { textAlign: 'center', fontSize: '9px', color: '#555', letterSpacing: '0.1em', marginTop: '8px' },
  courtRow: { display: 'flex', gap: '6px', marginBottom: '6px' },
  courtDivider: { height: '2px', background: '#2a2a4a', margin: '6px 0', borderRadius: '1px' },
  courtSlot: { flex: 1, padding: '8px 4px', background: '#1e1e38', borderRadius: '8px', border: '2px dashed #2a2a4a', minHeight: '70px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', cursor: 'pointer', position: 'relative' },
  courtSlotFilled: { border: '2px solid #F5C800', background: '#1a1a00' },
  courtSlotHighlight: { border: '2px dashed #888' },
  courtSlotServer: { border: '2px solid #2ecc71' },
  courtPosLabel: { position: 'absolute', top: '3px', left: '4px', fontSize: '8px', color: '#555', fontWeight: '700' },
  serverTag: { fontSize: '8px', color: '#2ecc71', fontWeight: '700', marginBottom: '2px' },
  courtJersey: { fontSize: '10px', color: '#F5C800', fontWeight: '700', marginBottom: '1px' },
  courtSlotName: { fontSize: '11px', fontWeight: '600', marginBottom: '1px' },
  courtSlotPos: { fontSize: '9px', color: '#888' },
  courtSlotEmpty: { color: '#444', fontSize: '10px' },
  startTrackingBtn: { width: '100%', padding: '13px', background: '#F5C800', color: '#111', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' },
  serveSelectPage: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '16px', padding: '40px' },
  serveSelectTitle: { fontSize: '22px', fontWeight: '700', color: '#F5C800' },
  serveSelectSub: { fontSize: '15px', color: '#aaa', marginBottom: '8px' },
  serveSelectBtns: { display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '320px' },
  serveBtn: { padding: '16px', background: '#1a1a2e', color: 'white', border: '2px solid #F5C800', borderRadius: '12px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  serveBtnAlt: { border: '2px solid #555', background: '#111' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  promptCard: { background: '#1a1a2e', border: '1px solid #F5C800', borderRadius: '16px', padding: '24px', width: '300px', maxWidth: '90vw', textAlign: 'center' },
  promptTitle: { fontSize: '16px', fontWeight: '700', color: '#F5C800', marginBottom: '8px' },
  promptSub: { fontSize: '13px', color: '#ccc', marginBottom: '16px', lineHeight: 1.5 },
  promptBtns: { display: 'flex', flexDirection: 'column', gap: '8px' },
  promptBtn: { padding: '11px', background: '#2a2a4a', color: 'white', border: '1px solid #F5C800', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  promptSkipBtn: { padding: '9px', background: 'transparent', color: '#666', border: '1px solid #333', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' },
  scoreHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: '#1a1a2e', borderBottom: '1px solid #2a2a4a' },
  scoreBlock: { textAlign: 'center', flex: 1 },
  teamLabel: { fontSize: '10px', color: '#aaa', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  scoreNum: { fontSize: '46px', fontWeight: '700', lineHeight: 1 },
  setsLabel: { fontSize: '10px', color: '#aaa', marginTop: '2px' },
  scoreMid: { flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' },
  setLabel: { fontSize: '13px', fontWeight: '600', color: '#ccc' },
  servingUs: { fontSize: '10px', color: '#2ecc71', fontWeight: '600' },
  servingThem: { fontSize: '10px', color: '#e74c3c', fontWeight: '600' },
  setPill: { fontSize: '10px', background: '#2a2a4a', padding: '2px 6px', borderRadius: '8px', color: '#aaa' },
  ourBtn: { padding: '5px 10px', background: '#1a5e38', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '10px', fontWeight: '600' },
  opponentBtn: { padding: '5px 10px', background: '#922b21', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '10px', fontWeight: '600' },
  controls: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', background: '#141428', borderBottom: '1px solid #2a2a4a' },
  undoBtn: { padding: '5px 10px', background: '#2a2a4a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' },
  undoMsg: { fontSize: '10px', color: '#2ecc71' },
  endSetBtn: { padding: '5px 10px', background: '#d35400', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' },
  endMatchBtn: { padding: '5px 10px', background: '#922b21', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' },
  subBanner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 16px', background: '#1a3a00', borderBottom: '1px solid #2a4a00', fontSize: '12px', color: '#aaa' },
  subCancelBtn: { padding: '4px 8px', background: 'transparent', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: '5px', cursor: 'pointer', fontSize: '11px' },
  body: { display: 'flex', height: 'calc(100vh - 120px)' },
  playerPanel: { width: '190px', background: '#141428', padding: '10px', overflowY: 'auto', borderRight: '1px solid #2a2a4a', flexShrink: 0 },
  rotationMini: { background: '#1a1a38', borderRadius: '8px', padding: '6px', marginBottom: '10px', border: '1px solid #2a2a4a' },
  rotNetLine2: { height: '1px', background: '#F5C800', opacity: 0.3, marginBottom: '4px' },
  rotationRow: { display: 'flex', gap: '3px', marginBottom: '3px' },
  rotDivider: { height: '1px', background: '#2a2a4a', margin: '3px 0' },
  rotationSlot: { flex: 1, background: '#1e1e38', borderRadius: '4px', padding: '3px 2px', textAlign: 'center', minHeight: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  rotationSlotSelected: { background: '#1a3a6e', border: '1px solid #2e6ab5' },
  rotationSlotServer: { border: '1px solid #2ecc71' },
  rotPosLabel: { fontSize: '7px', color: '#555', fontWeight: '600' },
  rotName: { fontSize: '8px', color: '#ccc', fontWeight: '600', marginTop: '1px' },
  rotServeTag: { fontSize: '6px', color: '#2ecc71', fontWeight: '700' },
  panelTitle: { fontSize: '9px', color: '#F5C800', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '7px', fontWeight: '600' },
  playerSlot: { display: 'flex', alignItems: 'stretch', gap: '3px', marginBottom: '4px' },
  playerBtn: { flex: 1, padding: '6px 7px', background: '#1e1e38', color: 'white', border: '1px solid #2a2a4a', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '1px' },
  playerBtnTop: { display: 'flex', gap: '3px', alignItems: 'center', marginBottom: '1px' },
  playerBtnActive: { background: '#1a3a6e', border: '1px solid #2e6ab5' },
  playerBtnSubOut: { border: '1px solid #e74c3c' },
  playerBtnServer: { border: '1px solid #2ecc71' },
  posTag: { fontSize: '8px', color: '#555', fontWeight: '700', background: '#2a2a4a', padding: '1px 3px', borderRadius: '3px' },
  servTag: { fontSize: '8px', color: '#2ecc71', fontWeight: '700', background: '#0a2a0a', padding: '1px 3px', borderRadius: '3px' },
  libTag: { fontSize: '8px', color: '#F5C800', fontWeight: '700', background: '#1a1a00', padding: '1px 3px', borderRadius: '3px' },
  benchBtn: { background: '#111120', border: '1px solid #1e1e38', opacity: 0.65, marginBottom: '4px', width: '100%' },
  benchBtnActive: { opacity: 1, border: '1px solid #2ecc71', background: '#0a2a0a', cursor: 'pointer' },
  subBtn: { padding: '0 5px', background: '#2a2a4a', color: '#aaa', border: '1px solid #3a3a5a', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', flexShrink: 0 },
  jerseyNum: { fontSize: '9px', color: '#F5C800' },
  playerName: { fontSize: '11px', fontWeight: '600' },
  playerPos: { fontSize: '9px', color: '#555' },
  eventPanel: { flex: 1, padding: '12px', overflowY: 'auto' },
  eventGroup: { marginBottom: '14px' },
  eventGroupLabel: { fontSize: '10px', color: '#F5C800', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '7px' },
  serverOnlyHint: { color: '#888', fontWeight: '400', textTransform: 'none' },
  eventGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '8px' },
  eventBtn: { padding: '14px 8px', border: 'none', borderRadius: '10px', cursor: 'pointer', color: 'white', fontWeight: '700', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minHeight: '60px', justifyContent: 'center' },
  pointHint: { fontSize: '9px', fontWeight: '400', opacity: 0.8 },
  lastEvent: { fontSize: '11px', color: '#aaa', padding: '6px 10px', background: '#1a1a2e', borderRadius: '6px', display: 'inline-block', marginTop: '8px' },
  empty: { color: '#555', fontSize: '13px' },
};

const m = {
  page: { background: '#0f0f1a', height: '100vh', color: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  scoreBar: { display: 'flex', alignItems: 'center', background: '#1a1a2e', padding: '8px 10px', borderBottom: '1px solid #2a2a4a', flexShrink: 0 },
  scoreTeamBlock: { flex: 1, textAlign: 'center' },
  scoreTeamName: { fontSize: '9px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90px', margin: '0 auto' },
  scoreBig: { fontSize: '34px', fontWeight: '800', color: '#F5C800', lineHeight: 1 },
  scoreSets: { fontSize: '9px', color: '#888', marginTop: '1px' },
  scoreMid: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: '120px' },
  scoreSet: { fontSize: '12px', fontWeight: '700', color: '#ccc' },
  ptRow: { display: 'flex', gap: '5px', marginTop: '3px' },
  ptUs: { padding: '5px 10px', background: '#1a5e38', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' },
  ptThem: { padding: '5px 10px', background: '#922b21', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' },
  courtSection: { background: '#141428', padding: '8px 10px 4px', flexShrink: 0 },
  courtNet: { textAlign: 'center', fontSize: '9px', color: '#F5C800', fontWeight: '700', letterSpacing: '0.15em', marginBottom: '5px' },
  courtRow: { display: 'flex', gap: '5px', marginBottom: '5px' },
  courtBaseline: { height: '1px', background: '#2a2a4a', marginBottom: '3px' },
  courtBaselineLabel: { textAlign: 'center', fontSize: '8px', color: '#444', letterSpacing: '0.1em', marginBottom: '3px' },
  courtTile: { flex: 1, height: '68px', background: '#1e1e38', border: '2px solid #2a2a4a', borderRadius: '10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '3px' },
  courtTileSelected: { background: '#1a3a6e', border: '2px solid #4a90d9' },
  courtTileServer: { border: '2px solid #2ecc71', background: '#0a1a0a' },
  courtTileSubMode: { border: '2px solid #e74c3c' },
  courtTileEmpty: { background: '#111120', border: '2px dashed #222', cursor: 'default' },
  courtTileEmptyText: { color: '#333', fontSize: '16px' },
  courtTilePos: { position: 'absolute', top: '3px', left: '5px', fontSize: '8px', color: '#555', fontWeight: '700' },
  courtTileInitials: { fontSize: '17px', fontWeight: '800', color: '#f0f0f0', lineHeight: 1 },
  courtTileNum: { fontSize: '10px', color: '#F5C800', fontWeight: '600', marginTop: '2px' },
  libBadge: { position: 'absolute', top: '2px', right: '3px', fontSize: '7px', color: '#F5C800', fontWeight: '700', background: '#1a1a00', padding: '1px 3px', borderRadius: '3px' },
  benchStrip: { background: '#0f0f1a', padding: '5px 10px', borderTop: '1px solid #1a1a2e', flexShrink: 0 },
  benchLabel: { fontSize: '8px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' },
  benchRow: { display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' },
  benchTile: { width: '44px', height: '44px', background: '#111120', border: '1px solid #1e1e38', borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.6 },
  benchTileActive: { opacity: 1, border: '2px solid #2ecc71', background: '#0a2a0a', cursor: 'pointer' },
  benchInitials: { fontSize: '12px', fontWeight: '700', color: '#ccc' },
  benchNum: { fontSize: '8px', color: '#888', marginTop: '1px' },
  cancelSubBtn: { padding: '6px 10px', background: 'transparent', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' },
  statSection: { flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 10px', overflow: 'hidden' },
  statBanner: { fontSize: '12px', color: '#ccc', marginBottom: '6px', minHeight: '18px', display: 'flex', alignItems: 'center', gap: '5px' },
  clearBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '14px', marginLeft: '4px', padding: '0' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px', flex: 1 },
  statBtn: { border: 'none', borderRadius: '10px', cursor: 'pointer', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 4px' },
  statBtnLabel: { fontSize: '12px', fontWeight: '700', lineHeight: 1 },
  statBtnPts: { fontSize: '9px', fontWeight: '400', opacity: 0.8, marginTop: '2px' },
  lastEventBar: { fontSize: '10px', color: '#2ecc71', marginTop: '4px', padding: '4px 8px', background: '#0a2a0a', borderRadius: '6px' },
  bottomBar: { display: 'flex', gap: '6px', padding: '7px 10px', background: '#141428', borderTop: '1px solid #2a2a4a', flexShrink: 0 },
  undoBtn: { padding: '10px 14px', background: '#2a2a4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', minWidth: '60px' },
  endSetBtn: { flex: 1, padding: '10px', background: '#d35400', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  endMatchBtn: { flex: 1, padding: '10px', background: '#922b21', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
};

export default LiveMatch;