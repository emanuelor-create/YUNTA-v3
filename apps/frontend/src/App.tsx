import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { AdminUsersPage } from './features/admin/AdminUsersPage';
import { BoardPage } from './features/board/BoardPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { LoginPage } from './features/auth/LoginPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { ProjectSummaryTab } from './features/projects/ProjectSummaryTab';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
