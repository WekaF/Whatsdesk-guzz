import { useEffect, useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../services/api';
import {
  Smartphone, Send, ShieldCheck, Cpu, Database, RefreshCw,
  Clock, CheckCircle2, XCircle, Activity, Layers, Zap,
  UserCheck, Inbox, ChevronRight, Users, ListTodo
} from 'lucide-react';

interface QueueStats {
  stream_length: number;
  pending_in_queue: number;
  consumer_count: number;
  db_pending: number;
  db_sent: number;
  db_delivered: number;
  db_failed: number;
  db_total: number;
  redis_connected: boolean;
}

interface CategoryTaskStats {
  category_id?: number;
  category_name: string;
  color: string;
  total: number;
  open: number;
  in_progress: number;
  on_hold: number;
  closed: number;
}

interface TaskStats {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  on_hold: number;
  categories?: CategoryTaskStats[];
}

// Helper to generate consistent, premium gradients for avatars based on phone numbers
const getAvatarGradient = (str: string) => {
  const clean = str.replace(/[^0-9]/g, '');
  let val = 0;
  if (clean) {
    val = parseInt(clean.slice(-3) || '0', 10);
  } else {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    val = Math.abs(hash);
  }
  const gradients = [
    'from-indigo-500 via-purple-500 to-pink-500',
    'from-emerald-400 via-teal-500 to-cyan-500',
    'from-amber-400 via-orange-500 to-red-500',
    'from-blue-500 via-indigo-500 to-purple-600',
    'from-fuchsia-500 via-pink-500 to-rose-500',
    'from-cyan-400 via-sky-500 to-blue-500',
  ];
  return gradients[val % gradients.length];
};

export default function Dashboard() {
  const { devices, setDevices, user } = useStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [taskStats, setTaskStats] = useState<TaskStats | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [dateRangeType, setDateRangeType] = useState<string>('all');
  const [statsLoading, setStatsLoading] = useState(false);
  const isInitialMount = useRef(true);

  // State for dashboard tasks list
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [unassignedTasks, setUnassignedTasks] = useState<any[]>([]);
  const [myTasksActiveStatus, setMyTasksActiveStatus] = useState<string>('all');
  const [tasksLoading, setTasksLoading] = useState(false);

  // State for user list & task details by status
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [selectedUserTasks, setSelectedUserTasks] = useState<any[]>([]);
  const [selectedTasksLoading, setSelectedTasksLoading] = useState(false);

  const fetchTaskStatsData = async (start?: string, end?: string) => {
    setStatsLoading(true);
    try {
      const data = await api.getTaskStats(start, end);
      setTaskStats(data);
    } catch (err) {
      console.error('Failed to load task stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchDashboardTasks = async (start?: string, end?: string) => {
    if (!user) return;
    setTasksLoading(true);
    try {
      const myTasksResp = await api.listTasks(
        undefined, undefined, 1, 100, undefined,
        user.id.toString(), undefined, start, end
      );
      setMyTasks(myTasksResp.data || []);

      const unassignedResp = await api.listTasks(
        'Open', undefined, 1, 100, undefined,
        undefined, true, start, end
      );
      setUnassignedTasks(unassignedResp.data || []);
    } catch (err) {
      console.error('Failed to load dashboard tasks:', err);
    } finally {
      setTasksLoading(false);
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const devList = await api.listDevices();
      setDevices(devList);
      const msgList = await api.listMessages();
      setMessages(msgList);
      await fetchTaskStatsData(startDate, endDate);
      await fetchDashboardTasks(startDate, endDate);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchQueueStats = async () => {
    setQueueLoading(true);
    try {
      const data = await api.getQueueStats();
      setQueueStats(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load queue stats:', err);
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    fetchQueueStats();
    intervalRef.current = setInterval(fetchQueueStats, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    fetchTaskStatsData(startDate, endDate);
    fetchDashboardTasks(startDate, endDate);
  }, [startDate, endDate]);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'superadmin' || user.role === 'owner_subscriber') {
      const fetchUsers = async () => {
        try {
          const uList = await api.listUsers();
          setUsers(uList || []);
          const currentUserInList = uList?.find((u: any) => u.id === user.id);
          setSelectedUser(currentUserInList || uList?.[0] || user);
        } catch (err) {
          console.error('Failed to load users list:', err);
          setUsers([user]);
          setSelectedUser(user);
        }
      };
      fetchUsers();
    } else {
      setUsers([user]);
      setSelectedUser(user);
    }
  }, [user]);

  useEffect(() => {
    if (!selectedUser) {
      setSelectedUserTasks([]);
      return;
    }
    const fetchSelectedUserTasks = async () => {
      setSelectedTasksLoading(true);
      try {
        const resp = await api.listTasks(
          undefined, undefined, 1, 100, undefined,
          selectedUser.id.toString()
        );
        setSelectedUserTasks(resp.data || []);
      } catch (err) {
        console.error('Failed to load tasks for selected user:', err);
        setSelectedUserTasks([]);
      } finally {
        setSelectedTasksLoading(false);
      }
    };
    fetchSelectedUserTasks();
  }, [selectedUser]);

  const applyDateRange = (type: string) => {
    setDateRangeType(type);
    const today = new Date();

    const formatDate = (date: Date) => {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    if (type === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (type === 'today') {
      const dateStr = formatDate(today);
      setStartDate(dateStr);
      setEndDate(dateStr);
    } else if (type === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      const dateStr = formatDate(yesterday);
      setStartDate(dateStr);
      setEndDate(dateStr);
    } else if (type === 'last7') {
      const past = new Date();
      past.setDate(today.getDate() - 6);
      setStartDate(formatDate(past));
      setEndDate(formatDate(today));
    } else if (type === 'last30') {
      const past = new Date();
      past.setDate(today.getDate() - 29);
      setStartDate(formatDate(past));
      setEndDate(formatDate(today));
    } else if (type === 'this_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(formatDate(firstDay));
      setEndDate(formatDate(today));
    }
  };

  const totalDevices = devices.length;
  const connectedDevices = devices.filter((d) => d.status === 'CONNECTED').length;
  const messagesSent = messages.filter((m) => m.direction === 'OUT').length;
  const messagesReceived = messages.filter((m) => m.direction === 'IN').length;

  const stats = [
    {
      label: 'Total Devices',
      value: totalDevices,
      icon: Smartphone,
      iconColor: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50/50 dark:bg-blue-950/20',
      borderColor: 'border-blue-100 dark:border-blue-900/30',
      glow: 'glow-blue'
    },
    {
      label: 'Connected Devices',
      value: connectedDevices,
      icon: Smartphone,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-50/50 dark:bg-emerald-950/20',
      borderColor: 'border-emerald-100 dark:border-emerald-900/30',
      glow: 'glow-green'
    },
    {
      label: 'Outgoing Messages',
      value: messagesSent,
      icon: Send,
      iconColor: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50/50 dark:bg-purple-950/20',
      borderColor: 'border-purple-100 dark:border-purple-900/30'
    },
    {
      label: 'Incoming Messages',
      value: messagesReceived,
      icon: Send,
      iconColor: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50/50 dark:bg-orange-950/20',
      borderColor: 'border-orange-100 dark:border-orange-900/30'
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">System Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Realtime metrics and status logs</p>
        </div>
        <button
          onClick={() => { fetchDashboardData(); fetchQueueStats(); }}
          disabled={loading}
          className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/40 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-md transition-all cursor-pointer text-sm font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className={`glass-card rounded-lg p-5 flex items-center justify-between relative overflow-hidden border border-slate-200 dark:border-slate-800/80 shadow-sm transition-all hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700`}>
              <div className="relative z-10">
                <p className="text-slate-500 dark:text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">{stat.label}</p>
                <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2 tracking-tight title-tracking">{stat.value}</p>

                {/* Asymmetric mock indicator line to make it look custom designed */}
                <div className="h-1 w-12 bg-slate-200 dark:bg-slate-800 rounded-full mt-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${idx === 0 ? 'bg-blue-500' :
                        idx === 1 ? 'bg-emerald-500' :
                          idx === 2 ? 'bg-purple-500' : 'bg-orange-500'
                      }`}
                    style={{ width: stat.value > 0 ? '70%' : '15%' }}
                  />
                </div>
              </div>
              <div className={`p-2.5 rounded-md ${stat.bgColor} border ${stat.borderColor} ${stat.iconColor} relative z-10 flex-shrink-0`}>
                <Icon className="w-5 h-5" />
              </div>

              {/* Elegant ambient light gradient backings */}
              <div className={`absolute -right-6 -bottom-6 w-16 h-16 rounded-full blur-[24px] pointer-events-none opacity-20 dark:opacity-10 ${idx === 0 ? 'bg-blue-500' :
                  idx === 1 ? 'bg-emerald-500' :
                    idx === 2 ? 'bg-purple-500' : 'bg-orange-500'
                }`} />
            </div>
          );
        })}
      </div>

      {/* Ticket Status Grid */}
      {taskStats && (
        <div className={`glass-card card-accent-indigo rounded-lg p-6 space-y-5 relative transition-opacity duration-300 ${statsLoading ? 'opacity-65 pointer-events-none' : ''}`}>
          {statsLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/20 dark:bg-black/10 backdrop-blur-[1px] rounded-lg z-10">
              <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
            </div>
          )}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200/60 dark:border-slate-800/60 pb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Ticket (Task) Status Overview
                </h3>
                {startDate && endDate ? (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Filtering: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{startDate}</span> to <span className="font-semibold text-indigo-600 dark:text-indigo-400">{endDate}</span>
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-500 mt-0.5">Showing all time metrics</p>
                )}
              </div>
            </div>

            {/* Date Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md bg-slate-100 dark:bg-slate-900/50 p-0.5 border border-slate-200 dark:border-slate-700/40">
                {[
                  { label: 'All', type: 'all' },
                  { label: 'Today', type: 'today' },
                  { label: 'Yesterday', type: 'yesterday' },
                  { label: '7D', type: 'last7' },
                  { label: '30D', type: 'last30' },
                  { label: 'This Month', type: 'this_month' },
                  { label: 'Custom', type: 'custom' }
                ].map((opt) => (
                  <button
                    key={opt.type}
                    onClick={() => applyDateRange(opt.type)}
                    className={`px-2.5 py-1 text-[10px] font-semibold rounded transition-all cursor-pointer ${dateRangeType === opt.type
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {dateRangeType === 'custom' && (
                <div className="flex items-center gap-1.5 animate-fade-in">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/40 text-[10px] rounded-md px-2 py-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400 font-semibold">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/40 text-[10px] rounded-md px-2 py-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-blue-50/40 dark:bg-slate-900/40 border border-blue-100 dark:border-blue-950/40 rounded-md p-3.5">
                <p className="text-[10px] font-bold text-blue-600/80 dark:text-blue-400 uppercase tracking-wider">Total Tickets</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{taskStats.total}</p>
              </div>
              <div className="bg-emerald-50/40 dark:bg-slate-900/40 border border-emerald-100 dark:border-emerald-950/40 rounded-md p-3.5">
                <p className="text-[10px] font-bold text-emerald-600/80 dark:text-emerald-400 uppercase tracking-wider">Open</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{taskStats.open}</p>
              </div>
              <div className="bg-amber-50/40 dark:bg-slate-900/40 border border-amber-100 dark:border-amber-950/40 rounded-md p-3.5">
                <p className="text-[10px] font-bold text-amber-600/80 dark:text-amber-400 uppercase tracking-wider">In Progress</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{taskStats.in_progress}</p>
              </div>
              <div className="bg-blue-50/40 dark:bg-slate-900/40 border border-blue-100 dark:border-blue-950/40 rounded-md p-3.5">
                <p className="text-[10px] font-bold text-blue-600/80 dark:text-blue-400 uppercase tracking-wider">On Hold</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{taskStats.on_hold}</p>
              </div>
              <div className="bg-blue-50/40 dark:bg-slate-900/40 border border-blue-100 dark:border-blue-950/40 rounded-md p-3.5">
                <p className="text-[10px] font-bold text-blue-600/80 dark:text-blue-400 uppercase tracking-wider">Resolved</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{taskStats.resolved}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/40 rounded-md p-3.5">
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Closed</p>
                <p className="text-2xl font-bold text-slate-700 dark:text-slate-300 mt-1">{taskStats.closed}</p>
              </div>
            </div>
          </div>

          {/* Status Overview by Category */}
          {taskStats.categories && taskStats.categories.length > 0 && (
            <div className="pt-5 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Breakdown by Category</h4>
              <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700/40 bg-slate-50/20 dark:bg-slate-900/20">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700/40 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-900/30">
                      <th className="py-2.5 px-4">Category Name</th>
                      <th className="py-2.5 px-4 text-center">Total Tasks</th>
                      <th className="py-2.5 px-4 text-center">Open</th>
                      <th className="py-2.5 px-4 text-center">In Progress</th>
                      <th className="py-2.5 px-4 text-center">On Hold</th>
                      <th className="py-2.5 px-4 text-center">Closed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700/40">
                    {taskStats.categories.map((cat, idx) => (
                      <tr key={idx} className="text-xs text-slate-700 dark:text-slate-300 table-row-hover">
                        <td className="py-2.5 px-4 font-semibold flex items-center gap-2.5">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-black/10 dark:border-white/10" style={{ backgroundColor: cat.color }} />
                          <span>{cat.category_name}</span>
                        </td>
                        <td className="py-2.5 px-4 text-center font-bold text-slate-900 dark:text-white">{cat.total}</td>
                        <td className="py-2.5 px-4 text-center">
                          <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-[10px]">
                            {cat.open}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className="inline-flex px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 font-bold text-[10px]">
                            {cat.in_progress}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className="inline-flex px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold text-[10px]">
                            {cat.on_hold}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                            {cat.closed}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tasks Overview Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Panel 1: My Tasks */}
        <div className="glass-card card-accent rounded-lg p-5 space-y-5 relative">
          {tasksLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/20 dark:bg-black/10 backdrop-blur-[1px] rounded-lg z-10">
              <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 dark:border-slate-800/60 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                <UserCheck className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">My Tasks</h3>
                <p className="text-[11px] text-slate-500">Tasks assigned to you</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-0.5 bg-slate-100 dark:bg-slate-900/50 p-0.5 rounded-md border border-slate-200 dark:border-slate-700/40">
              {([
                { key: 'all', label: 'All' },
                { key: 'Open', label: 'Open' },
                { key: 'On Progress', label: 'Progress' },
                { key: 'On Hold', label: 'Hold' },
                { key: 'Closed', label: 'Closed' }
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setMyTasksActiveStatus(tab.key)}
                  className={`px-2 py-1 text-[10px] font-semibold rounded transition-all cursor-pointer flex items-center gap-1 ${myTasksActiveStatus === tab.key
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                >
                  <span>{tab.label}</span>
                  <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[8px] font-bold ${myTasksActiveStatus === tab.key
                      ? 'bg-indigo-500 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}>
                    {
                      tab.key === 'all' ? myTasks.length :
                        tab.key === 'Open' ? myTasks.filter((t) => t.status === 'Open').length :
                          tab.key === 'On Progress' ? myTasks.filter((t) => t.status === 'On Progress').length :
                            tab.key === 'On Hold' ? myTasks.filter((t) => t.status === 'On Hold').length :
                              myTasks.filter((t) => t.status === 'Closed').length
                    }
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
            {(myTasksActiveStatus === 'all' ? myTasks : myTasks.filter((t) => t.status === myTasksActiveStatus)).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
                <p className="text-sm">No tasks found in this category</p>
              </div>
            ) : (
              (myTasksActiveStatus === 'all' ? myTasks : myTasks.filter((t) => t.status === myTasksActiveStatus)).map((task) => (
                <a
                  key={task.uuid}
                  href={`/tasks?uuid=${task.uuid}`}
                  className="flex items-center justify-between p-3 rounded-md border border-slate-200/80 dark:border-slate-700/40 bg-slate-50/50 dark:bg-slate-900/20 hover:bg-slate-100 dark:hover:bg-slate-900/40 hover:border-indigo-500/30 transition-all hover-translate-x group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-md bg-gradient-to-br ${getAvatarGradient(task.phone)} flex items-center justify-center text-white font-extrabold text-[10px] shadow-sm flex-shrink-0`}>
                      {task.contact_name ? task.contact_name.charAt(0).toUpperCase() : '+'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                          {task.contact_name || `+${task.phone.split('@')[0]}`}
                        </span>
                        {task.category && (
                          <span
                            className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-extrabold border border-black/5 dark:border-white/5"
                            style={{ backgroundColor: `${task.category.color}15`, color: task.category.color }}
                          >
                            {task.category.name}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5 max-w-[200px]">
                        {task.trigger_msg}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <div className="text-right">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold ${task.status === 'Open'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : task.status === 'On Progress'
                            ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                            : task.status === 'On Hold'
                              ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        }`}>
                        {task.status}
                      </span>
                      <span className="block text-[8px] text-slate-500 dark:text-slate-500 mt-1 font-mono">
                        {new Date(task.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  </div>
                </a>
              ))
            )}
          </div>
        </div>

        {/* Panel 2: Unassigned Open Tasks */}
        <div className="glass-card card-accent-amber rounded-lg p-5 space-y-5 relative">
          {tasksLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/20 dark:bg-black/10 backdrop-blur-[1px] rounded-lg z-10">
              <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
            </div>
          )}

          <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800/60 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-md bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400">
                <Inbox className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Unassigned Open Tasks</h3>
                <p className="text-[11px] text-slate-500">Open tasks needing PIC assignment</p>
              </div>
            </div>

            <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/25">
              {unassignedTasks.length} Pending
            </span>
          </div>

          <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
            {unassignedTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
                <p className="text-sm">All tasks have been assigned!</p>
              </div>
            ) : (
              unassignedTasks.map((task) => (
                <a
                  key={task.uuid}
                  href={`/tasks?uuid=${task.uuid}`}
                  className="flex items-center justify-between p-3 rounded-md border border-slate-200/80 dark:border-slate-700/40 bg-slate-50/50 dark:bg-slate-900/20 hover:bg-slate-100 dark:hover:bg-slate-900/40 hover:border-orange-500/30 transition-all hover-translate-x group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-md bg-gradient-to-br ${getAvatarGradient(task.phone)} flex items-center justify-center text-white font-extrabold text-[10px] shadow-sm flex-shrink-0`}>
                      {task.contact_name ? task.contact_name.charAt(0).toUpperCase() : '+'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                          {task.contact_name || `+${task.phone.split('@')[0]}`}
                        </span>
                        {task.category && (
                          <span
                            className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-extrabold border border-black/5 dark:border-white/5"
                            style={{ backgroundColor: `${task.category.color}15`, color: task.category.color }}
                          >
                            {task.category.name}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5 max-w-[200px]">
                        {task.trigger_msg}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <div className="text-right">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        {task.status}
                      </span>
                      <span className="block text-[8px] text-slate-500 dark:text-slate-500 mt-1 font-mono">
                        {new Date(task.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-orange-500 transition-colors" />
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      </div>

      {/* User Tasks by Status Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column: Users List */}
        <div className="glass-card rounded-lg p-5 space-y-5 lg:col-span-1 flex flex-col relative">
          <div className="flex items-center gap-2.5 border-b border-slate-200/60 dark:border-slate-800/60 pb-4">
            <div className="p-2 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
              <Users className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {user?.role === 'superadmin' || user?.role === 'owner_subscriber' ? 'Team Members' : 'My Worker Profile'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {user?.role === 'superadmin' || user?.role === 'owner_subscriber' ? 'Select user to view assigned tasks' : 'Your active login profile'}
              </p>
            </div>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[400px] pr-1">
            {users.map((u) => {
              const isSelected = selectedUser?.id === u.id;
              const userInitials = u.nickname
                ? u.nickname.substring(0, 2).toUpperCase()
                : u.name.substring(0, 2).toUpperCase();
              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-md border transition-all text-left cursor-pointer group ${isSelected
                      ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-900 dark:text-indigo-200'
                      : 'bg-slate-50/50 dark:bg-slate-900/20 border-slate-200/80 dark:border-slate-700/40 hover:bg-slate-100 dark:hover:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-md bg-gradient-to-br ${getAvatarGradient(u.email || u.name)} flex items-center justify-center text-white font-extrabold text-[10px] shadow-sm flex-shrink-0`}>
                      {userInitials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">
                        {u.nickname || u.name}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {u.email}
                      </p>
                    </div>
                  </div>

                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase border ${u.role === 'superadmin'
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                      : u.role === 'owner_subscriber'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                    }`}>
                    {u.role}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Tasks Grouped by Status */}
        <div className="glass-card rounded-lg p-5 lg:col-span-2 space-y-5 flex flex-col relative min-h-[450px]">
          {selectedTasksLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/20 dark:bg-black/10 backdrop-blur-[1px] rounded-lg z-10">
              <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 dark:border-slate-800/60 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                <ListTodo className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Tasks for {selectedUser?.nickname || selectedUser?.name || 'User'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Assigned tasks categorized by current status
                </p>
              </div>
            </div>

            <span className="inline-flex px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-xs font-bold">
              {selectedUserTasks.length} Total Tasks
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 flex-grow">
            {(['Open', 'On Progress', 'On Hold', 'Closed'] as const).map((status) => {
              const tasksInStatus = selectedUserTasks.filter((t) => t.status === status);
              const statusColors = {
                'Open': {
                  headerBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
                  badgeBg: 'bg-blue-500 text-white',
                  taskBorder: 'hover:border-blue-500/30'
                },
                'On Progress': {
                  headerBg: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
                  badgeBg: 'bg-yellow-500 text-slate-900',
                  taskBorder: 'hover:border-yellow-500/30'
                },
                'On Hold': {
                  headerBg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
                  badgeBg: 'bg-orange-500 text-white',
                  taskBorder: 'hover:border-orange-500/30'
                },
                'Closed': {
                  headerBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                  badgeBg: 'bg-emerald-500 text-white',
                  taskBorder: 'hover:border-emerald-500/30'
                }
              }[status];

              return (
                <div key={status} className="flex flex-col bg-slate-50/30 dark:bg-slate-900/20 border border-slate-200/50 dark:border-slate-700/30 rounded-md p-2.5 space-y-2.5 min-h-[250px] max-h-[380px]">
                  <div className={`flex items-center justify-between p-2 rounded-md border ${statusColors.headerBg} font-semibold text-[10px]`}>
                    <span>{status}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${statusColors.badgeBg}`}>
                      {tasksInStatus.length}
                    </span>
                  </div>

                  <div className="flex-grow overflow-y-auto space-y-1.5 pr-0.5">
                    {tasksInStatus.length === 0 ? (
                      <div className="flex items-center justify-center h-20 text-[10px] text-slate-400 dark:text-slate-500 italic">
                        Empty
                      </div>
                    ) : (
                      tasksInStatus.map((task) => (
                        <a
                          key={task.uuid}
                          href={`/tasks?uuid=${task.uuid}`}
                          className={`block p-2 rounded-md border border-slate-200/80 dark:border-slate-700/40 bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-all hover-translate-x group ${statusColors.taskBorder}`}
                        >
                          <div className="flex items-center justify-between gap-1.5 min-w-0">
                            <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200 truncate">
                              {task.contact_name || `+${task.phone.split('@')[0]}`}
                            </span>
                            {task.category && (
                              <span
                                className="inline-flex px-1.5 py-0.5 rounded text-[7px] font-extrabold border border-black/5 dark:border-white/5 flex-shrink-0"
                                style={{ backgroundColor: `${task.category.color}15`, color: task.category.color }}
                              >
                                {task.category.name}
                              </span>
                            )}
                          </div>
                          <p className="text-[9px] text-slate-500 dark:text-slate-400 truncate mt-1">
                            {task.trigger_msg}
                          </p>
                          <div className="flex justify-between items-center mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                            <span className="text-[7px] text-slate-400 font-mono">
                              {new Date(task.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                            <span className="text-[8px] text-indigo-500 font-semibold flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              Chat <ChevronRight className="w-2 h-2" />
                            </span>
                          </div>
                        </a>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Queue Monitor */}
      {user?.role === 'superadmin' && <div className="glass-card card-accent-indigo rounded-lg p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400">
              <Layers className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Redis Queue Monitor</h3>
              <p className="text-[11px] text-slate-500">
                {lastUpdated
                  ? `Last updated: ${lastUpdated.toLocaleTimeString()} · Auto-refresh every 10s`
                  : 'Loading stream statistics...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${queueStats?.redis_connected
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${queueStats?.redis_connected ? 'bg-emerald-500 dark:bg-emerald-400 animate-pulse' : 'bg-red-500 dark:bg-red-400'}`} />
              {queueStats?.redis_connected ? 'Redis Connected' : 'Redis Offline'}
            </div>
            <button
              onClick={fetchQueueStats}
              disabled={queueLoading}
              className="p-2 rounded-md bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/30 text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-all cursor-pointer"
              title="Refresh Queue Stats"
            >
              <RefreshCw className={`w-4 h-4 ${queueLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Stream Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-purple-50/40 dark:bg-slate-900/40 border border-purple-100 dark:border-purple-950/40 rounded-md p-3.5 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
              <Zap className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Total Enqueued</span>
            </div>
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{queueStats?.stream_length ?? '—'}</p>
            <p className="text-[10px] text-slate-500">Stream entries (XLEN)</p>
          </div>

          <div className="bg-amber-50/40 dark:bg-slate-900/40 border border-amber-100 dark:border-amber-950/40 rounded-md p-3.5 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Clock className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">In-Flight</span>
            </div>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-300">
              {queueStats?.pending_in_queue ?? '—'}
            </p>
            <p className="text-[10px] text-slate-500">PEL (XPENDING)</p>
          </div>

          <div className="bg-blue-50/40 dark:bg-slate-900/40 border border-blue-100 dark:border-blue-950/40 rounded-md p-3.5 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <Activity className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Consumers</span>
            </div>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{queueStats?.consumer_count ?? '—'}</p>
            <p className="text-[10px] text-slate-500">Active workers</p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/40 rounded-md p-3.5 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <Clock className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">DB Pending</span>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{queueStats?.db_pending ?? '—'}</p>
            <p className="text-[10px] text-slate-500">Awaiting processing</p>
          </div>

          <div className="bg-emerald-50/40 dark:bg-slate-900/40 border border-emerald-100 dark:border-emerald-950/40 rounded-md p-3.5 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Sent</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{(queueStats?.db_sent ?? 0) + (queueStats?.db_delivered ?? 0)}</p>
            <p className="text-[10px] text-slate-500">Sent + Delivered</p>
          </div>

          <div className="bg-red-50/40 dark:bg-slate-900/40 border border-red-100 dark:border-red-950/40 rounded-md p-3.5 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <XCircle className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Failed</span>
            </div>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {queueStats?.db_failed ?? '—'}
            </p>
            <p className="text-[10px] text-slate-500">Delivery failures</p>
          </div>
        </div>

        {/* Queue Progress Bar */}
        {queueStats && queueStats.db_total > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] text-slate-500 font-medium uppercase tracking-wider">
              <span>Throughput Overview</span>
              <span>{queueStats.db_total} total DB messages</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
              {(queueStats.db_sent + queueStats.db_delivered) > 0 && (
                <div
                  className="h-full bg-emerald-500 transition-all duration-700"
                  style={{ width: `${((queueStats.db_sent + queueStats.db_delivered) / queueStats.db_total) * 100}%` }}
                  title={`Sent: ${queueStats.db_sent + queueStats.db_delivered}`}
                />
              )}
              {queueStats.db_pending > 0 && (
                <div
                  className="h-full bg-amber-500 transition-all duration-700"
                  style={{ width: `${(queueStats.db_pending / queueStats.db_total) * 100}%` }}
                  title={`Pending: ${queueStats.db_pending}`}
                />
              )}
              {queueStats.db_failed > 0 && (
                <div
                  className="h-full bg-red-500 transition-all duration-700"
                  style={{ width: `${(queueStats.db_failed / queueStats.db_total) * 100}%` }}
                  title={`Failed: ${queueStats.db_failed}`}
                />
              )}
            </div>
            <div className="flex items-center gap-4 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Sent/Delivered</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Pending</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Failed</span>
            </div>
          </div>
        )}
      </div>}

      {/* System Status and Quick Guide */}
      {user?.role === 'superadmin' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Status Component */}
        <div className="glass-card rounded-lg p-5 lg:col-span-1 space-y-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Service Infrastructure</h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Current status of backend service dependencies.</p>

          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between p-2.5 rounded-md bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700/40">
              <div className="flex items-center gap-2.5">
                <Database className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">PostgreSQL</span>
              </div>
              <span className="text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">Healthy</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-md bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700/40">
              <div className="flex items-center gap-2.5">
                <Cpu className="w-4.5 h-4.5 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Redis Stream DB</span>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${queueStats?.redis_connected
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400'
                }`}>
                {queueStats?.redis_connected ? 'Active' : 'Offline'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-md bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700/40">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4.5 h-4.5 text-emerald-500" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Queue Worker</span>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${(queueStats?.consumer_count ?? 0) > 0
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                }`}>
                {(queueStats?.consumer_count ?? 0) > 0 ? 'Running' : 'Idle'}
              </span>
            </div>
          </div>
        </div>

        {/* API Info / Guide */}
        <div className="glass-card rounded-lg p-5 lg:col-span-2 space-y-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Quick Integration Guide</h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Trigger WhatsApp notifications automatically using a simple HTTP POST request.</p>

          <div className="space-y-3 pt-1">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Endpoint URL</p>
              <div className="p-2.5 rounded-md bg-slate-100 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/40 text-slate-700 dark:text-slate-300 font-mono text-sm overflow-x-auto whitespace-nowrap">
                POST http://localhost:8000/api/messages/send
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">JSON Request Body</p>
              <pre className="p-3 rounded-md bg-slate-100 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/40 text-emerald-600 dark:text-emerald-400 font-mono text-xs overflow-x-auto leading-relaxed">
                {`{
  "device_id": 1,
  "phone": "628123456789",
  "message": "Hello from POS Billing System!"
}`}
              </pre>
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}
