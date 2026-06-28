import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useStore } from './store/useStore';
import { api, getTokenExpiryUnix } from './services/api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import Messages from './pages/Messages';
import Contacts from './pages/Contacts';
import AutoReplies from './pages/AutoReplies';
import Tasks from './pages/Tasks';
import TaskCategories from './pages/TaskCategories';
import TaskList from './pages/TaskList';
import Settings from './pages/Settings';
import Forbidden403 from './pages/Forbidden403';

const queryClient = new QueryClient();


// Global API event listener for client-side routing
function NavigationListener() {
  const navigate = useNavigate();
  const logout = useStore((state) => state.logout);
  const token = useStore((state) => state.token);

  useEffect(() => {
    const handle403 = () => navigate('/403');
    window.addEventListener('api-403', handle403);
    return () => window.removeEventListener('api-403', handle403);
  }, [navigate]);

  useEffect(() => {
    const handle401 = () => {
      logout();
      navigate('/login', { replace: true });
    };
    window.addEventListener('api-401', handle401);
    return () => window.removeEventListener('api-401', handle401);
  }, [navigate, logout]);

  useEffect(() => {
    if (!token) return;
    const exp = getTokenExpiryUnix(token);
    if (!exp) return;
    const nowUnix = Math.floor(Date.now() / 1000);
    if (exp - nowUnix < 24 * 60 * 60) {
      api.refreshToken();
    }
  }, [token]);

  return null;
}

// Auth Guard Layout Wrapper
function ProtectedRouteLayout() {
  const token = useStore((state) => state.token);
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

// Public Route Guard (Redirect to home if already logged in)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const token = useStore((state) => state.token);

  if (token) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const theme = useStore((state) => state.theme);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NavigationListener />
        <Routes>
          {/* Public Authentication Route */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />

          {/* Protected Main Routes */}
          <Route element={<ProtectedRouteLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/auto-replies" element={<AutoReplies />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/task-categories" element={<TaskCategories />} />
            <Route path="/task-list" element={<TaskList />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/403" element={<Forbidden403 />} />
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
