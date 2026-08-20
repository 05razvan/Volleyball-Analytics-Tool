import axios from 'axios';

const BASE_URL = 'https://volleyball-analytics-tool-production.up.railway.app';

const getHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const api = {
  get: (path) => axios.get(`${BASE_URL}${path}`, { headers: getHeaders() }),
  post: (path, data) => axios.post(`${BASE_URL}${path}`, data, { headers: getHeaders() }),
  patch: (path, data) => axios.patch(`${BASE_URL}${path}`, data, { headers: getHeaders() }),
  delete: (path) => axios.delete(`${BASE_URL}${path}`, { headers: getHeaders() }),
};

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
export const saveLineup = (matchId, data) => api.post(`/matches/${matchId}/lineup`, data);
export const getLineup = (matchId) => api.get(`/matches/${matchId}/lineup`);

export const getAvailability = (matchId) => api.get(`/availability/${matchId}`);
export const setAvailability = (data) => api.post('/availability/', data);

export const getTeamAnalytics = (teamId, query = '') =>
  api.get(`/analytics/team/${teamId}${query}`);
export const getPlayerAnalytics = (playerId, lastN) =>
  api.get(`/analytics/player/${playerId}${lastN ? `?last_n=${lastN}` : ''}`);
export const getTeamTrend = (teamId, lastN = 99) =>
  api.get(`/analytics/team/${teamId}/trend?last_n=${lastN}`);
export const getPlayerMatchHistory = (playerId) =>
  api.get(`/analytics/player/${playerId}/matches`);
export const getTopPerformers = (teamId) =>
  api.get(`/analytics/team/${teamId}/top-performers`);
export const getMatchCount = (teamId) =>
  api.get(`/analytics/team/${teamId}/match-count`);
export const getMatchTopPerformers = (matchId) =>
  api.get(`/analytics/match/${matchId}/top`);

export const login = (data) => {
  const form = new URLSearchParams();
  form.append('username', data.email);
  form.append('password', data.password);
  return axios.post(`${BASE_URL}/auth/login`, form);
};
export const getMe = () => api.get('/auth/me');
export const createAccount = (data) => api.post('/auth/create-account', data);

export const getPendingRequests = () => api.get('/join-requests/pending');
export const requestToJoin = (teamId) =>
  api.post('/join-requests/', { team_id: teamId });
export const approveRequest = (id) => api.post(`/join-requests/${id}/approve`);
export const rejectRequest = (id) => api.post(`/join-requests/${id}/reject`);
export const leaveTeam = () => api.post('/join-requests/leave');

export const updatePlayerProfile = (playerId, data) =>
  api.patch(`/players/${playerId}/profile`, data);
export const removeFromTeam = (playerId) =>
  api.post(`/players/${playerId}/remove-from-team`);
export const demotePlayer = (playerId) =>
  api.post(`/players/${playerId}/demote`);
export const promoteCaptain = (playerId) =>
  api.post(`/players/${playerId}/promote-captain`);
export const getMatchSets = (matchId) => api.get(`/matches/${matchId}/sets`);