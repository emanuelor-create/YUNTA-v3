import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { AdminUsersPage } from './features/admin/AdminUsersPage';
import { useAuth } from './features/auth/AuthProvider';
import { BoardPage } from './features/board/BoardPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { LoginPage } from './features/auth/LoginPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { ProjectSummaryTab } from './features/projects/ProjectSummaryTab';

const RESET_PATH = '/nueva-contrasena';

export default function App() {
  const { recovering } = useAuth();
  const location = useLocation();

  // Se entró con el link del mail: antes que nada, elegir la contraseña nueva.
  if (recovering && location.pathname !== RESET_PATH) {
    return <Navigate to={RESET_PATH} replace />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path={RESET_PATH} element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id/resumen" element={<ProjectSummaryTab />} />
          <Route path="/projects/:id/tablero" element={<BoardPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
