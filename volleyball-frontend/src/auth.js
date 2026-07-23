import axios from 'axios';

export const setAuthToken = (token) => {
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem('token', token);
  } else {
    delete axios.defaults.headers.common['Authorization'];
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('user_id');
    localStorage.removeItem('email');
  }
};

export const loadStoredToken = () => {
  const token = localStorage.getItem('token');
  if (token) setAuthToken(token);
  return token;
};

export const getRole = () => localStorage.getItem('role');
export const getUserId = () => parseInt(localStorage.getItem('user_id'));
export const isLoggedIn = () => !!localStorage.getItem('token');
