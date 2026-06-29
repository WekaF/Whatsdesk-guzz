import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useStore } from '../store/useStore';
import {
  ClipboardList, RefreshCw, Clock, AlertCircle, CheckCircle,
  Smartphone, Search, X,
  History, UserPlus, Filter, Tag,
  ChevronLeft, ChevronRight
} from 'lucide-react';

interface TaskCategory {
  id: number;
  uuid: string;
  name: string;
  description: string;
  color: string;
}

interface TaskLog {
  id: number;
  task_id: number;
  old_status: string;
  new_status: string;
  user_id: number;
  user?: {
    id: number;
    name: string;
    nickname: string;
    email: string;
  };
  created_at: string;
}

interface Task {
  id: number;
  uuid: string;
  number?: string;
  device_id: number;
  phone: string;
  trigger_msg: string;
  status: 'Open' | 'On Progress' | 'On Hold' | 'Closed';
  created_at: string;
  updated_at: string;
  contact_name?: string;
  category_id?: number;
  category?: TaskCategory;
  device?: {
    id: number;
    device_name: string;
    phone: string;
  };
  updated_by?: string;
  pic_name?: string;
  description?: string;
  task_logs?: TaskLog[];
}

interface Assignee {
  id: number;
  name: string;
  nickname: string;
  email: string;
}

