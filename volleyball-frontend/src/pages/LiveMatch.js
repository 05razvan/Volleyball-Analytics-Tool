import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPlayersByTeam, getMatches, getTeams } from '../api';
import { API_BASE_URL } from '../config';
import { QRCodeSVG } from 'qrcode.react';

const BASE_URL = API_BASE_URL;

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
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = payload?.detail;
    const message = typeof detail === 'string'
      ? detail
      : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload;
};

const apiGetScore = (matchId) => authFetch(`/matches/${matchId}/score`);
const apiLogEvent = (matchId, data) => authFetch(`/matches/${matchId}/event`, { method: 'POST', body: data });
const apiUndoEvent = (matchId) => authFetch(`/matches/${matchId}/event/undo`, { method: 'DELETE' });
const apiEndSet = (matchId) => authFetch(`/matches/${matchId}/end-set`, { method: 'POST' });
const apiCompleteMatch = (matchId) => authFetch(`/matches/${matchId}/complete`, { method: 'POST' });
const apiSaveLineup = (matchId, data) => authFetch(`/matches/${matchId}/lineup`, { method: 'POST', body: data });
const apiGetTrackerState = (matchId) => authFetch(`/matches/${matchId}/tracker-state`);
const apiSaveTrackerState = (matchId, data) => authFetch(`/matches/${matchId}/tracker-state`, { method: 'PUT', body: data });
const apiLogSubstitution = (matchId, data) => authFetch(`/matches/${matchId}/substitutions`, { method: 'POST', body: data });

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
      { type: 'spike_error', label: 'Spike Error', color: '#a93226', points: 'them' },
      { type: 'setter_dump', label: 'Setter Dump', color: '#6c3483', points: 'us' },
    ]
  },
  {
    label: 'Defence',
    events: [
      { type: 'block',  label: 'Block',  color: '#d35400', points: null },
      { type: 'dig',    label: 'Dig',    color: '#16a085', points: null },
    ]
  },
];

const ALL_EVENTS = EVENT_GROUPS.flatMap(g => g.events);

const POSITION_COLORS = {
  Setter: '#8e44ad',
  Opposite: '#e67e22',
  'Middle Blocker': '#c0392b',
  'Outside Hitter': '#2980b9',
  Libero: '#d4ac0d',
};

const POSITION_ORDER = {
  Setter: 0,
  Opposite: 1,
  'Middle Blocker': 2,
  Libero: 2,
  'Outside Hitter': 3,
};

const PASS_RATINGS = [
  { rating: 0, label: 'Unplayable', shortLabel: 'Error', emoji: '❌', color: '#c0392b' },
  { rating: 1, label: 'Out of System', shortLabel: 'Out Sys', emoji: '⚠️', color: '#d35400' },
  { rating: 2, label: 'Good Pass', shortLabel: 'Good', emoji: '👍', color: '#2980b9' },
  { rating: 3, label: 'Perfect Pass', shortLabel: 'Perfect', emoji: '⭐', color: '#27ae60' },
];

const PLAYER_ERRORS = [
  { type: 'foot_fault', label: 'Foot Fault', emoji: '👟', color: '#a93226' },
  { type: 'net_touch', label: 'Net Touch', emoji: '🕸️', color: '#922b21' },
];

function rotateClockwise(positions) {
  return [positions[1], positions[2], positions[3], positions[4], positions[5], positions[0]];
}

function rotateCounterClockwise(positions) {
  return [positions[5], positions[0], positions[1], positions[2], positions[3], positions[4]];
}

