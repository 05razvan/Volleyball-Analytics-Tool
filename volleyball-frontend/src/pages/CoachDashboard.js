import { useEffect, useState } from 'react';
import { getPendingRequests, approveRequest, rejectRequest, getTeams } from '../api';

function CoachDashboard() {
  const [requests, setRequests] = useState([]);
  const [teams, setTeams] = useState([]);

  useEffect(() => {
    getPendingRequests().then(res => setRequests(res.data));
    getTeams().then(res => setTeams(res.data));
  }, []);

  const teamName = (id) => teams.find(t => t.id === id)?.name ?? 'Unknown';

  const handle = async (id, action) => {
    action === 'approve' ? await approveRequest(id) : await rejectRequest(id);
    setRequests(prev => prev.filter(r => r.id !== id));
  };

  return (
    <div>
      <h2 style={styles.heading}>Join requests</h2>
      {requests.length === 0
        ? <p style={styles.empty}>No pending requests.</p>
        : requests.map(r => (
          <div key={r.id} style={styles.card}>
            <div>
              <strong>User #{r.user_id}</strong>
              <div style={styles.meta}>Requesting to join <strong>{teamName(r.team_id)}</strong></div>
            </div>
            <div style={styles.actions}>
              <button style={styles.approveBtn} onClick={() => handle(r.id, 'approve')}>
                Approve
              </button>
              <button style={styles.rejectBtn} onClick={() => handle(r.id, 'reject')}>
                Reject
              </button>
            </div>
          </div>
        ))
      }
    </div>
  );
}

const styles = {
  heading: { marginBottom: '24px', fontSize: '24px', color: '#f0f0f0' },
  empty: { color: '#555', fontSize: '14px' },
  card: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 18px', background: '#1a1a1a', borderRadius: '8px',
    border: '1px solid #2a2a2a', marginBottom: '8px' },
  meta: { color: '#888', fontSize: '13px', marginTop: '3px' },
  actions: { display: 'flex', gap: '8px' },
  approveBtn: { padding: '7px 16px', background: '#F5C800', color: '#111',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontSize: '13px', fontWeight: '600' },
  rejectBtn: { padding: '7px 16px', background: '#2a2a2a', color: '#ff6b6b',
    border: '1px solid #ff6b6b', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
};

export default CoachDashboard;