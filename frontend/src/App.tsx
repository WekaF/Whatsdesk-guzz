import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useStore } from './store/useStore';
import Layout from './components/Layout';

declare const __BUILD_VERSION__: string;

// Auto reload if dynamic chunk loading fails (e.g. new deploy deleted old hashes)
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    const message = e.message || '';
    if (message.includes('Failed to fetch dynamically imported module') || message.includes('Importing a module script failed')) {
      window.location.reload();
    }
  }, true);
}

const Login = lazy(() => import('./pages/Login'));
const Landing = lazy(() => import('./pages/Landing'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Devices = lazy(() => import('./pages/Devices'));
const Messages = lazy(() => import('./pages/Messages'));
const Contacts = lazy(() => import('./pages/Contacts'));
const AutoReplies = lazy(() => import('./pages/AutoReplies'));
const Tasks = lazy(() => import('./pages/Tasks'));
const TaskCategories = lazy(() => import('./pages/TaskCategories'));
const TaskList = lazy(() => import('./pages/TaskList'));
const Settings = lazy(() => import('./pages/Settings'));
const Forbidden403 = lazy(() => import('./pages/Forbidden403'));
const Integrations = lazy(() => import('./pages/Integrations'));
const Subscription = lazy(() => import('./pages/Subscription'));

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 space-y-4 animate-fade-in">
      <div className="relative flex items-center justify-center">
        {/* Outer glowing ring */}
        <div className="w-12 h-12 rounded-full border-4 border-slate-200 dark:border-slate-800"></div>
        {/* Inner spinning loader */}
        <div 
          className="absolute w-12 h-12 rounded-full border-4 border-transparent animate-spin" 
          style={{ borderTopColor: '#25d366', borderRightColor: '#25d366' }}
        />
      </div>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400 animate-pulse-slow">
        Loading...
      </p>
    </div>
  );
}

const queryClient = new QueryClient();


// Global API event listener for client-side routing
function NavigationListener() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handle403 = () => {
      navigate('/403');
    };
    window.addEventListener('api-403', handle403);
    return () => {
      window.removeEventListener('api-403', handle403);
    };
  }, [navigate]);

  // Check version on every route change
  useEffect(() => {
    if (typeof __BUILD_VERSION__ === 'undefined') return;

    const checkVersion = async () => {
      try {
        const res = await fetch('/version.json?t=' + new Date().getTime());
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.version && data.version !== __BUILD_VERSION__) {
          console.log('New build detected on route change, reloading...', data.version);
          window.location.reload();
        }
      } catch (err) {
        // ignore errors
      }
    };
    checkVersion();
  }, [location]);

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

// Public Route Guard (Redirect to dashboard if already logged in)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const token = useStore((state) => state.token);

  if (token) {
    return <Navigate to="/dashboard" replace />;
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

  // Periodic check for new build version (every 60 seconds)
  useEffect(() => {
    if (typeof __BUILD_VERSION__ === 'undefined') return;

    const checkVersion = async () => {
      try {
        const res = await fetch('/version.json?t=' + new Date().getTime());
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.version && data.version !== __BUILD_VERSION__) {
          console.log('New build detected on periodic check, reloading...', data.version);
          window.location.reload();
        }
      } catch (err) {
        // ignore errors
      }
    };

    const interval = setInterval(checkVersion, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NavigationListener />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Landing Page */}
            <Route path="/" element={<Landing />} />

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
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/auto-replies" element={<AutoReplies />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/task-categories" element={<TaskCategories />} />
              <Route path="/task-list" element={<TaskList />} />
              <Route path="/integrasi" element={<Integrations />} />
              <Route path="/billing" element={<Subscription />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/403" element={<Forbidden403 />} />
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Router>
    </QueryClientProvider>
  );
}
