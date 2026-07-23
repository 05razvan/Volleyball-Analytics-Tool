import axios from 'axios';

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