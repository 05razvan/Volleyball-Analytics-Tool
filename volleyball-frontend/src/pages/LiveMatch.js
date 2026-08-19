import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getScore, logEvent, undoEvent, endSet,
         completeMatch, getPlayersByTeam, getMatches,
         getTeams, saveLineup } from '../api';

// grouped and ordered
const EVENT_GROUPS = [
  {
    label: 'Serve',
    events: [
      { type: 'ace',         label: 'Ace',         color: '#2980b9', points: 'us',   serverOnly: true },
      { type: 'serve',       label: 'Serve',       color: '#1a5276', points: null,   serverOnly: true },
      { type: 'serve_error', label: 'Serve Error', color: '#c0392b', points: 'them', serverOnly: true },
    ]
  },
  {
    label: 'Attack',
    events: [
      { type: 'kill',   label: 'Kill',   color: '#27ae60', points: 'us'  },
      { type: 'spike',  label: 'Spike',  color: '#8e44ad', points: null  },
      { type: 'block',  label: 'Block',  color: '#d35400', points: null  },
    ]
  },
  {
    label: 'Defence',
    events: [
      { type: 'dig',    label: 'Dig',    color: '#16a085', points: null  },
      { type: 'assist', label: 'Assist', color: '#7f8c8d', points: null  },
    ]
  },
];

const ALL_EVENTS = EVENT_GROUPS.flatMap(g => g.events);

function rotateClockwise(positions) {
  return [
    positions[1],
    positions[2],
    positions[3],
    positions[4],
    positions[5],
    positions[0],
  ];
}


