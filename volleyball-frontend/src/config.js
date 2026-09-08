export const API_BASE_URL = (
  process.env.REACT_APP_API_URL ||
  'https://volleyball-analytics-tool-production.up.railway.app'
).replace(/\/$/, '');