function LiveMatch() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState(window.innerWidth <= 700);
  const [tabletLandscape, setTabletLandscape] = useState(
    window.innerWidth > 700 && window.innerWidth <= 1400
      && window.innerWidth > window.innerHeight
  );

  const [phase, setPhase] = useState('lineup');
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
  const [liberoPromptReason, setLiberoPromptReason] = useState('rotation');

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [weAreServing, setWeAreServing] = useState(false);
  const [subMode, setSubMode] = useState(false);
  const [subTarget, setSubTarget] = useState(null);
  const [lastEvent, setLastEvent] = useState(null);
  const [undoMsg, setUndoMsg] = useState('');
  const [dragging, setDragging] = useState(null);
  const [actionError, setActionError] = useState('');
  const [savingLineup, setSavingLineup] = useState(false);
  const [rotationNumber, setRotationNumber] = useState(1);
  const [passingEnabled, setPassingEnabled] = useState(false);
  const [errorsEnabled, setErrorsEnabled] = useState(false);
  const [showSpectatorQR, setShowSpectatorQR] = useState(false);
  const [eventSaving, setEventSaving] = useState(false);
  const [pendingAssist, setPendingAssist] = useState(null);

  useEffect(() => {
    const handleResize = () => {
      setMobile(window.innerWidth <= 700);
      setTabletLandscape(window.innerWidth > 700 && window.innerWidth <= 1400
        && window.innerWidth > window.innerHeight);
    };
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
          apiGetTrackerState(matchId).then(saved => {
            if (!saved || saved.positions?.length !== 6) return;
            const byId = new Map(players.map(player => [player.id, player]));
            const restoredPositions = saved.positions.map(id => byId.get(id)).filter(Boolean);
            if (restoredPositions.length !== 6) return;
            const hasUntrackedLibero = restoredPositions.some(player =>
              player.position === 'Libero') && !saved.active_libero_swap;
            const hasFrontRowLibero = restoredPositions
              .slice(1, 4).some(player => player.position === 'Libero');
            if (hasUntrackedLibero || hasFrontRowLibero) return;
            setPositions(restoredPositions);
            setBench(saved.bench.map(id => byId.get(id)).filter(Boolean));
            setWeAreServing(saved.we_are_serving);
            setRotationNumber(saved.rotation_number);
            setPassingEnabled(saved.passing_enabled);
            setErrorsEnabled(saved.errors_enabled);
            if (saved.active_libero_swap) {
              const swap = saved.active_libero_swap;
              const middle = byId.get(swap.middle_id);
              const libero = byId.get(swap.libero_id);
              if (middle && libero) setActiveLiberoSwap({
                posIndex: swap.posIndex, middle, libero,
              });
            }
            setPhase('tracking');
          }).catch(() => {});
        });
      }
    });
  }, [matchId, fetchScore]);

  const teamName = (id) => teams.find(t => t.id === id)?.name ?? '...';
  const initials = (name) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);

  const saveTrackerState = (nextPositions, nextBench, serving, rotation,
                            passing = passingEnabled, swap = activeLiberoSwap,
                            errors = errorsEnabled) =>
    apiSaveTrackerState(matchId, {
      positions: nextPositions.map(player => player.id),
      bench: nextBench.map(player => player.id),
      we_are_serving: serving,
      rotation_number: rotation,
      passing_enabled: passing,
      errors_enabled: errors,
      active_libero_swap: swap ? {
        posIndex: swap.posIndex,
        middle_id: swap.middle.id,
        libero_id: swap.libero.id,
      } : null,
    });

  const assignToPosition = (player, posIndex) => {
    if (player.position === 'Libero') {
      alert('Choose six regular rotation players here. You will select the libero immediately before tracking starts.');
      return;
    }
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
    if (positions.some(player => player?.position === 'Libero')) {
      alert('Remove the libero from the starting rotation. You will select them immediately before tracking starts.');
      return;
    }
    setPhase('serve_select');
  };

  const handleServeSelect = async (weServe) => {
    if (savingLineup) return;
    setWeAreServing(weServe);
    setActionError('');
    setSavingLineup(true);
    try {
      await apiSaveLineup(matchId, {
        on_court: positions.map(p => p.id),
        bench: bench.map(p => p.id),
      });
      await saveTrackerState(positions, bench, weServe, rotationNumber);
      setPhase('tracking');
      const backRowMiddleIndex = [0, 4, 5].find(index =>
        isMiddle(positions[index]));
      if (backRowMiddleIndex !== undefined && liberos.length > 0) {
        triggerLiberoPrompt(
          positions[backRowMiddleIndex], backRowMiddleIndex, 'start',
        );
      }
    } catch (error) {
      setActionError(`Could not save the lineup: ${error.message}`);
    } finally {
      setSavingLineup(false);
    }
  };

  const isMiddle = (player) => player?.position === 'Middle Blocker';

  // Check if a libero has reached any front-row position and swap the middle
  // back in. This is deliberately defensive so manual rotation corrections can
  // never leave a libero in P2, P3 or P4.
  // Called after every rotation with the NEW positions array
  const checkLiberoSwapOut = (newPositions, swap) => {
    if (!swap) return { positions: newPositions };
    const libInPos = newPositions.findIndex(p => p?.id === swap.libero.id);
    if ([1, 2, 3].includes(libInPos)) {
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

  const triggerLiberoPrompt = (middle, posIndex, reason = 'rotation') => {
    if (liberos.length === 0) return;
    setPendingMiddle(middle);
    setPendingMiddlePosIndex(posIndex);
    setLiberoPromptReason(reason);
    setShowLiberoPrompt(true);
  };

  const handleLiberoChoice = async (libero) => {
    const newPositions = [...positions];
    newPositions[pendingMiddlePosIndex] = libero;
    const newBench = [...bench.filter(p => p.id !== libero.id), pendingMiddle]
      .sort((a,b) => a.name.localeCompare(b.name));
    setPositions(newPositions);
    setBench(newBench);
    // Store swap so we know to auto-swap out later
    const swap = { posIndex: pendingMiddlePosIndex, middle: pendingMiddle, libero };
    setActiveLiberoSwap(swap);
    setShowLiberoPrompt(false);
    setPendingMiddle(null);
    setPendingMiddlePosIndex(null);
    await apiSaveLineup(matchId, {
      on_court: newPositions.filter(Boolean).map(p => p.id),
      bench: newBench.map(p => p.id),
    });
    await saveTrackerState(newPositions, newBench, weAreServing,
      rotationNumber, passingEnabled, swap);
  };

  // Resolve a rotation, automatically moving the chosen libero from the middle
  // entering the front row to the other middle entering the back row.
  const resolveLiberoRotation = (rotated, currentBench, currentSwap) => {
    const { positions: final, clearedSwap, returnedMiddle, returnedLibero } =
      checkLiberoSwapOut(rotated, currentSwap);

    let newPositions = final;
    let newBench = currentBench;
    let newSwap = currentSwap;

    if (clearedSwap) {
      newSwap = null;
      newBench = [
        ...currentBench.filter(p => p.id !== returnedMiddle.id),
        returnedLibero,
      ].sort((a,b) => a.name.localeCompare(b.name));

      const nextMiddleIndex = [0, 4, 5].find(index =>
        isMiddle(newPositions[index]));
      if (nextMiddleIndex !== undefined) {
        const nextMiddle = newPositions[nextMiddleIndex];
        newPositions = [...newPositions];
        newPositions[nextMiddleIndex] = returnedLibero;
        newBench = [
          ...newBench.filter(player => player.id !== returnedLibero.id),
          nextMiddle,
        ].sort((a, b) => a.name.localeCompare(b.name));
        newSwap = {
          posIndex: nextMiddleIndex,
          middle: nextMiddle,
          libero: returnedLibero,
        };
      }
    }

    return { positions: newPositions, bench: newBench, swap: newSwap };
  };

  // Rotate and check libero swap out — returns new state values
  const doRotation = (currentPositions, currentBench, currentSwap) => {
    return resolveLiberoRotation(
      rotateClockwise(currentPositions), currentBench, currentSwap,
    );
  };

  const serverPlayer = positions[0];

  const eventIsAvailable = (eventType, player = selectedPlayer) => {
    if (!player || subMode || eventSaving) return false;
    const courtIndex = positions.findIndex(p => p?.id === player.id);
    const isFrontRow = [1, 2, 3].includes(courtIndex);
    const isLibero = player.position === 'Libero';
    if (['ace', 'serve', 'serve_error'].includes(eventType)) {
      return player.id === serverPlayer?.id;
    }
    if (['block', 'kill_block'].includes(eventType)) {
      return isFrontRow && !isLibero;
    }
    if (eventType === 'setter_dump') {
      return player.position === 'Setter' && isFrontRow;
    }
    if (['kill', 'spike', 'spike_error'].includes(eventType) && isLibero) {
      return false;
    }
    return true;
  };

  const handleEvent = async (eventType, passRating = null, assistPlayerId = undefined) => {
    if (eventSaving) return;
    const ev = ALL_EVENTS.find(e => e.type === eventType);
    const isScoreOnly = ['opponent_point', 'our_point',
      'score_correction_us', 'score_correction_them'].includes(eventType);
    if (!selectedPlayer && !isScoreOnly) {
      alert('Select a player first');
      return;
    }
    if (['kill', 'setter_dump'].includes(eventType)
        && assistPlayerId === undefined) {
      const candidates = positions.filter(player => player
        && player.id !== selectedPlayer?.id).sort((a, b) => {
          if (a.position === 'Setter' && b.position !== 'Setter') return -1;
          if (a.position !== 'Setter' && b.position === 'Setter') return 1;
          return a.name.localeCompare(b.name);
        });
      setPendingAssist({ eventType, passRating, candidates });
      return;
    }
    if (ev?.serverOnly && selectedPlayer?.id !== serverPlayer?.id) {
      alert(`Only the server (${serverPlayer?.name ?? 'P1'}) can log ${ev.label}`);
      return;
    }

    const event = {
      match_id: parseInt(matchId),
      player_id: isScoreOnly ? null : (selectedPlayer?.id ?? null),
      event_type: eventType,
      set_number: score?.current_set ?? 1,
      rotation_number: rotationNumber,
      we_are_serving: weAreServing,
      pass_rating: passRating,
      assist_player_id: assistPlayerId ?? null,
      state_before: {
        positions: positions.map(player => player.id),
        bench: bench.map(player => player.id),
        we_are_serving: weAreServing,
        rotation_number: rotationNumber,
        passing_enabled: passingEnabled,
        errors_enabled: errorsEnabled,
        active_libero_swap: activeLiberoSwap ? {
          posIndex: activeLiberoSwap.posIndex,
          middle_id: activeLiberoSwap.middle.id,
          libero_id: activeLiberoSwap.libero.id,
        } : null,
      },
    };

    setActionError('');
    setEventSaving(true);
    try {
      await apiLogEvent(matchId, event);
    } catch (error) {
      setActionError(`Could not save event: ${error.message}`);
      setEventSaving(false);
      return;
    }
    setEventSaving(false);
    setLastEvent({
      ...event,
      playerName: isScoreOnly ? null : selectedPlayer?.name,
      previousState: {
        positions, bench, activeLiberoSwap, weAreServing, rotationNumber,
        passingEnabled, errorsEnabled,
      },
    });
    const eventPlayer = selectedPlayer;
    if (!isScoreOnly) setSelectedPlayer(null);
    fetchScore();

    if (['score_correction_us', 'score_correction_them'].includes(eventType)) {
      return;
    }

    if (eventType === 'opponent_point') {
      setWeAreServing(false);
      await saveTrackerState(positions, bench, false, rotationNumber);
      return;
    }

    if (['kill', 'ace', 'our_point', 'kill_block', 'setter_dump'].includes(eventType)) {
      if (!weAreServing) {
        const { positions: newPos, bench: newBench, swap: newSwap } =
          doRotation(positions, bench, activeLiberoSwap);
        setPositions(newPos);
        setBench(newBench);
        setActiveLiberoSwap(newSwap);
        setWeAreServing(true);
        const nextRotation = rotationNumber === 6 ? 1 : rotationNumber + 1;
        setRotationNumber(nextRotation);
        await apiSaveLineup(matchId, {
          on_court: newPos.map(p => p.id), bench: newBench.map(p => p.id),
        });
        await saveTrackerState(newPos, newBench, true, nextRotation,
          passingEnabled, newSwap);
      }
      return;
    }

    if (['serve_error', 'foot_fault', 'net_touch', 'spike_error'].includes(eventType)) {
      if (eventType === 'serve_error' && eventPlayer &&
          isMiddle(eventPlayer) && serverPlayer?.id === eventPlayer.id) {
        triggerLiberoPrompt(eventPlayer, 0);
      }
      setWeAreServing(false);
      await saveTrackerState(positions, bench, false, rotationNumber);
      return;
    }   
  };

  const handleManualRotation = async (direction) => {
    if (eventSaving) return;
    const previousPositions = positions;
    const previousRotation = rotationNumber;
    const rotatedPositions = direction === 'forward'
      ? rotateClockwise(positions)
      : rotateCounterClockwise(positions);
    const resolved = resolveLiberoRotation(
      rotatedPositions, bench, activeLiberoSwap,
    );
    const nextPositions = resolved.positions;
    const nextRotation = direction === 'forward'
      ? (rotationNumber === 6 ? 1 : rotationNumber + 1)
      : (rotationNumber === 1 ? 6 : rotationNumber - 1);
    setPositions(nextPositions);
    setBench(resolved.bench);
    setActiveLiberoSwap(resolved.swap);
    setRotationNumber(nextRotation);
    setSelectedPlayer(null);
    setActionError('');
    try {
      await apiSaveLineup(matchId, {
        on_court: nextPositions.map(player => player.id),
        bench: resolved.bench.map(player => player.id),
      });
      await saveTrackerState(nextPositions, resolved.bench, weAreServing,
        nextRotation, passingEnabled, resolved.swap);
    } catch (error) {
      setPositions(previousPositions);
      setBench(bench);
      setActiveLiberoSwap(activeLiberoSwap);
      setRotationNumber(previousRotation);
      setActionError(`Could not correct rotation: ${error.message}`);
    }
  };

  const handleUndo = async () => {
    const result = await apiUndoEvent(matchId);
    let previous = lastEvent?.previousState;
    if (!previous && result?.restored_state) {
      const restored = result.restored_state;
      const byId = new Map(allPlayers.map(player => [player.id, player]));
      const restoredSwap = restored.active_libero_swap;
      previous = {
        positions: restored.positions.map(id => byId.get(id)).filter(Boolean),
        bench: restored.bench.map(id => byId.get(id)).filter(Boolean),
        weAreServing: restored.we_are_serving,
        rotationNumber: restored.rotation_number,
        passingEnabled: restored.passing_enabled,
        errorsEnabled: restored.errors_enabled,
        activeLiberoSwap: restoredSwap ? {
          posIndex: restoredSwap.posIndex,
          middle: byId.get(restoredSwap.middle_id),
          libero: byId.get(restoredSwap.libero_id),
        } : null,
      };
    }
    if (previous) {
      setPositions(previous.positions);
      setBench(previous.bench);
      setActiveLiberoSwap(previous.activeLiberoSwap);
      setWeAreServing(previous.weAreServing);
      setRotationNumber(previous.rotationNumber);
      setPassingEnabled(previous.passingEnabled ?? passingEnabled);
      setErrorsEnabled(previous.errorsEnabled ?? errorsEnabled);
      await apiSaveLineup(matchId, {
        on_court: previous.positions.map(p => p.id),
        bench: previous.bench.map(p => p.id),
      });
      await saveTrackerState(previous.positions, previous.bench,
        previous.weAreServing, previous.rotationNumber,
        previous.passingEnabled ?? passingEnabled, previous.activeLiberoSwap,
        previous.errorsEnabled ?? errorsEnabled);
    }
    setLastEvent(null);
    setUndoMsg('✓');
    setTimeout(() => setUndoMsg(''), 2000);
    fetchScore();
  };

  const handleEndSet = async () => {
    if (!window.confirm(`End set ${score?.current_set}?`)) return;
    await apiEndSet(matchId);
    setSelectedPlayer(null);
    setPositions([null, null, null, null, null, null]);
    setBench([...allPlayers].sort((a, b) => a.name.localeCompare(b.name)));
    setActiveLiberoSwap(null);
    setSubMode(false);
    setSubTarget(null);
    setRotationNumber(1);
    setWeAreServing(false);
    setLastEvent(null);
    setPhase('lineup');
    await fetchScore();
  };

  const handleComplete = async () => {
    if (!window.confirm('End the match?')) return;
    await apiCompleteMatch(matchId);
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
    if (benchPlayer.position === 'Libero' && [1, 2, 3].includes(posIndex)) {
      alert('A libero cannot substitute into the front row (P2, P3 or P4).');
      return;
    }
    if (benchPlayer.position === 'Libero' && !isMiddle(subTarget)) {
      alert('A libero can only replace a back-row middle in the tracker.');
      return;
    }
    if (activeLiberoSwap?.libero.id === subTarget.id
        && benchPlayer.id !== activeLiberoSwap.middle.id) {
      alert(`The libero can only be replaced by ${activeLiberoSwap.middle.name}.`);
      return;
    }
    const newPositions = [...positions];
    newPositions[posIndex] = benchPlayer;
    const newBench = [...bench.filter(p => p.id !== benchPlayer.id), subTarget]
      .sort((a,b) => a.name.localeCompare(b.name));
    let newSwap = activeLiberoSwap;
    if (benchPlayer.position === 'Libero' && isMiddle(subTarget)) {
      newSwap = { posIndex, middle: subTarget, libero: benchPlayer };
    } else if (activeLiberoSwap?.libero.id === subTarget.id) {
      newSwap = null;
    }
    setPositions(newPositions);
    setBench(newBench);
    setActiveLiberoSwap(newSwap);
    setSubMode(false);
    setSubTarget(null);
    await apiLogSubstitution(matchId, {
      player_out_id: subTarget.id,
      player_in_id: benchPlayer.id,
      set_number: score?.current_set ?? 1,
      rotation_number: rotationNumber,
    });
    await apiSaveLineup(matchId, {
      on_court: newPositions.filter(Boolean).map(p => p.id),
      bench: newBench.map(p => p.id),
    });
    await saveTrackerState(newPositions, newBench, weAreServing,
      rotationNumber, passingEnabled, newSwap);
  };

  const cancelSub = () => { setSubMode(false); setSubTarget(null); };
  const spectatorUrl = `${window.location.origin}/spectator/${matchId}`;

  const SpectatorQR = () => !showSpectatorQR ? null : (
    <div style={s.overlay} onClick={() => setShowSpectatorQR(false)}>
      <div style={s.promptCard} onClick={event => event.stopPropagation()}>
        <div style={s.promptTitle}>Spectator scoreboard</div>
        <div style={{ background: 'white', padding: '12px', borderRadius: '10px', display: 'inline-flex' }}>
          <QRCodeSVG value={spectatorUrl} size={210} />
        </div>
        <div style={{ ...s.promptSub, marginTop: '12px', wordBreak: 'break-all' }}>
          Scan to follow this match live
        </div>
        <button style={s.promptSkipBtn} onClick={() => setShowSpectatorQR(false)}>Close</button>
      </div>
    </div>
  );

  const AssistPrompt = () => !pendingAssist ? null : (
    <div style={s.overlay}>
      <div style={s.promptCard}>
        <div style={s.promptTitle}>Who assisted the kill?</div>
        <div style={s.promptSub}>Choose one player, or skip if there was no assist.</div>
        <div style={s.promptBtns}>
          {pendingAssist.candidates.map(player => (
            <button key={player.id} style={{
              ...s.promptBtn,
              ...(player.position === 'Setter' ? s.promptBtnSuggested : {}),
            }} onClick={() => {
              const pending = pendingAssist;
              setPendingAssist(null);
              handleEvent(pending.eventType, pending.passRating, player.id);
            }}>
              {player.position === 'Setter' ? '★ ' : ''}{player.name}
              <span style={s.promptRole}> · {player.position}</span>
            </button>
          ))}
          <button style={s.promptSkipBtn} onClick={() => {
            const pending = pendingAssist;
            setPendingAssist(null);
            handleEvent(pending.eventType, pending.passRating, null);
          }}>No assist</button>
        </div>
      </div>
    </div>
  );

  const togglePassing = async () => {
    const enabled = !passingEnabled;
    setPassingEnabled(enabled);
    await saveTrackerState(positions, bench, weAreServing, rotationNumber, enabled);
  };

  const toggleErrors = async () => {
    const enabled = !errorsEnabled;
    setErrorsEnabled(enabled);
    await saveTrackerState(
      positions, bench, weAreServing, rotationNumber,
      passingEnabled, activeLiberoSwap, enabled,
    );
  };

  if (!score || !match) return <div style={s.loading}>Loading...</div>;

  const ourTeamName = teamName(match.our_team_id);
  const opponentId = match.home_team_id === match.our_team_id
    ? match.away_team_id : match.home_team_id;
  const opponentName = teamName(opponentId);
  const setsWon = (score.sets||[]).filter(st => st.us > st.them).length;
  const setsLost = (score.sets||[]).filter(st => st.them > st.us).length;
  const orderedOnCourt = positions
    .map((player, courtIndex) => ({ player, courtIndex }))
    .filter(({ player }) => Boolean(player))
    .sort((a, b) => {
      const roleDifference = (POSITION_ORDER[a.player.position] ?? 9)
        - (POSITION_ORDER[b.player.position] ?? 9);
      if (roleDifference) return roleDifference;
      if (a.player.position === 'Middle Blocker' && b.player.position === 'Libero') return -1;
      if (a.player.position === 'Libero' && b.player.position === 'Middle Blocker') return 1;
      return (a.player.jersey_number ?? 999) - (b.player.jersey_number ?? 999)
        || a.player.name.localeCompare(b.player.name);
    });

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
          <div style={s.lineupSub}>
            Tap a player then tap a position · {positions.filter(Boolean).length}/6
          </div>
        </div>
        <div style={{ ...s.lineupBody, flexDirection: mobile ? 'column' : 'row' }}>
          <div style={{
            ...s.lineupLeft,
            width: mobile ? '100%' : '220px',
            maxHeight: mobile ? '160px' : 'calc(100vh - 76px)'
          }}>
            <div style={s.lineupSectionTitle}>Squad</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {bench.map(p => (
                <div key={p.id}
                  style={{
                    ...(mobile ? s.miniCard : s.lineupPlayerCard),
                    ...(dragging?.id === p.id ? s.lineupPlayerDragging : {})
                  }}
                  onClick={() => setDragging(dragging?.id === p.id ? null : p)}>
                  {mobile ? (
                    <>
                      <div style={s.miniInitials}>{initials(p.name)}</div>
                      <div style={s.miniNum}>{p.jersey_number ? `#${p.jersey_number}` : ''}</div>
                      {dragging?.id === p.id && <div style={s.miniCheck}>✓</div>}
                    </>
                  ) : (
                    <div style={s.lineupPlayerLeft}>
                      <span style={s.lineupJersey}>
                        {p.jersey_number ? `#${p.jersey_number}` : '—'}
                      </span>
                      <div>
                        <div style={s.lineupPlayerName}>{p.name}</div>
                        <div style={s.lineupPlayerPos}>{p.position ?? 'No position'}</div>
                      </div>
                      {dragging?.id === p.id &&
                        <span style={{ color: '#F5C800', fontSize: '11px', marginLeft: '8px' }}>✓</span>}
                    </div>
                  )}
                </div>
              ))}
              {bench.length === 0 && <p style={s.empty}>All assigned</p>}
            </div>
          </div>

          <div style={{ ...s.lineupRight, flex: 1 }}>
            {dragging && (
              <div style={s.draggingHint}>
                Tap a slot to place <strong>{dragging.name}</strong>
              </div>
            )}
            <div style={s.courtContainer}>
              <div style={s.courtNetLabel}>NET</div>
              <div style={s.courtRow}>
                {[3,2,1].map(i => (
                  <div key={i}
                    style={{
                      ...s.courtSlot,
                      ...(positions[i] ? s.courtSlotFilled : {}),
                      ...(dragging ? s.courtSlotHighlight : {}),
                    }}
                    onClick={() => {
                      if (dragging) { assignToPosition(dragging, i); setDragging(null); }
                      else if (positions[i]) { setDragging(positions[i]); removeFromPosition(i); }
                    }}>
                    <div style={s.courtPosLabel}>{posLabels[i].label}</div>
                    {positions[i] ? (
                      <>
                        <div style={s.courtJersey}>
                          {positions[i].jersey_number ? `#${positions[i].jersey_number}` : ''}
                        </div>
                        <div style={s.courtSlotName}>
                          {mobile ? initials(positions[i].name) : positions[i].name}
                        </div>
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
                    style={{
                      ...s.courtSlot,
                      ...(positions[i] ? s.courtSlotFilled : {}),
                      ...(dragging ? s.courtSlotHighlight : {}),
                      ...(i === 0 ? s.courtSlotServer : {}),
                    }}
                    onClick={() => {
                      if (dragging) { assignToPosition(dragging, i); setDragging(null); }
                      else if (positions[i]) { setDragging(positions[i]); removeFromPosition(i); }
                    }}>
                    <div style={s.courtPosLabel}>{posLabels[i].label}</div>
                    {i === 0 && <div style={s.serverTag}>SRV</div>}
                    {positions[i] ? (
                      <>
                        <div style={s.courtJersey}>
                          {positions[i].jersey_number ? `#${positions[i].jersey_number}` : ''}
                        </div>
                        <div style={s.courtSlotName}>
                          {mobile ? initials(positions[i].name) : positions[i].name}
                        </div>
                        {!mobile && <div style={s.courtSlotPos}>{positions[i].position ?? ''}</div>}
                      </>
                    ) : <div style={s.courtSlotEmpty}>{posLabels[i].sub}</div>}
                  </div>
                ))}
              </div>
              <div style={s.courtBaseLabel}>BASELINE</div>
            </div>
            <button
              style={{
                ...s.startTrackingBtn,
                opacity: positions.filter(Boolean).length < 6 ? 0.4 : 1
              }}
              onClick={handleStartLineup}>
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
          <div style={s.serveSelectTitle}>
            {(score?.current_set ?? 1) === 5 ? 'Set 5 — Coin toss' : `Set ${score?.current_set ?? 1}`}
          </div>
          <div style={s.serveSelectSub}>Who serves first?</div>
          {actionError && <div role="alert" style={s.actionError}>{actionError}</div>}
          <div style={s.serveSelectBtns}>
            <button style={s.serveBtn} disabled={savingLineup}
              onClick={() => handleServeSelect(true)}>
              🏐 {savingLineup ? 'Saving lineup…' : `${ourTeamName} serves first`}
            </button>
            <button style={{ ...s.serveBtn, ...s.serveBtnAlt }}
              disabled={savingLineup}
              onClick={() => handleServeSelect(false)}>
              {savingLineup ? 'Saving lineup…' : `${opponentName} serves first`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── LIBERO PROMPT ─────────────────────────────────────────────
  const LiberoPrompt = () => !showLiberoPrompt ? null : (
    <div style={s.overlay}>
      <div style={s.promptCard}>
        <div style={s.promptTitle}>Libero swap</div>
        <div style={s.promptSub}>
          {liberoPromptReason === 'start' ? (
            <>The back-row middle is <strong>{pendingMiddle?.name}</strong>. Which libero replaces them before the first point?</>
          ) : (
            <><strong>{pendingMiddle?.name}</strong> is leaving the service position. Which libero comes in?</>
          )}
        </div>
        <div style={s.promptBtns}>
          {liberos.map(lib => (
            <button key={lib.id} style={s.promptBtn} onClick={() => handleLiberoChoice(lib)}>
              {lib.name}{lib.jersey_number ? ` #${lib.jersey_number}` : ''}
            </button>
          ))}
          <button style={s.promptSkipBtn} onClick={() => {
            setShowLiberoPrompt(false);
            setPendingMiddle(null);
            setPendingMiddlePosIndex(null);
          }}>Skip</button>
        </div>
      </div>
    </div>
  );

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
        <SpectatorQR />
        <AssistPrompt />
        {actionError && <div role="alert" style={m.actionError}>{actionError}</div>}

        {/* Score bar */}
        <div style={m.scoreBar}>
          <div style={m.scoreTeamBlock}>
            <div style={m.scoreTeamName}>{ourTeamName}</div>
            <div style={m.scoreBig}>{score.current_set_our}</div>
            <div style={m.scoreSets}>{setsWon} sets</div>
          </div>
          <div style={m.scoreMid}>
            <div style={m.scoreSet}>Set {score.current_set}</div>
            <div style={{ fontSize: '10px', color: '#F5C800', fontWeight: '700' }}>
              ROTATION {rotationNumber}
            </div>
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

        {/* Court diagram — tap to select player */}
        <div style={m.courtSection}>
          <div style={m.courtNet}>NET</div>
          {/* Front row */}
          <div style={m.courtRow}>
            {courtDisplayOrder.slice(0,3).map(({ posIdx, label }) => {
              const player = positions[posIdx];
              const isSelected = selectedPlayer?.id === player?.id;
              const isServer = posIdx === 0 && weAreServing;
              return (
                <div key={posIdx} style={m.courtTileWrapper}>
                  <button
                    style={{
                      ...m.courtTile,
                      ...(player && isSelected ? m.courtTileSelected : {}),
                      ...(isServer ? m.courtTileServer : {}),
                      ...(!player ? m.courtTileEmpty : {}),
                    }}
                    onClick={() => {
                      if (!player || subMode) return;
                      setSelectedPlayer(isSelected ? null : player);
                    }}>
                    <div style={m.courtTilePos}>{label}</div>
                    {player ? (
                      <>
                        <div style={m.courtTileInitials}>{initials(player.name)}</div>
                        <div style={m.courtTileNum}>
                          {player.jersey_number ? `#${player.jersey_number}` : ''}
                        </div>
                        {activeLiberoSwap?.libero.id === player.id &&
                          <div style={m.libBadge}>LIB</div>}
                      </>
                    ) : <div style={m.courtTileEmptyText}>—</div>}
                  </button>
                  {/* Sub button under each court tile */}
                  {player && (
                    <button
                      style={{
                        ...m.tileSubBtn,
                        ...(subMode && subTarget?.id === player.id ? m.tileSubBtnActive : {}),
                      }}
                      onClick={() => {
                        if (subMode && subTarget?.id === player.id) {
                          cancelSub();
                        } else {
                          handleSubOut(player);
                        }
                      }}>
                      ⇄
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div style={m.courtBaseline} />
          {/* Back row */}
          <div style={m.courtRow}>
            {courtDisplayOrder.slice(3).map(({ posIdx, label }) => {
              const player = positions[posIdx];
              const isSelected = selectedPlayer?.id === player?.id;
              const isServer = posIdx === 0 && weAreServing;
              return (
                <div key={posIdx} style={m.courtTileWrapper}>
                  <button
                    style={{
                      ...m.courtTile,
                      ...(player && isSelected ? m.courtTileSelected : {}),
                      ...(isServer ? m.courtTileServer : {}),
                      ...(!player ? m.courtTileEmpty : {}),
                    }}
                    onClick={() => {
                      if (!player || subMode) return;
                      setSelectedPlayer(isSelected ? null : player);
                    }}>
                    <div style={m.courtTilePos}>{label}{isServer ? ' ▶' : ''}</div>
                    {player ? (
                      <>
                        <div style={m.courtTileInitials}>{initials(player.name)}</div>
                        <div style={m.courtTileNum}>
                          {player.jersey_number ? `#${player.jersey_number}` : ''}
                        </div>
                        {activeLiberoSwap?.libero.id === player.id &&
                          <div style={m.libBadge}>LIB</div>}
                      </>
                    ) : <div style={m.courtTileEmptyText}>—</div>}
                  </button>
                  {player && (
                    <button
                      style={{
                        ...m.tileSubBtn,
                        ...(subMode && subTarget?.id === player.id ? m.tileSubBtnActive : {}),
                      }}
                      onClick={() => {
                        if (subMode && subTarget?.id === player.id) {
                          cancelSub();
                        } else {
                          handleSubOut(player);
                        }
                      }}>
                      ⇄
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div style={m.courtBaselineLabel}>BASELINE</div>
        </div>

        {/* Bench — shown when in sub mode */}
        {subMode && (
          <div style={m.benchStrip}>
            <div style={m.benchLabel}>
              Tap to sub in for <strong>{subTarget?.name}</strong>
            </div>
            <div style={m.benchRow}>
              {bench.map(p => (
                <button key={p.id} style={m.benchTileActive}
                  onClick={() => handleSubIn(p)}>
                  <div style={m.benchInitials}>{initials(p.name)}</div>
                  <div style={m.benchNum}>{p.jersey_number ? `#${p.jersey_number}` : '—'}</div>
                </button>
              ))}
              <button style={m.cancelSubBtn} onClick={cancelSub}>✕ Cancel</button>
            </div>
          </div>
        )}

        {/* Bench display when not in sub mode */}
        {!subMode && bench.length > 0 && (
          <div style={m.benchStrip}>
            <div style={m.benchLabel}>BENCH</div>
            <div style={m.benchRow}>
              {bench.map(p => (
                <div key={p.id} style={m.benchTile}>
                  <div style={m.benchInitials}>{initials(p.name)}</div>
                  <div style={m.benchNum}>{p.jersey_number ? `#${p.jersey_number}` : '—'}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stat buttons */}
        <div style={m.statSection}>
          <div style={m.statBanner}>
            {subMode ? (
              <span style={{ color: '#e74c3c' }}>
                Subbing out <strong>{subTarget?.name}</strong> — tap ⇄ again to cancel
              </span>
            ) : selectedPlayer ? (
              <>
                <span style={{ color: '#F5C800', fontWeight: '700' }}>{selectedPlayer.name}</span>
                {selectedPlayer.id === serverPlayer?.id &&
                  <span style={{ color: '#2ecc71', fontSize: '10px' }}> (server)</span>}
                <button style={m.clearBtn} onClick={() => setSelectedPlayer(null)}>✕</button>
              </>
            ) : (
              <span style={{ color: '#555' }}>Tap a player on the court above</span>
            )}
          </div>

          {!subMode && (
            <>
            <button style={{
              ...m.passingToggle,
              ...(passingEnabled ? m.passingToggleOn : {}),
            }} onClick={togglePassing}>
              Passing ratings: {passingEnabled ? 'ON' : 'OFF'}
            </button>
            {passingEnabled && (
              <div style={m.passGrid}>
                {PASS_RATINGS.map(pass => (
                  <button key={pass.rating} style={{
                    ...m.passBtn,
                    background: pass.color,
                    opacity: selectedPlayer && !eventSaving ? 1 : 0.2,
                    cursor: selectedPlayer && !eventSaving ? 'pointer' : 'not-allowed',
                  }}
                    disabled={!selectedPlayer || eventSaving}
                    onClick={() => selectedPlayer && handleEvent('pass', pass.rating)}>
                    <span>{pass.emoji}</span> {pass.shortLabel}
                  </button>
                ))}
              </div>
            )}
            <button style={{
              ...m.passingToggle,
              ...(errorsEnabled ? m.errorToggleOn : {}),
            }} onClick={toggleErrors}>
              Player errors: {errorsEnabled ? 'ON' : 'OFF'}
            </button>
            {errorsEnabled && (
              <div style={m.errorGrid}>
                {PLAYER_ERRORS.map(error => (
                  <button key={error.type} style={{
                    ...m.passBtn,
                    background: error.color,
                    opacity: selectedPlayer && !eventSaving ? 1 : 0.2,
                    cursor: selectedPlayer && !eventSaving ? 'pointer' : 'not-allowed',
                  }}
                    disabled={!selectedPlayer || eventSaving}
                    onClick={() => selectedPlayer && handleEvent(error.type)}>
                    <span>{error.emoji}</span> {error.label}
                  </button>
                ))}
              </div>
            )}
            <div style={m.statGrid}>
              {EVENT_GROUPS.map(group => {
                const isServeGroup = group.label === 'Serve';
                const canUse = selectedPlayer &&
                  (!isServeGroup || selectedPlayer.id === serverPlayer?.id);
                return group.events.map(ev => (
                  <button key={ev.type}
                    style={{
                      ...m.statBtn,
                      background: ev.color,
                      opacity: canUse && !eventSaving ? 1 : 0.2,
                      cursor: canUse && !eventSaving ? 'pointer' : 'not-allowed',
                    }}
                    disabled={!canUse || eventSaving}
                    onClick={() => canUse && !eventSaving && handleEvent(ev.type)}>
                    <div style={m.statBtnLabel}>{ev.label}</div>
                    {ev.points === 'us' && <div style={m.statBtnPts}>+pt</div>}
                    {ev.points === 'them' && <div style={m.statBtnPts}>opp+</div>}
                  </button>
                ));
              })}
            </div>
            </>
          )}

          {lastEvent && (
            <div style={m.lastEventBar}>
              ✓ {lastEvent.event_type}
              {lastEvent.playerName ? ` · ${lastEvent.playerName}` : ''}
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div style={m.bottomBar}>
          <button style={m.undoBtn} onClick={handleUndo}>↩{undoMsg}</button>
          <button style={m.undoBtn} onClick={() => setShowSpectatorQR(true)}>QR</button>
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
      <SpectatorQR />
      <AssistPrompt />
      {actionError && <div role="alert" style={s.trackingError}>{actionError}</div>}

      <div style={s.scoreHeader}>
        <div style={s.scoreBlock}>
          <div style={s.teamLabel}>{ourTeamName}</div>
          <div style={s.scoreNum}>{score.current_set_our}</div>
          <div style={s.setsLabel}>{setsWon} set{setsWon!==1?'s':''}</div>
        </div>
        <div style={s.scoreMid}>
          <div style={s.setLabel}>Set {score.current_set}</div>
          <div style={{ fontSize: '10px', color: '#F5C800', fontWeight: '700' }}>
            Rotation {rotationNumber}
          </div>
          <div>
            {weAreServing
              ? <span style={s.servingUs}>● We are serving</span>
              : <span style={s.servingThem}>● They are serving</span>}
          </div>
          {(score.sets||[]).map(st => (
            <div key={st.set} style={s.setPill}>S{st.set}: {st.us}–{st.them}</div>
          ))}
          <div style={{ display:'flex', gap:'8px', marginTop:'4px' }}>
            <button style={s.ourBtn} onClick={() => handleEvent('our_point')}>
              + {ourTeamName}
            </button>
            <button style={s.opponentBtn} onClick={() => handleEvent('opponent_point')}>
              + {opponentName}
            </button>
          </div>
        </div>
        <div style={s.scoreBlock}>
          <div style={s.teamLabel}>{opponentName}</div>
          <div style={s.scoreNum}>{score.current_set_opponent}</div>
          <div style={s.setsLabel}>{setsLost} set{setsLost!==1?'s':''}</div>
        </div>
      </div>

      <div style={s.controls}>
        <button style={s.undoBtn} onClick={() => setShowSpectatorQR(true)}>Spectator QR</button>
        <button style={s.undoBtn} onClick={handleUndo}>↩ Undo</button>
        {undoMsg && <span style={s.undoMsg}>{undoMsg}</span>}
        <button style={s.rotationBtn} onClick={() => handleManualRotation('backward')}>← Rotation</button>
        <button style={s.rotationBtn} onClick={() => handleManualRotation('forward')}>Rotation →</button>
        <button style={s.scoreCorrectionBtn}
          disabled={(score?.current_set_our ?? 0) <= 0 || eventSaving}
          onClick={() => handleEvent('score_correction_us')}>−1 {ourTeamName}</button>
        <button style={s.scoreCorrectionBtn}
          disabled={(score?.current_set_opponent ?? 0) <= 0 || eventSaving}
          onClick={() => handleEvent('score_correction_them')}>−1 {opponentName}</button>
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

      <div style={{
        ...s.body,
        ...(tabletLandscape ? s.tabletBody : {}),
      }}>
        {tabletLandscape ? (
          <div style={s.tabletPlayerArea}>
            <div style={s.tabletPlayerStrip}>
              {orderedOnCourt.map(({ player, courtIndex }) => {
                const isServer = courtIndex === 0;
                const isFrontRow = [1, 2, 3].includes(courtIndex);
                const roleColor = POSITION_COLORS[player.position] ?? '#666';
                const darkText = player.position === 'Libero';
                const selected = selectedPlayer?.id === player.id;
                return (
                  <div key={player.id} style={s.tabletPlayerSlot}>
                    <button style={{
                      ...s.tabletPlayerBtn,
                      background: roleColor,
                      color: darkText ? '#111' : '#fff',
                      border: selected ? '5px solid #fff' : `3px solid ${roleColor}`,
                      boxShadow: selected
                        ? `0 0 0 4px #F5C800, 0 5px 15px ${roleColor}88`
                        : '0 3px 9px rgba(0,0,0,0.4)',
                      transform: selected ? 'translateY(-3px)' : 'none',
                    }} onClick={() => {
                      if (subMode) handleSubOut(player);
                      else setSelectedPlayer(player);
                    }}>
                      <span style={s.tabletRole}>{player.position ?? 'Player'}</span>
                      <span style={s.tabletPlayerName}>{player.name}</span>
                      <span style={s.tabletPlayerMeta}>
                        {player.jersey_number ? `#${player.jersey_number} · ` : ''}
                        P{courtIndex === 0 ? 1 : courtIndex + 1} · {isFrontRow ? 'FRONT' : 'BACK'}
                      </span>
                      {selected && <span style={s.tabletSelectedTag}>SELECTED</span>}
                      {isServer && weAreServing && <span style={s.tabletServerTag}>🏐 SERVER</span>}
                    </button>
                    <button style={s.tabletSubBtn} onClick={() => handleSubOut(player)}>⇄ SUB</button>
                  </div>
                );
              })}
            </div>
            {subMode && (
              <div style={s.tabletBenchStrip}>
                <strong>Sub in for {subTarget?.name}:</strong>
                {bench.map(player => (
                  <button key={player.id} style={s.tabletBenchBtn}
                    onClick={() => handleSubIn(player)}>
                    {player.name}{player.jersey_number ? ` #${player.jersey_number}` : ''}
                  </button>
                ))}
                <button style={s.subCancelBtn} onClick={cancelSub}>Cancel</button>
              </div>
            )}
          </div>
        ) : (
        <div style={s.playerPanel}>
          <div style={s.rotationMini}>
            <div style={s.rotNetLine2} />
            <div style={s.rotationRow}>
              {[3,2,1].map(i => (
                <div key={i} style={{
                  ...s.rotationSlot,
                  ...(positions[i]?.id===selectedPlayer?.id ? s.rotationSlotSelected : {})
                }}>
                  <div style={s.rotPosLabel}>P{i+1}</div>
                  <div style={s.rotName}>{positions[i]?.name?.split(' ')[0] ?? '—'}</div>
                </div>
              ))}
            </div>
            <div style={s.rotDivider} />
            <div style={s.rotationRow}>
              {[4,5,0].map(i => (
                <div key={i} style={{
                  ...s.rotationSlot,
                  ...(i===0 ? s.rotationSlotServer : {}),
                  ...(positions[i]?.id===selectedPlayer?.id ? s.rotationSlotSelected : {})
                }}>
                  <div style={s.rotPosLabel}>P{i===0?1:i+1}</div>
                  <div style={s.rotName}>{positions[i]?.name?.split(' ')[0] ?? '—'}</div>
                  {i===0&&weAreServing&&<div style={s.rotServeTag}>SRV</div>}
                </div>
              ))}
            </div>
          </div>

          <div style={s.panelTitle}>On court</div>
          {orderedOnCourt.map(({ player, courtIndex }) => {
            const isServer = courtIndex === 0;
            const isFrontRow = [1, 2, 3].includes(courtIndex);
            const roleColor = POSITION_COLORS[player.position] ?? '#666';
            return (
              <div key={player.id} style={s.playerSlot}>
                <button
                  style={{
                    ...s.playerBtn,
                    background: roleColor,
                    color: player.position === 'Libero' ? '#111' : '#fff',
                    ...(selectedPlayer?.id===player.id ? s.playerBtnActive : {}),
                    ...(subMode ? s.playerBtnSubOut : {}),
                    ...(isServer&&weAreServing ? s.playerBtnServer : {}),
                    borderLeft: `8px solid ${roleColor}`,
                  }}
                  onClick={() => {
                    if (subMode) handleSubOut(player);
                    else setSelectedPlayer(player);
                  }}>
                  <div style={s.playerBtnTop}>
                    <span style={{ ...s.posTag, color: '#fff' }}>{player.position ?? 'Player'}</span>
                    <span style={s.courtStateTag}>
                      P{courtIndex===0?1:courtIndex+1} · {isFrontRow ? 'FRONT' : 'BACK'}
                    </span>
                    {isServer&&weAreServing&&<span style={s.servTag}>SRV</span>}
                    {activeLiberoSwap?.libero.id===player.id&&
                      <span style={s.libTag}>LIB</span>}
                  </div>
                  <span style={s.jerseyNum}>
                    {player.jersey_number?`#${player.jersey_number}`:'—'}
                  </span>
                  <span style={s.playerName}>{player.name}</span>
                  <span style={s.playerPos}>{player.position??''}</span>
                </button>
                {!subMode && (
                  <button style={s.subBtn} onClick={() => handleSubOut(player)}>⇄</button>
                )}
              </div>
            );
          })}

          {bench.length > 0 && (
            <>
              <div style={{...s.panelTitle, marginTop:'12px'}}>
                {subMode ? '👇 Tap to sub in' : 'Bench'}
              </div>
              {bench.map(p => (
                <button key={p.id}
                  style={{
                    ...s.playerBtn,
                    ...s.benchBtn,
                    ...(subMode ? s.benchBtnActive : {}),
                  }}
                  onClick={() => subMode && handleSubIn(p)}>
                  <span style={s.jerseyNum}>
                    {p.jersey_number?`#${p.jersey_number}`:'—'}
                  </span>
                  <span style={s.playerName}>{p.name}</span>
                  <span style={s.playerPos}>{p.position??''}</span>
                </button>
              ))}
            </>
          )}
        </div>
        )}

        <div style={{
          ...s.eventPanel,
          ...(tabletLandscape ? s.tabletEventPanel : {}),
        }}>
          <div style={{
            ...s.panelTitle,
            ...(selectedPlayer ? s.panelTitleSelected : {}),
          }}>
            {subMode ? 'Tap ⇄ to select who comes off'
              : selectedPlayer ? `Logging for ${selectedPlayer.name}`
                : tabletLandscape ? 'Tap a player across the top' : 'Tap a player on the left'}
          </div>
          <button style={{
            ...s.passingToggle,
            ...(passingEnabled ? s.passingToggleOn : {}),
          }} onClick={togglePassing}>
            Passing ratings: {passingEnabled ? 'ON' : 'OFF'}
          </button>
          {passingEnabled && (
            <div style={{ ...s.eventGrid, ...(tabletLandscape ? s.tabletEventGrid : {}), marginBottom: '14px' }}>
              {PASS_RATINGS.map(pass => {
                const canPass = selectedPlayer && selectedPlayer.position !== 'Setter'
                  && !eventSaving && !subMode;
                return <button key={pass.rating} style={{ ...s.eventBtn, ...(tabletLandscape ? s.tabletEventBtn : {}), background: pass.color,
                  opacity: canPass ? 1 : 0.22,
                  cursor: canPass ? 'pointer' : 'not-allowed' }}
                  disabled={!canPass}
                  onClick={() => handleEvent('pass', pass.rating)}>
                  <span>{pass.emoji} {pass.label}</span>
                  <span style={s.pointHint}>{pass.rating}/3</span>
                </button>;
              })}
            </div>
          )}
          <button style={{
            ...s.passingToggle,
            ...(errorsEnabled ? s.errorToggleOn : {}),
          }} onClick={toggleErrors}>
            Player errors: {errorsEnabled ? 'ON' : 'OFF'}
          </button>
          {errorsEnabled && (
            <div style={{ ...s.eventGrid, ...(tabletLandscape ? s.tabletEventGrid : {}), marginBottom: '14px' }}>
              {PLAYER_ERRORS.map(error => (
                <button key={error.type} style={{
                  ...s.eventBtn,
                  ...(tabletLandscape ? s.tabletEventBtn : {}),
                  background: error.color,
                  opacity: selectedPlayer && !eventSaving ? 1 : 0.3,
                  cursor: selectedPlayer && !eventSaving ? 'pointer' : 'not-allowed',
                }}
                  disabled={!selectedPlayer || eventSaving}
                  onClick={() => handleEvent(error.type)}>
                  <span>{error.emoji} {error.label}</span>
                  <span style={s.pointHint}>+1 {opponentName}</span>
                </button>
              ))}
            </div>
          )}
          {EVENT_GROUPS.map(group => {
            return (
              <div key={group.label} style={s.eventGroup}>
                <div style={s.eventGroupLabel}>
                  {group.label}
                  {group.label === 'Serve'&&serverPlayer&&
                    <span style={s.serverOnlyHint}> — {serverPlayer.name} only</span>}
                </div>
                <div style={{ ...s.eventGrid, ...(tabletLandscape ? s.tabletEventGrid : {}) }}>
                  {group.events.map(ev => {
                    const canUse = eventIsAvailable(ev.type);
                    return <button key={ev.type}
                      style={{
                        ...s.eventBtn,
                        ...(tabletLandscape ? s.tabletEventBtn : {}),
                        background: ev.color,
                        opacity: canUse ? 1 : 0.22,
                        cursor: canUse ? 'pointer' : 'not-allowed',
                      }}
                      disabled={!canUse}
                      onClick={() => canUse && handleEvent(ev.type)}>
                      <span>{ev.label}</span>
                      {ev.points==='us' &&
                        <span style={s.pointHint}>+1 {ourTeamName}</span>}
                      {ev.points==='them' &&
                        <span style={s.pointHint}>+1 {opponentName}</span>}
                    </button>;
                  })}
                </div>
              </div>
            );
          })}
          {lastEvent && (
            <div style={s.lastEvent}>
              Last: <strong>{lastEvent.event_type}</strong>
              {lastEvent.playerName && ` · ${lastEvent.playerName}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── DESKTOP STYLES ────────────────────────────────────────────
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
  actionError: { width: '100%', maxWidth: '420px', padding: '10px 12px', color: '#ffb4b4', background: '#3a1717', border: '1px solid #7d2929', borderRadius: '8px', fontSize: '13px', lineHeight: 1.4, textAlign: 'center' },
  serveSelectBtns: { display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '320px' },
  serveBtn: { padding: '16px', background: '#1a1a2e', color: 'white', border: '2px solid #F5C800', borderRadius: '12px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  serveBtnAlt: { border: '2px solid #555', background: '#111' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  promptCard: { background: '#1a1a2e', border: '1px solid #F5C800', borderRadius: '16px', padding: '24px', width: '300px', maxWidth: '90vw', textAlign: 'center' },
  promptTitle: { fontSize: '16px', fontWeight: '700', color: '#F5C800', marginBottom: '8px' },
  promptSub: { fontSize: '13px', color: '#ccc', marginBottom: '16px', lineHeight: 1.5 },
  promptBtns: { display: 'flex', flexDirection: 'column', gap: '8px' },
  promptBtn: { padding: '11px', background: '#2a2a4a', color: 'white', border: '1px solid #F5C800', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  promptBtnSuggested: { background: '#3a3200', border: '2px solid #F5C800' },
  promptRole: { color: '#aaa', fontSize: '11px', fontWeight: '400' },
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
  ourBtn: { padding: '8px 14px', background: '#1f7a49', color: 'white', border: '1px solid #32a867', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' },
  opponentBtn: { padding: '8px 14px', background: '#a52b22', color: 'white', border: '1px solid #d54a3e', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' },
  controls: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#141428', borderBottom: '1px solid #2a2a4a', flexWrap: 'wrap' },
  undoBtn: { minHeight: '42px', padding: '8px 12px', background: '#2a2a4a', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' },
  rotationBtn: { minHeight: '42px', padding: '8px 13px', background: '#1a3a6e', color: '#d6eaff', border: '1px solid #2e6ab5', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' },
  scoreCorrectionBtn: { minHeight: '42px', padding: '8px 13px', background: '#3a2020', color: '#ffb4b4', border: '1px solid #7d3939', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' },
  undoMsg: { fontSize: '10px', color: '#2ecc71' },
  endSetBtn: { padding: '5px 10px', background: '#d35400', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' },
  endMatchBtn: { padding: '5px 10px', background: '#922b21', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' },
  subBanner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 16px', background: '#1a3a00', borderBottom: '1px solid #2a4a00', fontSize: '12px', color: '#aaa' },
  subCancelBtn: { padding: '4px 8px', background: 'transparent', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: '5px', cursor: 'pointer', fontSize: '11px' },
  body: { display: 'flex', height: 'calc(100vh - 120px)' },
  tabletBody: { flexDirection: 'column', height: 'auto', minHeight: 'calc(100vh - 150px)' },
  tabletPlayerArea: { background: '#111120', padding: '12px 14px 8px', borderBottom: '2px solid #33334a', flexShrink: 0 },
  tabletPlayerStrip: { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '10px' },
  tabletPlayerSlot: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' },
  tabletPlayerBtn: { position: 'relative', minWidth: 0, minHeight: '105px', padding: '24px 8px 9px', borderRadius: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transition: 'transform 100ms ease, box-shadow 100ms ease' },
  tabletRole: { position: 'absolute', top: '6px', left: '7px', right: '7px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', opacity: 0.9 },
  tabletPlayerName: { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '18px', fontWeight: '900', textShadow: '0 1px 3px rgba(0,0,0,0.5)' },
  tabletPlayerMeta: { marginTop: '5px', fontSize: '10px', fontWeight: '800', opacity: 0.9 },
  tabletSelectedTag: { position: 'absolute', bottom: '5px', right: '6px', padding: '2px 5px', background: '#fff', color: '#111', borderRadius: '4px', fontSize: '8px', fontWeight: '1000' },
  tabletServerTag: { position: 'absolute', top: '5px', right: '5px', padding: '2px 4px', background: '#082b19', color: '#7dffad', borderRadius: '4px', fontSize: '8px', fontWeight: '900' },
  tabletSubBtn: { minHeight: '34px', padding: '5px', background: '#29293b', color: '#ddd', border: '1px solid #4a4a62', borderRadius: '7px', cursor: 'pointer', fontSize: '10px', fontWeight: '800' },
  tabletBenchStrip: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '10px', padding: '8px', background: '#183018', borderRadius: '8px', fontSize: '12px' },
  tabletBenchBtn: { minHeight: '42px', padding: '8px 13px', background: '#227047', color: '#fff', border: '2px solid #55d58d', borderRadius: '8px', cursor: 'pointer', fontWeight: '800' },
  tabletEventPanel: { padding: '10px 14px 18px', overflowY: 'visible' },
  tabletEventGrid: { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px' },
  tabletEventBtn: { minHeight: '86px', fontSize: '17px', borderWidth: '2px' },
  playerPanel: { width: '240px', background: '#141428', padding: '12px', overflowY: 'auto', borderRight: '1px solid #2a2a4a', flexShrink: 0 },
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
  panelTitle: { fontSize: '13px', color: '#777', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px', fontWeight: '700', padding: '12px 14px', background: '#171728', border: '1px solid #292942', borderRadius: '9px' },
  panelTitleSelected: { color: '#111', background: '#F5C800', border: '1px solid #F5C800' },
  playerSlot: { display: 'flex', alignItems: 'stretch', gap: '6px', marginBottom: '7px' },
  playerBtn: { flex: 1, minHeight: '56px', padding: '10px 11px', background: '#1e1e38', color: 'white', border: '1px solid #2a2a4a', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px' },
  playerBtnTop: { display: 'flex', gap: '3px', alignItems: 'center', marginBottom: '1px' },
  playerBtnActive: { border: '4px solid #fff', outline: '3px solid #F5C800', boxShadow: '0 4px 12px rgba(245,200,0,0.35)' },
  playerBtnSubOut: { border: '1px solid #e74c3c' },
  playerBtnServer: { border: '1px solid #2ecc71' },
  posTag: { fontSize: '8px', color: '#555', fontWeight: '700', background: '#2a2a4a', padding: '1px 3px', borderRadius: '3px' },
  courtStateTag: { fontSize: '8px', color: '#aaa', fontWeight: '700', letterSpacing: '0.03em' },
  servTag: { fontSize: '8px', color: '#2ecc71', fontWeight: '700', background: '#0a2a0a', padding: '1px 3px', borderRadius: '3px' },
  libTag: { fontSize: '8px', color: '#F5C800', fontWeight: '700', background: '#1a1a00', padding: '1px 3px', borderRadius: '3px' },
  benchBtn: { background: '#111120', border: '1px solid #1e1e38', opacity: 0.65, marginBottom: '4px', width: '100%' },
  benchBtnActive: { opacity: 1, border: '1px solid #2ecc71', background: '#0a2a0a', cursor: 'pointer' },
  subBtn: { minWidth: '42px', padding: '0 9px', background: '#2a2a4a', color: '#aaa', border: '1px solid #3a3a5a', borderRadius: '7px', cursor: 'pointer', fontSize: '18px', flexShrink: 0 },
  jerseyNum: { fontSize: '11px', color: '#F5C800' },
  playerName: { fontSize: '14px', fontWeight: '700' },
  playerPos: { fontSize: '11px', color: '#777' },
  eventPanel: { flex: 1, padding: '12px', overflowY: 'auto' },
  eventGroup: { marginBottom: '14px' },
  eventGroupLabel: { fontSize: '10px', color: '#F5C800', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '7px' },
  serverOnlyHint: { color: '#888', fontWeight: '400', textTransform: 'none' },
  eventGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' },
  passingToggle: { marginBottom: '12px', padding: '10px 12px', color: '#aaa', background: '#20202f', border: '1px solid #555', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' },
  passingToggleOn: { color: '#111', background: '#F5C800', border: '1px solid #F5C800' },
  errorToggleOn: { color: '#fff', background: '#7d2929', border: '1px solid #d54a3e' },
  trackingError: { padding: '9px 14px', color: '#ffb4b4', background: '#3a1717', borderBottom: '1px solid #7d2929', fontSize: '12px', textAlign: 'center' },
  eventBtn: { padding: '16px 10px', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '12px', cursor: 'pointer', color: 'white', fontWeight: '800', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', minHeight: '72px', justifyContent: 'center', boxShadow: '0 3px 8px rgba(0,0,0,0.22)' },
  pointHint: { fontSize: '9px', fontWeight: '400', opacity: 0.8 },
  lastEvent: { fontSize: '11px', color: '#aaa', padding: '6px 10px', background: '#1a1a2e', borderRadius: '6px', display: 'inline-block', marginTop: '8px' },
  empty: { color: '#555', fontSize: '13px' },
};

// ── MOBILE STYLES ─────────────────────────────────────────────
const m = {
  page: { background: '#0f0f1a', height: '100vh', color: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  scoreBar: { display: 'flex', alignItems: 'center', background: '#1a1a2e', padding: '8px 10px', borderBottom: '1px solid #2a2a4a', flexShrink: 0 },
  scoreTeamBlock: { flex: 1, textAlign: 'center' },
  scoreTeamName: { fontSize: '9px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90px', margin: '0 auto' },
  scoreBig: { fontSize: '34px', fontWeight: '800', color: '#F5C800', lineHeight: 1 },
  scoreSets: { fontSize: '9px', color: '#888', marginTop: '1px' },
  scoreMid: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: '120px' },
  scoreSet: { fontSize: '12px', fontWeight: '700', color: '#ccc' },
  ptRow: { display: 'flex', gap: '5px', marginTop: '3px' },
  ptUs: { padding: '7px 12px', background: '#1f7a49', color: 'white', border: '1px solid #32a867', borderRadius: '7px', cursor: 'pointer', fontSize: '11px', fontWeight: '800' },
  ptThem: { padding: '7px 12px', background: '#a52b22', color: 'white', border: '1px solid #d54a3e', borderRadius: '7px', cursor: 'pointer', fontSize: '11px', fontWeight: '800' },
  courtSection: { background: '#141428', padding: '8px 10px 4px', flexShrink: 0 },
  courtNet: { textAlign: 'center', fontSize: '9px', color: '#F5C800', fontWeight: '700', letterSpacing: '0.15em', marginBottom: '5px' },
  courtRow: { display: 'flex', gap: '5px', marginBottom: '5px' },
  courtBaseline: { height: '1px', background: '#2a2a4a', marginBottom: '3px' },
  courtBaselineLabel: { textAlign: 'center', fontSize: '8px', color: '#444', letterSpacing: '0.1em', marginBottom: '3px' },
  courtTileWrapper: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '3px' },
  courtTile: { height: '64px', background: '#1e1e38', border: '2px solid #2a2a4a', borderRadius: '10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '3px', width: '100%' },
  courtTileSelected: { background: '#1a3a6e', border: '2px solid #4a90d9' },
  courtTileServer: { border: '2px solid #2ecc71', background: '#0a1a0a' },
  courtTileEmpty: { background: '#111120', border: '2px dashed #222', cursor: 'default' },
  courtTileEmptyText: { color: '#333', fontSize: '16px' },
  courtTilePos: { position: 'absolute', top: '3px', left: '5px', fontSize: '8px', color: '#555', fontWeight: '700' },
  courtTileInitials: { fontSize: '16px', fontWeight: '800', color: '#f0f0f0', lineHeight: 1 },
  courtTileNum: { fontSize: '10px', color: '#F5C800', fontWeight: '600', marginTop: '2px' },
  libBadge: { position: 'absolute', top: '2px', right: '3px', fontSize: '7px', color: '#F5C800', fontWeight: '700', background: '#1a1a00', padding: '1px 3px', borderRadius: '3px' },
  tileSubBtn: { height: '22px', background: '#2a2a4a', color: '#888', border: '1px solid #3a3a5a', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', width: '100%' },
  tileSubBtnActive: { background: '#e74c3c', color: 'white', border: '1px solid #e74c3c' },
  benchStrip: { background: '#0f0f1a', padding: '5px 10px', borderTop: '1px solid #1a1a2e', flexShrink: 0 },
  benchLabel: { fontSize: '9px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' },
  benchRow: { display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' },
  benchTile: { width: '44px', height: '44px', background: '#111120', border: '1px solid #1e1e38', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.6 },
  benchTileActive: { width: '52px', height: '52px', background: '#0a2a0a', border: '2px solid #2ecc71', borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  benchInitials: { fontSize: '13px', fontWeight: '700', color: '#f0f0f0' },
  benchNum: { fontSize: '9px', color: '#F5C800', marginTop: '1px' },
  cancelSubBtn: { padding: '6px 12px', background: 'transparent', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' },
  statSection: { flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 10px', overflow: 'hidden' },
  statBanner: { fontSize: '12px', color: '#ccc', marginBottom: '7px', minHeight: '24px', display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 8px', background: '#171728', borderRadius: '7px', border: '1px solid #292942' },
  clearBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '14px', marginLeft: '4px', padding: '0' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', flex: 1 },
  statBtn: { border: '1px solid rgba(255,255,255,0.14)', borderRadius: '11px', cursor: 'pointer', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 6px', minHeight: '56px', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' },
  statBtnLabel: { fontSize: '13px', fontWeight: '800', lineHeight: 1.1 },
  statBtnPts: { fontSize: '10px', fontWeight: '500', opacity: 0.85, marginTop: '3px' },
  lastEventBar: { fontSize: '10px', color: '#2ecc71', marginTop: '4px', padding: '4px 8px', background: '#0a2a0a', borderRadius: '6px' },
  bottomBar: { display: 'flex', gap: '6px', padding: '7px 10px', background: '#141428', borderTop: '1px solid #2a2a4a', flexShrink: 0 },
  undoBtn: { padding: '10px 14px', background: '#2a2a4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', minWidth: '60px' },
  endSetBtn: { flex: 1, padding: '10px', background: '#d35400', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  endMatchBtn: { flex: 1, padding: '10px', background: '#922b21', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  passingToggle: { width: '100%', padding: '8px', marginBottom: '8px', color: '#F5C800', background: '#20202f', border: '1px solid #555', borderRadius: '7px', fontSize: '11px', fontWeight: '600' },
  passingToggleOn: { color: '#111', background: '#F5C800', border: '1px solid #F5C800' },
  errorToggleOn: { color: '#fff', background: '#7d2929', border: '1px solid #d54a3e' },
  passGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '8px' },
  errorGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '8px' },
  passBtn: { padding: '10px 3px', color: 'white', background: '#246b63', border: 'none', borderRadius: '7px', fontSize: '11px', fontWeight: '700' },
  actionError: { padding: '8px 10px', color: '#ffb4b4', background: '#3a1717', borderBottom: '1px solid #7d2929', fontSize: '11px', textAlign: 'center' },
};

export default LiveMatch;
