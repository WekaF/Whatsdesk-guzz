import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { api } from '../services/api';
import { LayoutDashboard, TabletSmartphone, MessageSquare, MessageCircle, User, ClipboardList, ListTodo, Tag, Users, Bot, Settings, LogOut, Sun, Moon, ChevronLeft, KeyRound, CreditCard } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, updateUser, logout, setDevices, permissions, setPermissions, theme, setTheme } = useStore();
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

  // Fetch devices globally, user profile, and permissions on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [devList, perms] = await Promise.all([
          api.listDevices().catch(() => []),
          api.getCurrentUserPermissions().catch(() => [])
        ]);
        setDevices(devList);
        setPermissions(perms);
        
        if (user?.uuid) {
          const freshUser = await api.getUser(user.uuid).catch(() => null);
          if (freshUser) {
            updateUser(freshUser);
          }
        }
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
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, key: 'dashboard' },
    { path: '/devices', label: 'Devices', icon: TabletSmartphone, key: 'devices' },
    { path: '/messages', label: 'Messages', icon: MessageSquare, key: 'messages' },
    { path: '/contacts', label: 'Contacts', icon: Users, key: 'contacts' },
    { path: '/auto-replies', label: 'Auto Replies', icon: Bot, key: 'auto-replies' },
    { path: '/tasks', label: 'Tasks', icon: ClipboardList, key: 'tasks' },
    { path: '/task-categories', label: 'Task Categories', icon: Tag, key: 'task-categories' },
    { path: '/task-list', label: 'Task List', icon: ListTodo, key: 'task-list' },
    { path: '/integrasi', label: 'Integrasi', icon: KeyRound, key: 'integrasi' },
    { path: '/billing', label: 'Subscription', icon: CreditCard, key: 'billing' },
  ];

  const filteredNavItems = navItems.filter(item => {
    if (user?.role === 'superadmin') return true;
    if (item.key === 'billing') {
      return user?.role === 'owner_subscriber';
    }
    return permissions.some(p => p.key === item.key);
  });

  const hasSettingsAccess = user?.role === 'superadmin' || permissions.some(p => p.key === 'users' || p.key === 'roles');
  if (hasSettingsAccess) {
    filteredNavItems.push({ path: '/settings', label: 'Settings', icon: Settings, key: 'settings' });
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[#060a14] text-slate-900 dark:text-[#e2e8f0] transition-colors duration-300">
      {/* Sidebar */}
      <aside className={`relative z-30 transition-all duration-300 ease-in-out border-r border-slate-200 dark:border-slate-800/60 bg-white dark:bg-[#0a1020]/80 dark:backdrop-blur-xl flex flex-col justify-between ${isCollapsed ? 'w-[72px]' : 'w-60'}`}>
        <div>
          {/* Workspace Switcher Header */}
          <div className={`h-14 flex items-center border-b border-slate-200 dark:border-slate-800/60 gap-3 transition-all duration-300 ${isCollapsed ? 'px-3 justify-center' : 'px-4 justify-between'}`}>
            {isCollapsed ? (
              <div className="w-8 h-8 rounded-md bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center badge-glow-green shadow-sm flex-shrink-0 cursor-pointer" onClick={toggleSidebar}>
                <MessageCircle className="w-4.5 h-4.5 text-white" />
              </div>
            ) : (
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/60 rounded-md w-full select-none cursor-pointer justify-between group hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-black shadow-sm flex-shrink-0">
                    W
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="font-bold text-xs text-slate-900 dark:text-white truncate tracking-tight title-tracking">WhatsDesk Inc.</p>
                    <p className="text-[9px] text-slate-500 font-medium truncate">Gateway Workspace</p>
                  </div>
                </div>
                <button
                  onClick={toggleSidebar}
                  className="p-0.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all cursor-pointer flex-shrink-0"
                  title="Collapse Sidebar"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="p-3 space-y-0.5">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`group/nav-item relative flex items-center transition-all duration-150 ${isCollapsed ? 'justify-center p-2.5 rounded-md' : 'gap-3 px-3 py-2.5 rounded-md'} ${isActive
                    ? 'nav-active'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50'
                    }`}
                >
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                  {!isCollapsed && <span className="text-[13px] truncate">{item.label}</span>}
                  
                  {/* Floating Tooltip when Collapsed */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-2.5 px-2.5 py-1.5 bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-semibold rounded-md opacity-0 pointer-events-none group-hover/nav-item:opacity-100 group-hover/nav-item:translate-x-1 transition-all duration-150 whitespace-nowrap shadow-lg z-[9999] border border-slate-700/30">
                      {item.label}
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-[4px] border-transparent border-r-slate-900 dark:border-r-slate-800" />
                    </div>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Info / Logout */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800/60">
          <div className={`group/user-info relative flex items-center gap-2.5 mb-3 transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'px-2'}`}>
            <div className="w-9 h-9 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 flex-shrink-0">
              <User className="w-4.5 h-4.5" />
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden">
                <p className="font-semibold text-[13px] text-slate-900 dark:text-white truncate">{user?.name}</p>
                <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
              </div>
            )}

            {/* User Profile Tooltip when Collapsed */}
            {isCollapsed && (
              <div className="absolute left-full ml-2.5 p-2.5 bg-slate-900 dark:bg-slate-800 text-white text-[11px] rounded-md opacity-0 pointer-events-none group-hover/user-info:opacity-100 group-hover/user-info:translate-x-1 transition-all duration-150 whitespace-nowrap shadow-lg z-[9999] border border-slate-700/30">
                <p className="font-bold">{user?.name}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{user?.email}</p>
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-[4px] border-transparent border-r-slate-900 dark:border-r-slate-800" />
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className={`group/logout relative flex items-center justify-center rounded-md border border-red-200 dark:border-red-500/20 text-red-500 dark:text-red-400 hover:text-white dark:hover:text-white hover:bg-red-500 dark:hover:bg-red-500/20 transition-all duration-150 text-[13px] font-medium ${isCollapsed ? 'w-9 h-9 p-0' : 'w-full gap-2 px-3 py-2'}`}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!isCollapsed && <span>Sign Out</span>}

            {/* Logout Tooltip when Collapsed */}
            {isCollapsed && (
              <div className="absolute left-full ml-2.5 px-2.5 py-1.5 bg-red-600 text-white text-[11px] font-semibold rounded-md opacity-0 pointer-events-none group-hover/logout:opacity-100 group-hover/logout:translate-x-1 transition-all duration-150 whitespace-nowrap shadow-lg z-[9999]">
                Sign Out
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-[4px] border-transparent border-r-red-600" />
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b border-slate-200 dark:border-slate-800/60 bg-white dark:bg-[#0a1020]/80 dark:backdrop-blur-xl flex items-center justify-end px-6">
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-md bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/40 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="flex items-center gap-2 text-[11px] bg-slate-100 dark:bg-slate-800/60 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-slate-500 dark:text-slate-400 font-medium">Gateway Online</span>
            </div>
          </div>
        </header>

        {/* Page Container */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-50/20 dark:bg-[#060a14] bg-grid-pattern transition-colors duration-300">
          <div className="mx-auto space-y-8 animate-fade-in relative z-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
