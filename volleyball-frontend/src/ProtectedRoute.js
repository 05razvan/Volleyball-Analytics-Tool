import { Navigate } from 'react-router-dom';
import { isLoggedIn, getRole } from './auth';

function ProtectedRoute({ children, requiredRole }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (requiredRole && getRole() !== requiredRole) return <Navigate to="/teams" replace />;
  return children;
}

export default ProtectedRoute;