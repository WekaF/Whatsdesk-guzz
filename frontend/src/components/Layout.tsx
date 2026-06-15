import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { api } from '../services/api';
import { LayoutDashboard, TabletSmartphone, MessageSquare, MessageCircle, User, ClipboardList, ListTodo, Tag, Users, Bot, Settings, LogOut, Sun, Moon, ChevronLeft, ChevronRight } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout, setDevices, permissions, setPermissions, theme, setTheme } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const newVal = !prev;
      localStorage.setItem('sidebar-collapsed', String(newVal));
      return newVal;
    });
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // Fetch devices globally and permissions on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [devList, perms] = await Promise.all([
          api.listDevices().catch(() => []),
          api.getCurrentUserPermissions().catch(() => [])
        ]);
        setDevices(devList);
        setPermissions(perms);
      } catch (err) {
        console.error('Failed to preload layout data:', err);
      }
    };
    loadData();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, key: 'dashboard' },
    { path: '/devices', label: 'Devices', icon: TabletSmartphone, key: 'devices' },
    { path: '/messages', label: 'Messages', icon: MessageSquare, key: 'messages' },
    { path: '/contacts', label: 'Contacts', icon: Users, key: 'contacts' },
    { path: '/auto-replies', label: 'Auto Replies', icon: Bot, key: 'auto-replies' },
    { path: '/tasks', label: 'Tasks', icon: ClipboardList, key: 'tasks' },
    { path: '/task-categories', label: 'Task Categories', icon: Tag, key: 'task-categories' },
    { path: '/task-list', label: 'Task List', icon: ListTodo, key: 'task-list' },
  ];

  const filteredNavItems = navItems.filter(item => {
    if (user?.role === 'admin') return true;
    return permissions.some(p => p.key === item.key);
  });

  const hasSettingsAccess = user?.role === 'admin' || permissions.some(p => p.key === 'users' || p.key === 'roles');
  if (hasSettingsAccess) {
    filteredNavItems.push({ path: '/settings', label: 'Settings', icon: Settings, key: 'settings' });
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[#070b19] text-slate-900 dark:text-[#e2e8f0] transition-colors duration-300">
      {/* Sidebar */}
      <aside className={`relative z-30 transition-all duration-300 ease-in-out border-r border-slate-200 dark:border-[#1e293b]/40 bg-white dark:bg-[#0d1428]/45 dark:backdrop-blur-md flex flex-col justify-between ${isCollapsed ? 'w-20' : 'w-64'}`}>
        <div>
          {/* Logo */}
          <div className={`h-16 flex items-center border-b border-slate-200 dark:border-[#1e293b]/40 gap-3 transition-all duration-300 ${isCollapsed ? 'px-4 justify-center' : 'px-6 justify-between'}`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-whatsapp flex items-center justify-center glow-green flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-white dark:text-black" />
              </div>
              {!isCollapsed && (
                <span className="font-semibold text-lg tracking-wider text-slate-900 dark:text-white truncate">
                  WHAT DEKS
                </span>
              )}
            </div>
            <button
              onClick={toggleSidebar}
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
              title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            </button>
          </div>

          {/* Navigation */}
          <nav className="p-4 space-y-1">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`group/nav-item relative flex items-center rounded-xl transition-all duration-200 ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'} ${isActive
                    ? 'bg-whatsapp/10 dark:bg-whatsapp/10 text-emerald-600 dark:text-whatsapp font-medium shadow-inner'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/40'
                    }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                  
                  {/* Floating Tooltip when Collapsed */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-3 px-3 py-2 bg-slate-905 dark:bg-slate-800 text-white text-xs font-semibold rounded-lg opacity-0 pointer-events-none group-hover/nav-item:opacity-100 group-hover/nav-item:translate-x-1.5 transition-all duration-200 whitespace-nowrap shadow-lg z-[9999] border border-slate-700/10 dark:border-slate-700/20">
                      {item.label}
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-slate-905 dark:border-r-slate-800" />
                    </div>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Info / Logout */}
        <div className="p-4 border-t border-slate-200 dark:border-[#1e293b]/40">
          <div className={`group/user-info relative flex items-center gap-3 mb-4 transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'px-2'}`}>
            <div className="w-10 h-10 rounded-full bg-slate-150 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 flex-shrink-0">
              <User className="w-5 h-5" />
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden">
                <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
            )}

            {/* User Profile Tooltip when Collapsed */}
            {isCollapsed && (
              <div className="absolute left-full ml-3 p-3 bg-slate-905 dark:bg-slate-800 text-white text-xs rounded-lg opacity-0 pointer-events-none group-hover/user-info:opacity-100 group-hover/user-info:translate-x-1.5 transition-all duration-200 whitespace-nowrap shadow-lg z-[9999] border border-slate-700/10 dark:border-slate-700/20">
                <p className="font-bold">{user?.name}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{user?.email}</p>
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-slate-905 dark:border-r-slate-800" />
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className={`group/logout relative flex items-center justify-center rounded-xl border border-red-500/20 text-red-600 dark:text-red-400 hover:text-white dark:hover:text-white hover:bg-red-550 dark:hover:bg-red-500/10 transition-all duration-200 text-sm font-medium ${isCollapsed ? 'w-10 h-10 p-0' : 'w-full gap-2 px-4 py-2.5'}`}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!isCollapsed && <span>Sign Out</span>}

            {/* Logout Tooltip when Collapsed */}
            {isCollapsed && (
              <div className="absolute left-full ml-3 px-3 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg opacity-0 pointer-events-none group-hover/logout:opacity-100 group-hover/logout:translate-x-1.5 transition-all duration-200 whitespace-nowrap shadow-lg z-[9999]">
                Sign Out
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-red-600" />
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-slate-200 dark:border-[#1e293b]/40 bg-white dark:bg-[#0d1428]/45 dark:backdrop-blur-md flex items-center justify-end px-8">
          <div className="flex items-center gap-4">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-slate-100 dark:bg-[#1e293b]/30 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
            </button>

            <div className="flex items-center gap-2 text-xs bg-slate-100 dark:bg-[#1e293b]/30 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-slate-600 dark:text-slate-400 font-medium">Gateway Online</span>
            </div>
          </div>
        </header>

        {/* Page Container */}
        <main className="flex-1 overflow-y-auto p-10">
          <div className="mx-auto space-y-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