function LiveMatch() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  // eslint-disable-next-line no-unused-vars
  const [allPlayers, setAllPlayers] = useState([]);  const [match, setMatch] = useState(null);
  const [phase, setPhase] = useState('lineup');
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
          const players = res.data;
          setAllPlayers(players);
          setBench(players);
          setLiberos(players.filter(p => p.position === 'Libero'));
        });
      }
    });
  }, [matchId, fetchScore]);

  const teamName = (id) => teams.find(t => t.id === id)?.name ?? '...';

  const assignToPosition = (player, posIndex) => {
    const newPositions = positions.map(p => p?.id === player.id ? null : p);
    const displaced = newPositions[posIndex];
    newPositions[posIndex] = player;
    setPositions(newPositions);
    setBench(prev => {
      const withoutPlayer = prev.filter(p => p.id !== player.id);
      return displaced
        ? [...withoutPlayer, displaced].sort((a,b) => a.name.localeCompare(b.name))
        : withoutPlayer;
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
      alert(`Please fill all 6 positions. Currently ${positions.filter(Boolean).length}/6.`);
      return;
    }
    setPhase('serve_select');
  };

  const handleServeSelect = async (weServe) => {
    setWeAreServing(weServe);
    const onCourt = positions.filter(Boolean);
    await saveLineup(matchId, {
      on_court: onCourt.map(p => p.id),
      bench: bench.map(p => p.id),
    });
    setPhase('tracking');
  };

  const isMiddle = (player) => player?.position === 'Middle Blocker';

  const checkLiberoSwapOut = (newPositions, swap) => {
    if (!swap) return { positions: newPositions };
    const libInPos = newPositions.findIndex(p => p?.id === swap.libero.id);
    // libero must leave at P4 (index 3) — first front row position they reach
    if (libInPos === 3) {
      const updated = [...newPositions];
      updated[libInPos] = swap.middle;
      return {
        positions: updated,
        clearedSwap: true,
        returnedMiddle: swap.middle,
        returnedLibero: swap.libero,
      };
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
    const newBench = [
      ...bench.filter(p => p.id !== libero.id),
      pendingMiddle,
    ].sort((a,b) => a.name.localeCompare(b.name));
    setPositions(newPositions);
    setBench(newBench);
    setActiveLiberoSwap({
      posIndex: pendingMiddlePosIndex,
      middle: pendingMiddle,
      libero,
    });
    setShowLiberoPrompt(false);
    setPendingMiddle(null);
    setPendingMiddlePosIndex(null);
    await saveLineup(matchId, {
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
      newBench = [
        ...currentBench.filter(p => p.id !== returnedMiddle.id),
        returnedLibero,
      ].sort((a,b) => a.name.localeCompare(b.name));
    }

    saveLineup(matchId, {
      on_court: final.filter(Boolean).map(p => p.id),
      bench: newBench.map(p => p.id),
    });

    return { positions: final, bench: newBench, swap: newSwap };
  };

  // who is currently the server (P1)
  const serverPlayer = positions[0];

  const handleEvent = async (eventType) => {
    const ev = ALL_EVENTS.find(e => e.type === eventType);

    if (!selectedPlayer &&
        eventType !== 'opponent_point' &&
        eventType !== 'our_point') {
      alert('Select a player first');
      return;
    }

    // enforce server-only events
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

    await logEvent(matchId, event);
    setLastEvent({ ...event, playerName: selectedPlayer?.name });
    setSelectedPlayer(null);
    fetchScore();

    if (eventType === 'opponent_point') {
      setWeAreServing(false);
      return;
    }

    if (eventType === 'kill' || eventType === 'ace' || eventType === 'our_point') {
      if (!weAreServing) {
        // sideout — rotate
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
      // check if middle in P1 — trigger libero prompt
      if (selectedPlayer && isMiddle(selectedPlayer) &&
          serverPlayer?.id === selectedPlayer.id) {
        triggerLiberoPrompt(selectedPlayer, 0);
      }
      setWeAreServing(false);
      return;
    }

    // serve (not ace, not error) — no score change, no rotation
    // dig, block, assist, spike — no score change
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
    const nextSet = (score?.current_set ?? 1) + 1;
    if (nextSet === 5) {
      setPhase('serve_select');
    } else {
      setWeAreServing(prev => !prev);
    }
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

  const handleSubIn = async (benchPlayer) => {
    if (!subTarget) return;
    const posIndex = positions.findIndex(p => p?.id === subTarget.id);
    if (posIndex === -1) return;
    const newPositions = [...positions];
    newPositions[posIndex] = benchPlayer;
    const newBench = [
      ...bench.filter(p => p.id !== benchPlayer.id),
      subTarget,
    ].sort((a,b) => a.name.localeCompare(b.name));
    setPositions(newPositions);
    setBench(newBench);
    setSubMode(false);
    setSubTarget(null);
    await saveLineup(matchId, {
      on_court: newPositions.filter(Boolean).map(p => p.id),
      bench: newBench.map(p => p.id),
    });
  };

  const cancelSub = () => { setSubMode(false); setSubTarget(null); };

  if (!score || !match) return <div style={styles.loading}>Loading...</div>;

  const ourTeamName = teamName(match.our_team_id);
  const opponentId = match.home_team_id === match.our_team_id
    ? match.away_team_id : match.home_team_id;
  const opponentName = teamName(opponentId);
  const setsWon = (score.sets||[]).filter(s => s.us > s.them).length;
  const setsLost = (score.sets||[]).filter(s => s.them > s.us).length;

  // ── LINEUP PHASE ──────────────────────────────────────────────
  if (phase === 'lineup') {
    const posLabels = [
      { label: 'P1', sub: 'Server',       },
      { label: 'P2', sub: 'Front right',  },
      { label: 'P3', sub: 'Front middle', },
      { label: 'P4', sub: 'Front left',   },
      { label: 'P5', sub: 'Back left',    },
      { label: 'P6', sub: 'Back middle',  },
    ];

    return (
      <div style={styles.page}>
        <div style={styles.lineupHeader}>
          <div style={styles.lineupTitle}>{ourTeamName} vs {opponentName}</div>
          <div style={styles.lineupSub}>
            Assign players to their starting positions
          </div>
        </div>

        <div style={styles.lineupBody}>
          <div style={styles.lineupLeft}>
            <div style={styles.lineupSectionTitle}>
              Squad — tap to select, then tap a position
            </div>
            <div style={styles.lineupList}>
              {bench.map(p => (
                <div key={p.id}
                  style={{
                    ...styles.lineupPlayerCard,
                    ...(dragging?.id === p.id ? styles.lineupPlayerDragging : {}),
                  }}
                  onClick={() => setDragging(dragging?.id === p.id ? null : p)}>
                  <div style={styles.lineupPlayerLeft}>
                    <span style={styles.lineupJersey}>
                      {p.jersey_number ? `#${p.jersey_number}` : '—'}
                    </span>
                    <div>
                      <div style={styles.lineupPlayerName}>{p.name}</div>
                      <div style={styles.lineupPlayerPos}>
                        {p.position ?? 'No position'}
                      </div>
                    </div>
                  </div>
                  {dragging?.id === p.id && (
                    <span style={styles.selectedIndicator}>Selected ✓</span>
                  )}
                </div>
              ))}
              {bench.length === 0 && (
                <p style={styles.empty}>All players assigned</p>
              )}
            </div>
          </div>

          <div style={styles.lineupRight}>
            <div style={styles.lineupSectionTitle}>
              Court — {positions.filter(Boolean).length}/6 assigned
            </div>

            <div style={styles.courtContainer}>
              <div style={styles.courtNetLabel}>NET</div>
              <div style={styles.courtRow}>
                {[3,2,1].map(i => (
                  <div key={i}
                    style={{
                      ...styles.courtSlot,
                      ...(positions[i] ? styles.courtSlotFilled : {}),
                      ...(dragging ? styles.courtSlotHighlight : {}),
                    }}
                    onClick={() => {
                      if (dragging) { assignToPosition(dragging, i); setDragging(null); }
                      else if (positions[i]) { setDragging(positions[i]); removeFromPosition(i); }
                    }}>
                    <div style={styles.courtPosLabel}>{posLabels[i].label}</div>
                    {positions[i] ? (
                      <>
                        <div style={styles.courtJersey}>
                          {positions[i].jersey_number ? `#${positions[i].jersey_number}` : ''}
                        </div>
                        <div style={styles.courtSlotName}>{positions[i].name}</div>
                        <div style={styles.courtSlotPos}>{positions[i].position ?? ''}</div>
                      </>
                    ) : (
                      <div style={styles.courtSlotEmpty}>{posLabels[i].sub}</div>
                    )}
                  </div>
                ))}
              </div>

              <div style={styles.courtDivider} />

              <div style={styles.courtRow}>
                {[4,5,0].map(i => (
                  <div key={i}
                    style={{
                      ...styles.courtSlot,
                      ...(positions[i] ? styles.courtSlotFilled : {}),
                      ...(dragging ? styles.courtSlotHighlight : {}),
                      ...(i === 0 ? styles.courtSlotServer : {}),
                    }}
                    onClick={() => {
                      if (dragging) { assignToPosition(dragging, i); setDragging(null); }
                      else if (positions[i]) { setDragging(positions[i]); removeFromPosition(i); }
                    }}>
                    <div style={styles.courtPosLabel}>{posLabels[i].label}</div>
                    {i === 0 && <div style={styles.serverTag}>SERVER</div>}
                    {positions[i] ? (
                      <>
                        <div style={styles.courtJersey}>
                          {positions[i].jersey_number ? `#${positions[i].jersey_number}` : ''}
                        </div>
                        <div style={styles.courtSlotName}>{positions[i].name}</div>
                        <div style={styles.courtSlotPos}>{positions[i].position ?? ''}</div>
                      </>
                    ) : (
                      <div style={styles.courtSlotEmpty}>{posLabels[i].sub}</div>
                    )}
                  </div>
                ))}
              </div>
              <div style={styles.courtBaseLabel}>BASELINE</div>
            </div>

            {dragging && (
              <div style={styles.draggingHint}>
                Tap a position to place <strong>{dragging.name}</strong>
              </div>
            )}

            <button
              style={{
                ...styles.startTrackingBtn,
                opacity: positions.filter(Boolean).length < 6 ? 0.4 : 1,
              }}
              onClick={handleStartLineup}>
              Confirm lineup →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── SERVE SELECT ──────────────────────────────────────────────
  if (phase === 'serve_select') {
    const setNum = score?.current_set ?? 1;
    return (
      <div style={styles.page}>
        <div style={styles.serveSelectPage}>
          <div style={styles.serveSelectTitle}>
            {setNum === 5 ? 'Set 5 — Coin toss' : `Set ${setNum}`}
          </div>
          <div style={styles.serveSelectSub}>Who serves first?</div>
          <div style={styles.serveSelectBtns}>
            <button style={styles.serveBtn}
              onClick={() => handleServeSelect(true)}>
              🏐 {ourTeamName} serves first
            </button>
            <button style={{ ...styles.serveBtn, ...styles.serveBtnAlt }}
              onClick={() => handleServeSelect(false)}>
              {opponentName} serves first
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── TRACKING ──────────────────────────────────────────────────
  return (
    <div style={styles.page}>

      {/* Libero prompt overlay */}
      {showLiberoPrompt && (
        <div style={styles.overlay}>
          <div style={styles.promptCard}>
            <div style={styles.promptTitle}>Libero swap</div>
            <div style={styles.promptSub}>
              <strong>{pendingMiddle?.name}</strong> serve error from P1.
              Which libero comes in?
            </div>
            <div style={styles.promptBtns}>
              {liberos.map(lib => (
                <button key={lib.id} style={styles.promptBtn}
                  onClick={() => handleLiberoChoice(lib)}>
                  {lib.name}{lib.jersey_number ? ` #${lib.jersey_number}` : ''}
                </button>
              ))}
              <button style={styles.promptSkipBtn}
                onClick={() => {
                  setShowLiberoPrompt(false);
                  setPendingMiddle(null);
                  setPendingMiddlePosIndex(null);
                }}>
                No swap (skip)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Score header */}
      <div style={styles.scoreHeader}>
        <div style={styles.scoreBlock}>
          <div style={styles.teamLabel}>{ourTeamName}</div>
          <div style={styles.scoreNum}>{score.current_set_our}</div>
          <div style={styles.setsLabel}>{setsWon} set{setsWon!==1?'s':''}</div>
        </div>

        <div style={styles.scoreMid}>
          <div style={styles.setLabel}>Set {score.current_set}</div>
          <div style={styles.servingIndicator}>
            {weAreServing
              ? <span style={styles.servingUs}>● We are serving</span>
              : <span style={styles.servingThem}>● They are serving</span>}
          </div>
          {(score.sets||[]).map(s => (
            <div key={s.set} style={styles.setPill}>
              S{s.set}: {s.us}–{s.them}
            </div>
          ))}
          <div style={{ display:'flex', gap:'8px', marginTop:'4px' }}>
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
          <div style={styles.setsLabel}>{setsLost} set{setsLost!==1?'s':''}</div>
        </div>
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <button style={styles.undoBtn} onClick={handleUndo}>↩ Undo</button>
        {undoMsg && <span style={styles.undoMsg}>{undoMsg}</span>}
        <div style={{ flex:1 }} />
        <button style={styles.endSetBtn} onClick={handleEndSet}>End Set</button>
        <button style={styles.endMatchBtn} onClick={handleComplete}>End Match</button>
      </div>

      {subMode && (
        <div style={styles.subBanner}>
          <span>Subbing out <strong>{subTarget?.name}</strong> — tap bench player</span>
          <button style={styles.subCancelBtn} onClick={cancelSub}>Cancel</button>
        </div>
      )}

      <div className="tracker-body" style={styles.body}>
        {/* Player panel */}
        <div className="tracker-player-panel" style={styles.playerPanel}>

          {/* Mini rotation display */}
          <div style={styles.rotationMini}>
            <div style={styles.rotNetLine2} />
            <div style={styles.rotationRow}>
              {[3,2,1].map(i => (
                <div key={i} style={{
                  ...styles.rotationSlot,
                  ...(positions[i]?.id === selectedPlayer?.id
                    ? styles.rotationSlotSelected : {}),
                }}>
                  <div style={styles.rotPosLabel}>P{i+1}</div>
                  <div style={styles.rotName}>
                    {positions[i]?.name?.split(' ')[0] ?? '—'}
                  </div>
                </div>
              ))}
            </div>
            <div style={styles.rotDivider} />
            <div style={styles.rotationRow}>
              {[4,5,0].map(i => (
                <div key={i} style={{
                  ...styles.rotationSlot,
                  ...(i === 0 ? styles.rotationSlotServer : {}),
                  ...(positions[i]?.id === selectedPlayer?.id
                    ? styles.rotationSlotSelected : {}),
                }}>
                  <div style={styles.rotPosLabel}>P{i===0?1:i+1}</div>
                  <div style={styles.rotName}>
                    {positions[i]?.name?.split(' ')[0] ?? '—'}
                  </div>
                  {i === 0 && weAreServing &&
                    <div style={styles.rotServeTag}>SRV</div>}
                </div>
              ))}
            </div>
          </div>

          <div style={styles.panelTitle}>On court</div>
          {positions.map((player, i) => {
            if (!player) return null;
            const isServer = i === 0;
            return (
              <div key={i} style={styles.playerSlot}>
                <button
                  style={{
                    ...styles.playerBtn,
                    ...(selectedPlayer?.id === player.id ? styles.playerBtnActive : {}),
                    ...(subMode ? styles.playerBtnSubOut : {}),
                    ...(isServer && weAreServing ? styles.playerBtnServer : {}),
                  }}
                  onClick={() => {
                    if (subMode) handleSubOut(player);
                    else setSelectedPlayer(selectedPlayer?.id === player.id ? null : player);
                  }}>
                  <div style={styles.playerBtnTop}>
                    <span style={styles.posTag}>P{i === 0 ? 1 : i+1}</span>
                    {isServer && weAreServing &&
                      <span style={styles.servTag}>SRV</span>}
                    {activeLiberoSwap?.libero.id === player.id &&
                      <span style={styles.libTag}>LIB</span>}
                  </div>
                  <span style={styles.jerseyNum}>
                    {player.jersey_number ? `#${player.jersey_number}` : '—'}
                  </span>
                  <span style={styles.playerName}>{player.name}</span>
                  <span style={styles.playerPos}>{player.position ?? ''}</span>
                </button>
                {!subMode && (
                  <button style={styles.subBtn}
                    onClick={() => handleSubOut(player)}>⇄</button>
                )}
              </div>
            );
          })}

          {bench.length > 0 && (
            <>
              <div style={{...styles.panelTitle, marginTop:'12px'}}>
                {subMode ? '👇 Tap to sub in' : 'Bench'}
              </div>
              {bench.map(p => (
                <button key={p.id}
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
                  <span style={styles.playerPos}>{p.position ?? ''}</span>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Event panel */}
        <div className="tracker-event-panel" style={styles.eventPanel}>
          <div style={styles.panelTitle}>
            {subMode ? 'Tap ⇄ to select who comes off'
              : selectedPlayer ? `Logging for ${selectedPlayer.name}`
              : 'Tap a player on the left'}
          </div>

          {EVENT_GROUPS.map(group => {
            const isServeGroup = group.label === 'Serve';
            const canUseGroup = !isServeGroup || selectedPlayer?.id === serverPlayer?.id;
            return (
              <div key={group.label} style={styles.eventGroup}>
                <div style={styles.eventGroupLabel}>
                  {group.label}
                  {isServeGroup && serverPlayer && (
                    <span style={styles.serverOnlyHint}>
                      {' '}— {serverPlayer.name} only
                    </span>
                  )}
                </div>
                <div style={styles.eventGrid}>
                  {group.events.map(ev => (
                    <button key={ev.type}
                      style={{
                        ...styles.eventBtn,
                        background: ev.color,
                        opacity: (selectedPlayer && !subMode && canUseGroup) ? 1 : 0.3,
                        cursor: (selectedPlayer && !subMode && canUseGroup)
                          ? 'pointer' : 'not-allowed',
                      }}
                      onClick={() => !subMode && handleEvent(ev.type)}>
                      <span>{ev.label}</span>
                      {ev.points === 'us' &&
                        <span style={styles.pointHint}>+1 {ourTeamName}</span>}
                      {ev.points === 'them' &&
                        <span style={styles.pointHint}>+1 {opponentName}</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {lastEvent && (
            <div style={styles.lastEvent}>
              Last: <strong>{lastEvent.event_type}</strong>
              {lastEvent.playerName && ` · ${lastEvent.playerName}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { background: '#0f0f1a', minHeight: '100vh', color: 'white' },
  loading: { padding: '40px', color: 'white', background: '#0f0f1a', minHeight: '100vh' },

  lineupHeader: {
    padding: '20px 32px 14px', background: '#1a1a2e',
    borderBottom: '1px solid #2a2a4a',
  },
  lineupTitle: { fontSize: '18px', fontWeight: '700', marginBottom: '4px' },
  lineupSub: { fontSize: '13px', color: '#aaa' },
  lineupBody: { display: 'flex', height: 'calc(100vh - 76px)' },
  lineupLeft: {
    width: '260px', flexShrink: 0, background: '#141428',
    borderRight: '1px solid #2a2a4a', padding: '14px', overflowY: 'auto',
  },
  lineupRight: { flex: 1, padding: '20px', overflowY: 'auto' },
  lineupSectionTitle: {
    fontSize: '11px', color: '#F5C800', textTransform: 'uppercase',
    letterSpacing: '0.07em', marginBottom: '10px', fontWeight: '600',
  },
  lineupList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  lineupPlayerCard: {
    padding: '10px 12px', background: '#1e1e38', borderRadius: '8px',
    border: '1px solid #2a2a4a', cursor: 'pointer',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  lineupPlayerDragging: { border: '1px solid #F5C800', background: '#1a1a00' },
  lineupPlayerLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
  lineupJersey: { color: '#F5C800', fontSize: '12px', fontWeight: '700', minWidth: '28px' },
  lineupPlayerName: { fontSize: '13px', fontWeight: '600', marginBottom: '1px' },
  lineupPlayerPos: { fontSize: '11px', color: '#888' },
  selectedIndicator: { fontSize: '11px', color: '#F5C800', fontWeight: '600' },

  courtContainer: {
    background: '#1a1a38', borderRadius: '12px',
    padding: '14px', marginBottom: '14px', border: '1px solid #2a2a4a',
  },
  courtNetLabel: {
    textAlign: 'center', fontSize: '10px', color: '#F5C800',
    fontWeight: '700', letterSpacing: '0.15em', marginBottom: '8px',
  },
  courtBaseLabel: {
    textAlign: 'center', fontSize: '10px', color: '#555',
    letterSpacing: '0.1em', marginTop: '8px',
  },
  courtRow: { display: 'flex', gap: '8px', marginBottom: '6px' },
  courtDivider: { height: '2px', background: '#2a2a4a', margin: '6px 0', borderRadius: '1px' },
  courtSlot: {
    flex: 1, padding: '10px 6px', background: '#1e1e38', borderRadius: '8px',
    border: '2px dashed #2a2a4a', minHeight: '80px',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    textAlign: 'center', cursor: 'pointer', position: 'relative',
  },
  courtSlotFilled: { border: '2px solid #F5C800', background: '#1a1a00' },
  courtSlotHighlight: { border: '2px dashed #888' },
  courtSlotServer: { border: '2px solid #2ecc71' },
  courtPosLabel: {
    position: 'absolute', top: '4px', left: '5px',
    fontSize: '9px', color: '#555', fontWeight: '700',
  },
  serverTag: {
    fontSize: '9px', color: '#2ecc71', fontWeight: '700',
    marginBottom: '2px', letterSpacing: '0.05em',
  },
  courtJersey: { fontSize: '11px', color: '#F5C800', fontWeight: '700', marginBottom: '2px' },
  courtSlotName: { fontSize: '11px', fontWeight: '600', marginBottom: '1px' },
  courtSlotPos: { fontSize: '10px', color: '#888' },
  courtSlotEmpty: { color: '#444', fontSize: '11px' },
  draggingHint: {
    textAlign: 'center', color: '#F5C800', fontSize: '13px',
    marginBottom: '12px', padding: '8px', background: '#1a1a00',
    borderRadius: '6px', border: '1px solid #3a3a00',
  },
  startTrackingBtn: {
    width: '100%', padding: '13px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '10px', cursor: 'pointer',
    fontSize: '15px', fontWeight: '700',
  },

  serveSelectPage: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', gap: '16px', padding: '40px',
  },
  serveSelectTitle: { fontSize: '24px', fontWeight: '700', color: '#F5C800' },
  serveSelectSub: { fontSize: '16px', color: '#aaa', marginBottom: '8px' },
  serveSelectBtns: {
    display: 'flex', flexDirection: 'column', gap: '12px',
    width: '100%', maxWidth: '360px',
  },
  serveBtn: {
    padding: '16px', background: '#1a1a2e', color: 'white',
    border: '2px solid #F5C800', borderRadius: '12px',
    cursor: 'pointer', fontSize: '15px', fontWeight: '600',
  },
  serveBtnAlt: { border: '2px solid #555', background: '#111' },

  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
  },
  promptCard: {
    background: '#1a1a2e', border: '1px solid #F5C800', borderRadius: '16px',
    padding: '28px', width: '340px', textAlign: 'center',
  },
  promptTitle: { fontSize: '18px', fontWeight: '700', color: '#F5C800', marginBottom: '8px' },
  promptSub: { fontSize: '14px', color: '#ccc', marginBottom: '20px', lineHeight: 1.5 },
  promptBtns: { display: 'flex', flexDirection: 'column', gap: '10px' },
  promptBtn: {
    padding: '12px', background: '#2a2a4a', color: 'white',
    border: '1px solid #F5C800', borderRadius: '8px',
    cursor: 'pointer', fontSize: '14px', fontWeight: '600',
  },
  promptSkipBtn: {
    padding: '10px', background: 'transparent', color: '#666',
    border: '1px solid #333', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
  },

  scoreHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 20px', background: '#1a1a2e', borderBottom: '1px solid #2a2a4a',
  },
  scoreBlock: { textAlign: 'center', flex: 1 },
  teamLabel: {
    fontSize: '11px', color: '#aaa', marginBottom: '3px',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  scoreNum: { fontSize: '50px', fontWeight: '700', lineHeight: 1 },
  setsLabel: { fontSize: '11px', color: '#aaa', marginTop: '3px' },
  scoreMid: {
    flex: 1, textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
  },
  setLabel: { fontSize: '14px', fontWeight: '600', color: '#ccc' },
  servingIndicator: { fontSize: '11px' },
  servingUs: { color: '#2ecc71', fontWeight: '600' },
  servingThem: { color: '#e74c3c', fontWeight: '600' },
  setPill: {
    fontSize: '11px', background: '#2a2a4a',
    padding: '2px 8px', borderRadius: '10px', color: '#aaa',
  },
  ourBtn: {
    padding: '6px 12px', background: '#1a5e38', color: 'white',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontSize: '11px', fontWeight: '600',
  },
  opponentBtn: {
    padding: '6px 12px', background: '#922b21', color: 'white',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontSize: '11px', fontWeight: '600',
  },
  controls: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '7px 20px', background: '#141428', borderBottom: '1px solid #2a2a4a',
  },
  undoBtn: {
    padding: '6px 12px', background: '#2a2a4a', color: 'white',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
  },
  undoMsg: { fontSize: '11px', color: '#2ecc71' },
  endSetBtn: {
    padding: '6px 12px', background: '#d35400', color: 'white',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
  },
  endMatchBtn: {
    padding: '6px 12px', background: '#922b21', color: 'white',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
  },
  subBanner: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 20px', background: '#1a3a00',
    borderBottom: '1px solid #2a4a00', fontSize: '13px', color: '#aaa',
  },
  subCancelBtn: {
    padding: '4px 10px', background: 'transparent', color: '#e74c3c',
    border: '1px solid #e74c3c', borderRadius: '6px',
    cursor: 'pointer', fontSize: '11px',
  },
  body: { display: 'flex', height: 'calc(100vh - 128px)' },
  playerPanel: {
    width: '210px', background: '#141428', padding: '12px',
    overflowY: 'auto', borderRight: '1px solid #2a2a4a', flexShrink: 0,
  },

  rotationMini: {
    background: '#1a1a38', borderRadius: '8px',
    padding: '8px', marginBottom: '10px', border: '1px solid #2a2a4a',
  },
  rotNetLine2: {
    height: '1px', background: '#F5C800', opacity: 0.3,
    marginBottom: '4px',
  },
  rotationRow: { display: 'flex', gap: '3px', marginBottom: '3px' },
  rotDivider: { height: '1px', background: '#2a2a4a', margin: '3px 0' },
  rotationSlot: {
    flex: 1, background: '#1e1e38', borderRadius: '4px',
    padding: '4px 2px', textAlign: 'center', minHeight: '34px',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
  },
  rotationSlotSelected: { background: '#1a3a6e', border: '1px solid #2e6ab5' },
  rotationSlotServer: { border: '1px solid #2ecc71' },
  rotPosLabel: { fontSize: '8px', color: '#555', fontWeight: '600' },
  rotName: { fontSize: '9px', color: '#ccc', fontWeight: '600', marginTop: '1px' },
  rotServeTag: { fontSize: '7px', color: '#2ecc71', fontWeight: '700' },

  panelTitle: {
    fontSize: '10px', color: '#F5C800', textTransform: 'uppercase',
    letterSpacing: '0.07em', marginBottom: '8px', fontWeight: '600',
  },
  playerSlot: { display: 'flex', alignItems: 'stretch', gap: '3px', marginBottom: '5px' },
  playerBtn: {
    flex: 1, padding: '7px 8px', background: '#1e1e38',
    color: 'white', border: '1px solid #2a2a4a', borderRadius: '7px',
    cursor: 'pointer', textAlign: 'left',
    display: 'flex', flexDirection: 'column', gap: '1px',
  },
  playerBtnTop: { display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '1px' },
  playerBtnActive: { background: '#1a3a6e', border: '1px solid #2e6ab5' },
  playerBtnSubOut: { border: '1px solid #e74c3c' },
  playerBtnServer: { border: '1px solid #2ecc71' },
  posTag: {
    fontSize: '9px', color: '#555', fontWeight: '700',
    background: '#2a2a4a', padding: '1px 4px', borderRadius: '3px',
  },
  servTag: {
    fontSize: '9px', color: '#2ecc71', fontWeight: '700',
    background: '#0a2a0a', padding: '1px 4px', borderRadius: '3px',
  },
  libTag: {
    fontSize: '9px', color: '#F5C800', fontWeight: '700',
    background: '#1a1a00', padding: '1px 4px', borderRadius: '3px',
  },
  benchBtn: {
    background: '#111120', border: '1px solid #1e1e38',
    opacity: 0.65, marginBottom: '5px', width: '100%',
  },
  benchBtnActive: {
    opacity: 1, border: '1px solid #2ecc71',
    background: '#0a2a0a', cursor: 'pointer',
  },
  subBtn: {
    padding: '0 6px', background: '#2a2a4a', color: '#aaa',
    border: '1px solid #3a3a5a', borderRadius: '5px',
    cursor: 'pointer', fontSize: '13px', flexShrink: 0,
  },
  jerseyNum: { fontSize: '10px', color: '#F5C800' },
  playerName: { fontSize: '12px', fontWeight: '600' },
  playerPos: { fontSize: '10px', color: '#555' },

  eventPanel: { flex: 1, padding: '14px', overflowY: 'auto' },
  eventGroup: { marginBottom: '16px' },
  eventGroupLabel: {
    fontSize: '11px', color: '#F5C800', fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: '8px',
  },
  serverOnlyHint: { color: '#888', fontWeight: '400', textTransform: 'none' },
  eventGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: '8px',
  },
  eventBtn: {
    padding: '14px 8px', border: 'none', borderRadius: '10px',
    cursor: 'pointer', color: 'white', fontWeight: '700', fontSize: '13px',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: '4px', minHeight: '65px',
    justifyContent: 'center',
  },
  pointHint: { fontSize: '9px', fontWeight: '400', opacity: 0.8 },
  lastEvent: {
    fontSize: '12px', color: '#aaa', padding: '7px 10px',
    background: '#1a1a2e', borderRadius: '6px', display: 'inline-block',
    marginTop: '8px',
  },
  empty: { color: '#555', fontSize: '13px' },
};

export default LiveMatch;