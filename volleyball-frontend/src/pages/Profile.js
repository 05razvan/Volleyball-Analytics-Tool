import { useEffect, useState } from 'react';
import { getMe, getPlayerAnalytics, getPlayerMatchHistory, updatePrivacy, leaveTeam } from '../api';

function Profile() {
  const [me, setMe] = useState(null);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [leaveMsg, setLeaveMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const meRes = await getMe();
        setMe(meRes.data);
        if (meRes.data.role !== 'coach' && meRes.data.role !== 'admin') {
          try {
            const statsRes = await getPlayerAnalytics(meRes.data.user_id);
            setStats(statsRes.data);
            setIsPrivate(statsRes.data.is_private ?? false);
            const histRes = await getPlayerMatchHistory(meRes.data.user_id);
            setHistory(histRes.data);
          } catch { }
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handlePrivacyToggle = async () => {
    const newVal = !isPrivate;
    setIsPrivate(newVal);
    try {
      await updatePrivacy(me.user_id, newVal);
    } catch {
      setIsPrivate(!newVal);
    }
  };

  const handleLeaveTeam = async () => {
    if (!window.confirm('Are you sure you want to leave your team?')) return;
    try {
      await leaveTeam();
      setLeaveMsg('You have left your team.');
      setMe(prev => ({ ...prev, team_name: null, team_id: null }));
    } catch (err) {
      setLeaveMsg(err.response?.data?.detail || 'Something went wrong.');
    }
  };

  if (loading) return <div style={styles.empty}>Loading...</div>;

  const isCoach = me?.role === 'coach' || me?.role === 'admin';

  return (
    <div>
      <h2 style={styles.heading}>My profile</h2>

      <div style={styles.card}>
        <div style={styles.profileRow}>
          <div style={styles.avatar}>
            {me?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={styles.name}>{me?.name}</div>
            <div style={styles.email}>{me?.email}</div>
            <div style={styles.roleBadge}>{me?.role}</div>
            {me?.team_name && (
              <div style={styles.teamTag}>🏐 {me.team_name}</div>
            )}
            {!me?.team_name && !isCoach && (
              <div style={styles.noTeam}>Not on a team yet</div>
            )}
          </div>
        </div>

        {!isCoach && me?.team_name && (
          <div style={styles.actions}>
            <div style={styles.privacyRow}>
              <div>
                <div style={styles.privacyLabel}>Private profile</div>
                <div style={styles.privacyHint}>
                  Hide your stats from other users
                </div>
              </div>
              <button
                style={{ ...styles.toggle, ...(isPrivate ? styles.toggleOn : {}) }}
                onClick={handlePrivacyToggle}>
                {isPrivate ? 'On' : 'Off'}
              </button>
            </div>
            <button style={styles.leaveBtn} onClick={handleLeaveTeam}>
              Leave team
            </button>
            {leaveMsg && <p style={styles.leaveMsg}>{leaveMsg}</p>}
          </div>
        )}
      </div>

      {isCoach && (
        <div style={styles.coachNote}>
          <p>Coaches don't have player stats. Head to the Analytics page to view your team's performance.</p>
        </div>
      )}

      {!isCoach && stats && (
        <>
          <h3 style={styles.sectionTitle}>Season stats</h3>
          <div style={styles.pillRow}>
            {[
              { label: 'Kills', value: stats.kills, color: '#2ecc71' },
              { label: 'Aces', value: stats.aces, color: '#3498db' },
              { label: 'Blocks', value: stats.blocks, color: '#9b59b6' },
              { label: 'Digs', value: stats.digs, color: '#1abc9c' },
              { label: 'Assists', value: stats.assists, color: '#e67e22' },
            ].map(s => (
              <div key={s.label} style={styles.pill}>
                <div style={{ ...styles.pillValue, color: s.color }}>{s.value}</div>
                <div style={styles.pillLabel}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={styles.pillRow}>
            {[
              { label: 'Kill %', value: `${stats.kill_pct}%` },
              { label: 'Serve %', value: `${stats.serve_pct}%` },
              { label: 'Attack eff.', value: `${stats.attack_efficiency}%` },
            ].map(s => (
              <div key={s.label} style={styles.pill}>
                <div style={{ ...styles.pillValue, color: '#F5C800' }}>{s.value}</div>
                <div style={styles.pillLabel}>{s.label}</div>
              </div>
            ))}
          </div>

          {history.length > 0 && (
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
                {history.map(h => (
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

          {history.length === 0 && (
            <p style={styles.empty}>No match history yet.</p>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  heading: { marginBottom: '24px', fontSize: '24px', color: '#f0f0f0' },
  card: {
    background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px',
    padding: '24px', marginBottom: '28px',
  },
  profileRow: { display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' },
  avatar: {
    width: '56px', height: '56px', borderRadius: '50%', background: '#F5C800',
    color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '24px', fontWeight: '700', flexShrink: 0,
  },
  name: { fontSize: '18px', fontWeight: '700', color: '#f0f0f0', marginBottom: '2px' },
  email: { fontSize: '13px', color: '#888', marginBottom: '8px' },
  roleBadge: {
    display: 'inline-block', background: '#2a2a2a', color: '#ccc',
    padding: '2px 10px', borderRadius: '10px', fontSize: '12px',
    textTransform: 'capitalize', marginBottom: '8px',
  },
  teamTag: {
    display: 'inline-block', background: '#1a1a00', color: '#F5C800',
    padding: '3px 10px', borderRadius: '10px', fontSize: '12px',
    fontWeight: '500', border: '1px solid #3a3a00',
  },
  noTeam: { color: '#555', fontSize: '13px' },
  actions: { borderTop: '1px solid #2a2a2a', paddingTop: '16px' },
  privacyRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '14px',
  },
  privacyLabel: { fontSize: '14px', color: '#f0f0f0', marginBottom: '2px' },
  privacyHint: { fontSize: '12px', color: '#888' },
  toggle: {
    padding: '6px 16px', background: '#2a2a2a', color: '#888',
    border: '1px solid #333', borderRadius: '20px', cursor: 'pointer',
    fontSize: '13px', fontWeight: '600', minWidth: '52px',
  },
  toggleOn: { background: '#F5C800', color: '#111', border: '1px solid #F5C800' },
  leaveBtn: {
    padding: '8px 16px', background: 'transparent', color: '#e74c3c',
    border: '1px solid #e74c3c', borderRadius: '6px', cursor: 'pointer',
    fontSize: '13px',
  },
  leaveMsg: { color: '#888', fontSize: '13px', marginTop: '8px' },
  coachNote: {
    background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px',
    padding: '20px', color: '#888', fontSize: '14px',
  },
  sectionTitle: {
    fontSize: '13px', fontWeight: '600', color: '#F5C800',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    marginBottom: '14px', marginTop: '4px',
  },
  pillRow: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' },
  pill: {
    background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px',
    padding: '14px 16px', minWidth: '90px', flex: 1,
  },
  pillValue: { fontSize: '22px', fontWeight: '700', lineHeight: 1, marginBottom: '5px' },
  pillLabel: { fontSize: '11px', color: '#888', textTransform: 'uppercase' },
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
  empty: { color: '#555', fontSize: '14px', marginTop: '8px' },
};

export default Profile;