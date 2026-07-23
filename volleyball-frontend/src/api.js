import axios from 'axios';

const token = localStorage.getItem('token');
if (token) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

const api = axios.create({ baseURL: 'http://localhost:8000' });

export const getTeams = () => api.get('/teams/');
export const createTeam = (data) => api.post('/teams/', data);

export const getPlayers = () => api.get('/players/');
export const getPlayersByTeam = (teamId) => api.get(`/players/?team_id=${teamId}`);
export const createPlayer = (data) => api.post('/players/', data);

export const getMatches = () => api.get('/matches/');
export const createMatch = (data) => api.post('/matches/', data);
export const startMatch = (matchId) => api.post(`/matches/${matchId}/start`);
export const getScore = (matchId) => api.get(`/matches/${matchId}/score`);
export const logEvent = (matchId, data) => api.post(`/matches/${matchId}/event`, data);
export const undoEvent = (matchId) => api.delete(`/matches/${matchId}/event/undo`);
export const endSet = (matchId) => api.post(`/matches/${matchId}/end-set`);
export const completeMatch = (matchId) => api.post(`/matches/${matchId}/complete`);
export const getEvents = (matchId) => api.get(`/matches/${matchId}/events`);

export const getAvailability = (matchId) => api.get(`/availability/${matchId}`);
export const setAvailability = (data) => api.post('/availability/', data);

export const getTeamAnalytics = (teamId, query = '') => api.get(`/analytics/team/${teamId}${query}`);
export const getPlayerAnalytics = (playerId) => api.get(`/analytics/player/${playerId}`);
export const getTeamTrend = (teamId, lastN = 99) => api.get(`/analytics/team/${teamId}/trend?last_n=${lastN}`);
export const getPlayerMatchHistory = (playerId) => api.get(`/analytics/player/${playerId}/matches`);

export const register = (data) => api.post('/auth/register', data);
export const login = (data) => {
  const form = new URLSearchParams();
  form.append('username', data.email);
  form.append('password', data.password);
  return api.post('/auth/login', form);
};
export const getMe = () => api.get('/auth/me');
export const getPendingRequests = () => api.get('/join-requests/pending');
export const requestToJoin = (teamId) => api.post('/join-requests/', { team_id: teamId });
export const approveRequest = (id) => api.post(`/join-requests/${id}/approve`);
export const rejectRequest = (id) => api.post(`/join-requests/${id}/reject`);

export const getTopPerformers = (teamId) => api.get(`/analytics/team/${teamId}/top-performers`);
export const getMatchCount = (teamId) => api.get(`/analytics/team/${teamId}/match-count`);
export const updatePrivacy = (playerId, isPrivate) => api.patch(`/players/${playerId}/privacy`, { is_private: isPrivate });
export const leaveTeam = () => api.post('/join-requests/leave');