export default function TaskList() {
  const { devices } = useStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Filters and pagination
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedDevice, setSelectedDevice] = useState<number | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTasks, setTotalTasks] = useState(0);

  // Loading and action states
  const [loading, setLoading] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [assigningTaskId, setAssigningTaskId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Age calculation helper
  const getTaskAge = (task: Task) => {
    const created = new Date(task.created_at);
    const end = task.status === 'Closed' ? new Date(task.updated_at) : new Date();
    const diffMs = end.getTime() - created.getTime();
    if (diffMs < 0) return 'Just now';
    
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ${diffHours % 24}h`;
  };

  // Generate list of page numbers with ellipsis (1, 2, 3 ... n)
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      
      let start = Math.max(2, page - 1);
      let end = Math.min(totalPages - 1, page + 1);
      
      if (page <= 3) {
        end = 4;
      } else if (page >= totalPages - 2) {
        start = totalPages - 3;
      }
      
      if (start > 2) {
        pages.push('ellipsis-start');
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (end < totalPages - 1) {
        pages.push('ellipsis-end');
      }
      
      pages.push(totalPages);
    }
    return pages;
  };

  // Fetch task categories, assignees, and tasks
  const loadInitialData = async () => {
    try {
      const [cats, users] = await Promise.all([
        api.listTaskCategories().catch(() => []),
        api.listAssignees().catch(() => [])
      ]);
      setTaskCategories(cats);
      setAssignees(users);
    } catch (err) {
      console.error('Failed to load initial TaskList data:', err);
    }
  };

  const fetchTasks = async (pageNumber = 1) => {
    setLoading(true);
    try {
      const devId = selectedDevice === 'all' ? undefined : selectedDevice;
      const catUuid = selectedCategory === 'all' ? undefined : selectedCategory;
      const statusQuery = statusFilter === 'all' ? undefined : statusFilter;
      
      const resp = await api.listTasks(statusQuery, devId, pageNumber, 10, catUuid, undefined, undefined, undefined, undefined, 'number', 'desc', searchQuery);
      setTasks(resp.data || []);
      setTotalPages(resp.total_pages || 1);
      setPage(resp.page || 1);
      setTotalTasks(resp.total || 0);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch tasks', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    fetchTasks(1);
  }, [statusFilter, selectedDevice, selectedCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTasks(1);
  };

  // Change PIC
  const handleAssignPic = async (taskUuid: string, userIdStr: string) => {
    setAssigningTaskId(tasks.find(t => t.uuid === taskUuid)?.id || null);
    try {
      const pic_user_id = userIdStr === '' ? null : userIdStr;
      await api.updateTask(taskUuid, { pic_user_id });
      showToast('PIC assigned successfully!', 'success');
      
      // Refresh task list
      await fetchTasks(page);
      
      // Update drawer if open
      if (selectedTask && selectedTask.uuid === taskUuid) {
        const details = await api.getTask(taskUuid);
        setSelectedTask(details);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to assign PIC', 'error');
    } finally {
      setAssigningTaskId(null);
    }
  };

  // Open Log Drawer
  const handleOpenLogs = async (task: Task) => {
    setDrawerLoading(true);
    setIsDrawerOpen(true);
    try {
      const details = await api.getTask(task.uuid);
      setSelectedTask(details);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch task logs', 'error');
      setIsDrawerOpen(false);
    } finally {
      setDrawerLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Open':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'On Progress':
        return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
      case 'On Hold':
        return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
      case 'Closed':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  // Use database-filtered tasks list directly
  const filteredTasks = tasks;

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-md shadow-lg border text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300 ${
          toast.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' 
            : 'bg-red-50 dark:bg-red-950/80 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center bg-white dark:bg-[#0d1428]/45 p-6 rounded-lg border border-slate-200 dark:border-[#1e293b]/40 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2.5">
            <ClipboardList className="w-7 h-7 text-whatsapp drop-shadow-[0_0_8px_rgba(37,211,102,0.3)]" />
            <span>Task List</span>
          </h1>
          <p className="text-slate-550 dark:text-slate-400 text-sm mt-1">
            Overview of support tickets, PIC assignments, and status transition logs
          </p>
        </div>
        <button
          onClick={() => fetchTasks(page)}
          className="p-2.5 rounded-md bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-350 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-850 transition-all cursor-pointer shadow-sm"
          title="Refresh List"
        >
          <RefreshCw className={`w-4.5 h-4.5 ${loading ? 'animate-spin text-whatsapp' : ''}`} />
        </button>
      </div>

      {/* Filters Area */}
      <div className="bg-white dark:bg-[#0d1428]/45 p-6 rounded-lg border border-slate-200 dark:border-[#1e293b]/40 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider">
          <Filter className="w-4 h-4" />
          <span>Filters & Search</span>
        </div>
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Live search input */}
          <div className="relative flex items-center bg-slate-50 dark:bg-slate-900/60 rounded-md border border-slate-200 dark:border-slate-800 focus-within:border-whatsapp/50 focus-within:ring-1 focus-within:ring-whatsapp/20 transition-all">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-600 absolute left-3" />
            <input
              type="text"
              placeholder="Search contact, number, trigger..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent pl-10 pr-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none"
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center bg-slate-50 dark:bg-slate-900/60 rounded-md border border-slate-200 dark:border-slate-800 px-3">
            <Clock className="w-4 h-4 text-slate-450 mr-2" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-transparent border-none py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-white dark:bg-slate-950">All Statuses</option>
              <option value="Open" className="bg-white dark:bg-slate-950">Open</option>
              <option value="On Progress" className="bg-white dark:bg-slate-950">On Progress</option>
              <option value="On Hold" className="bg-white dark:bg-slate-950">On Hold</option>
              <option value="Closed" className="bg-white dark:bg-slate-950">Closed</option>
            </select>
          </div>

          {/* Device filter */}
          <div className="flex items-center bg-slate-50 dark:bg-slate-900/60 rounded-md border border-slate-200 dark:border-slate-800 px-3">
            <Smartphone className="w-4 h-4 text-slate-450 mr-2" />
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full bg-transparent border-none py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-white dark:bg-slate-950">All Devices</option>
              {devices.map(d => (
                <option key={d.id} value={d.id} className="bg-white dark:bg-slate-950">{d.device_name}</option>
              ))}
            </select>
          </div>

          {/* Category filter */}
          <div className="flex items-center bg-slate-50 dark:bg-slate-900/60 rounded-md border border-slate-200 dark:border-slate-800 px-3 col-span-1">
            <Tag className="w-4 h-4 text-slate-450 mr-2" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-transparent border-none py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-white dark:bg-slate-950">All Categories</option>
              {taskCategories.map(cat => (
                <option key={cat.uuid} value={cat.uuid} className="bg-white dark:bg-slate-950">{cat.name}</option>
              ))}
            </select>
          </div>
        </form>
      </div>

      {/* Main Table area */}
      <div className="bg-white dark:bg-[#0d1428]/45 rounded-lg border border-slate-200 dark:border-[#1e293b]/40 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-850/80 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-4">Ticket Number</th>
                <th className="px-6 py-4">Contact / Phone</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Triggering Msg</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Age (Umur)</th>
                <th className="px-6 py-4">PIC / Agent Assignee</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850/40 text-sm text-slate-700 dark:text-slate-300">
              {loading && filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-20 text-center">
                    <RefreshCw className="w-8 h-8 text-whatsapp animate-spin mx-auto" />
                    <p className="text-xs text-slate-500 mt-2">Loading tasks...</p>
                  </td>
                </tr>
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-20 text-center space-y-3">
                    <ClipboardList className="w-12 h-12 text-slate-300 dark:text-slate-800 mx-auto" />
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-450">No tasks found</p>
                      <p className="text-xs text-slate-500">No tickets found matching your selection.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => {
                  const displayName = task.contact_name || `+${task.phone.split('@')[0]}`;
                  return (
                    <tr 
                      key={task.id} 
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors group"
                    >
                      {/* Number */}
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs font-bold text-slate-950 dark:text-white">
                        {task.number || '-'}
                      </td>

                      {/* Contact */}
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-850 dark:text-slate-200">
                          {displayName}
                        </div>
                        {task.contact_name && (
                          <div className="text-[10px] text-slate-500 font-mono">
                            +{task.phone.split('@')[0]}
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {task.category ? (
                          <span
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                            style={{ 
                              backgroundColor: task.category.color + '22', 
                              color: task.category.color, 
                              border: `1px solid ${task.category.color}33` 
                            }}
                          >
                            {task.category.name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">None</span>
                        )}
                      </td>

                      {/* Trigger Message */}
                      <td className="px-6 py-4 max-w-[200px] truncate" title={task.trigger_msg}>
                        {task.trigger_msg}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${getStatusBadge(task.status)}`}>
                          {task.status}
                        </span>
                      </td>

                      {/* Task Age */}
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-medium text-slate-500 dark:text-slate-400">
                        {getTaskAge(task)}
                      </td>

                      {/* PIC Selector */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <UserPlus className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
                          <select
                            value={task.updated_by || ''}
                            disabled={assigningTaskId === task.id || task.status === 'Closed'}
                            onChange={(e) => handleAssignPic(task.uuid, e.target.value)}
                            className="bg-transparent text-xs font-semibold focus:outline-none border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 py-1 cursor-pointer pr-4 focus:border-whatsapp text-slate-800 dark:text-slate-200 disabled:opacity-50"
                          >
                            <option value="" className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-350">Unassigned</option>
                            {assignees.map(a => (
                              <option key={a.id} value={a.id} className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-350">
                                {a.nickname || a.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                        <button
                          onClick={() => handleOpenLogs(task)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-whatsapp hover:border-whatsapp dark:hover:border-whatsapp/30 transition-all cursor-pointer bg-slate-50/50 dark:bg-transparent"
                          title="View Status Change History Logs"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>Logs</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {tasks.length > 0 && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-850/80 bg-slate-50/50 dark:bg-slate-950/20 flex flex-col sm:flex-row justify-between items-center gap-4">
            {/* Showing entries summary */}
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Showing <span className="font-semibold text-slate-800 dark:text-slate-200">{Math.min((page - 1) * 10 + 1, totalTasks)}</span> to <span className="font-semibold text-slate-800 dark:text-slate-200">{Math.min(page * 10, totalTasks)}</span> of <span className="font-semibold text-slate-800 dark:text-slate-200">{totalTasks}</span> entries
            </div>
            
            {/* Pagination buttons */}
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1 || loading}
                onClick={() => fetchTasks(page - 1)}
                className="p-2 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-750 disabled:opacity-50 cursor-pointer transition-all flex items-center justify-center min-w-[32px] h-8"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {getPageNumbers().map((p, index) => {
                if (p === 'ellipsis-start' || p === 'ellipsis-end') {
                  return (
                    <span
                      key={`ellipsis-${index}`}
                      className="px-2 py-1 text-xs text-slate-400 dark:text-slate-600 select-none min-w-[32px] text-center"
                    >
                      ...
                    </span>
                  );
                }

                const pageNum = p as number;
                const isActive = pageNum === page;

                return (
                  <button
                    key={pageNum}
                    disabled={loading}
                    onClick={() => fetchTasks(pageNum)}
                    className={`px-3 py-1 text-xs rounded-md transition-all cursor-pointer min-w-[32px] h-8 flex items-center justify-center border font-semibold ${
                      isActive
                        ? 'bg-whatsapp text-white border-whatsapp shadow-[0_0_12px_rgba(37,211,102,0.25)]'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-750 bg-white dark:bg-transparent'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                disabled={page >= totalPages || loading}
                onClick={() => fetchTasks(page + 1)}
                className="p-2 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-750 disabled:opacity-50 cursor-pointer transition-all flex items-center justify-center min-w-[32px] h-8"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Task Logs Timeline Slide-over Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[999] overflow-hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsDrawerOpen(false)} />
          
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div className="pointer-events-auto w-screen max-w-md transform bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-850 shadow-2xl transition-all duration-300">
              <div className="flex h-full flex-col overflow-y-scroll py-6 pl-4 pr-6">
                
                {/* Drawer Header */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-850 pb-4 mb-5">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-whatsapp" />
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Task Logs & Detail</h2>
                  </div>
                  <button
                    onClick={() => setIsDrawerOpen(false)}
                    className="p-1 rounded-lg text-slate-550 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {drawerLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-whatsapp animate-spin" />
                  </div>
                ) : selectedTask ? (
                  <div className="space-y-6">
                    {/* Task Info Summary */}
                    <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-850/80 space-y-3.5">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-xs font-bold text-slate-950 dark:text-white">
                          {selectedTask.number || '-'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${getStatusBadge(selectedTask.status)}`}>
                          {selectedTask.status}
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Contact Name / JID</div>
                        <div className="text-sm font-semibold">{selectedTask.contact_name || 'Unsaved Contact'}</div>
                        <div className="text-xs font-mono text-slate-500 mt-0.5">+{selectedTask.phone.split('@')[0]}</div>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Triggering Keyword Message</div>
                        <div className="text-xs italic bg-white dark:bg-slate-950 p-2.5 rounded-md border border-slate-150 dark:border-slate-850 text-slate-600 dark:text-slate-350 leading-relaxed font-medium">
                          "{selectedTask.trigger_msg}"
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Description / Catatan PIC</div>
                        <div className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                          {selectedTask.description || <span className="text-slate-400 italic">No notes provided.</span>}
                        </div>
                      </div>
                      
                      {/* Change PIC directly from drawer */}
                      <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Assignee PIC</div>
                        <div className="flex items-center gap-2">
                          <select
                            value={selectedTask.updated_by || ''}
                            disabled={selectedTask.status === 'Closed'}
                            onChange={(e) => handleAssignPic(selectedTask.uuid, e.target.value)}
                            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 px-3 py-1.5 rounded-md text-xs font-semibold focus:outline-none focus:border-whatsapp text-slate-800 dark:text-slate-200 cursor-pointer"
                          >
                            <option value="">Unassigned</option>
                            {assignees.map(a => (
                              <option key={a.id} value={a.id}>
                                {a.nickname || a.name} ({a.email})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Timeline logs */}
                    <div>
                      <h3 className="text-xs font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                        <History className="w-4 h-4" />
                        <span>Status Log Timeline</span>
                      </h3>
                      {selectedTask.task_logs && selectedTask.task_logs.length > 0 ? (
                        <div className="relative pl-6 border-l border-slate-200 dark:border-slate-800 space-y-6">
                          {selectedTask.task_logs.map((log) => {
                            const name = log.user?.nickname || log.user?.name || log.user?.email || `User #${log.user_id}`;
                            return (
                              <div key={log.id} className="relative">
                                {/* Dot indicator */}
                                <span className="absolute -left-[30px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white dark:bg-slate-950 border border-whatsapp">
                                  <span className="h-2 w-2 rounded-full bg-whatsapp" />
                                </span>
                                
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <span className="font-semibold text-slate-850 dark:text-slate-200">{name}</span>
                                    <span className="text-slate-400">
                                      {log.new_status.startsWith('PIC:') ? 'assigned PIC' : 'changed status'}
                                    </span>
                                  </div>
                                  
                                  {/* Status Transition Badges */}
                                  <div className="flex items-center gap-1.5 py-0.5">
                                    <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 text-[9px] font-bold rounded">
                                      {log.old_status && log.old_status.startsWith('PIC:') ? log.old_status.substring(4).trim() : (log.old_status || 'Open')}
                                    </span>
                                    <span className="text-slate-400 text-xs">→</span>
                                    <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${getStatusBadge(log.new_status)}`}>
                                      {log.new_status.startsWith('PIC:') ? log.new_status.substring(4).trim() : log.new_status}
                                    </span>
                                  </div>

                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {new Date(log.created_at).toLocaleString()}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-900 rounded-md space-y-1">
                          <History className="w-8 h-8 text-slate-300 dark:text-slate-850 mx-auto" />
                          <p className="text-xs text-slate-500 font-medium">No status logs recorded</p>
                          <p className="text-[10px] text-slate-400 max-w-[200px] mx-auto">Logs are recorded automatically when task status changes.</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-20 text-slate-500">
                    Failed to load task details.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
