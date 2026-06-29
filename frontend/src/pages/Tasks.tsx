import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { api } from '../services/api';
import {
  ClipboardList, MessageSquare, Send, RefreshCw,
  Clock, AlertCircle, CheckCircle, Smartphone, User, HelpCircle,
  Search, CheckCheck, ChevronRight, UserCheck, Paperclip, FileText, Download, Eye, X
} from 'lucide-react';

interface TaskMessage {
  id: number;
  task_id: number;
  direction: 'IN' | 'OUT';
  message: string;
  message_type?: string;
  media_url?: string;
  file_name?: string;
  created_at: string;
}

interface TaskCategory {
  id: number;
  uuid: string;
  name: string;
  description: string;
  color: string;
}

interface Task {
  id: number;
  uuid: string;
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
  task_messages?: TaskMessage[];
  updated_by?: string;
  pic_name?: string;
  number?: string;
  description?: string;
}

// Helper to generate consistent, premium gradients for avatars based on phone numbers
const getAvatarGradient = (phone: string) => {
  const clean = phone.replace(/[^0-9]/g, '');
  const val = clean ? parseInt(clean.slice(-3) || '0', 10) : 0;
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

export default function Tasks() {
  const { devices } = useStore();
  const [searchParams] = useSearchParams();
  const taskUuidParam = searchParams.get('uuid');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([]);

  // Filters and pagination
  const [statusTab, setStatusTab] = useState<'active' | 'Closed' | 'all'>('active');
  const [selectedDevice, setSelectedDevice] = useState<number | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Loading states
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
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

  // Form states
  const [replyText, setReplyText] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Attachment upload states
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [uploadedAttachment, setUploadedAttachment] = useState<{ url: string; file_name: string; message_type: 'image' | 'document' } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Task description states
  const [descEditing, setDescEditing] = useState(false);
  const [descInput, setDescInput] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAttachment(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.uploadFile(formData);
      setUploadedAttachment(res);
    } catch (err: any) {
      showToast(err.message || 'Failed to upload attachment', 'error');
    } finally {
      setUploadingAttachment(false);
      e.target.value = '';
    }
  };

  // Fetch Tasks List
  const fetchTasksList = async (pageNumber = 1) => {
    setListLoading(true);
    setError(null);
    try {
      const devId = selectedDevice === 'all' ? undefined : selectedDevice;
      const catUuid = selectedCategory === 'all' ? undefined : selectedCategory;
      const resp = await api.listTasks(statusTab, devId, pageNumber, 20, catUuid);
      setTasks(resp.data || []);
      setTotalPages(resp.total_pages || 1);
      setPage(resp.page || 1);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch tasks');
    } finally {
      setListLoading(false);
    }
  };

  // Load categories once
  useEffect(() => {
    api.listTaskCategories().then(setTaskCategories).catch(console.error);
  }, []);

  // Fetch Single Task Details
  const fetchTaskDetails = async (taskUuid: string, silent: boolean = false) => {
    if (!silent) setDetailLoading(true);
    try {
      const details = await api.getTask(taskUuid);
      setSelectedTask(details);
      // Auto scroll to bottom of chat
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      console.error('Failed to fetch task details:', err);
    } finally {
      if (!silent) setDetailLoading(false);
    }
  };

  // Effect to load list
  useEffect(() => {
    fetchTasksList(1);
  }, [statusTab, selectedDevice, selectedCategory]);

  // Effect to select task from query parameter
  useEffect(() => {
    if (taskUuidParam) {
      api.getTask(taskUuidParam)
        .then((details) => {
          if (details.status === 'Closed') {
            setStatusTab('Closed');
          } else {
            setStatusTab('active');
          }
          fetchTaskDetails(taskUuidParam);
        })
        .catch((err) => {
          console.error('Failed to load task from query param:', err);
        });
    }
  }, [taskUuidParam]);

  // Effect to poll active task detail every 5 seconds to get real-time incoming messages
  useEffect(() => {
    if (!selectedTask || selectedTask.status === 'Closed') return;

    const interval = setInterval(() => {
      api.getTask(selectedTask.uuid)
        .then((details) => {
          setSelectedTask(details);
        })
        .catch((err) => console.error('Error polling task details:', err));
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedTask?.id]);

  // Sync description input when selectedTask changes
  useEffect(() => {
    if (selectedTask) {
      setDescInput(selectedTask.description || '');
      setDescEditing(false);
    } else {
      setDescInput('');
      setDescEditing(false);
    }
  }, [selectedTask?.id]);

  // Change Task Status or Category
  const handleUpdateTask = async (taskUuid: string, data: { status?: string; category_uuid?: string }) => {
    try {
      await api.updateTask(taskUuid, data);

      if (data.status === 'Closed') {
        // Close the chat panel and reload the active task list
        setSelectedTask(null);
        await fetchTasksList(1);
      } else {
        // Re-fetch list to reflect updated_at order, then update detail
        await fetchTasksList(page);
        if (selectedTask && selectedTask.uuid === taskUuid) {
          const updated = await api.getTask(taskUuid);
          setSelectedTask(updated);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update task', 'error');
    }
  };

  // Save Description update
  const handleSaveDescription = async () => {
    if (!selectedTask) return;
    setSavingDesc(true);
    try {
      await api.updateTask(selectedTask.uuid, { description: descInput });
      await fetchTasksList(page);
      const updated = await api.getTask(selectedTask.uuid);
      setSelectedTask(updated);
      setDescEditing(false);
      showToast('Task description updated successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update description', 'error');
    } finally {
      setSavingDesc(false);
    }
  };

  // Send Reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || (!replyText.trim() && !uploadedAttachment) || sendingReply || uploadingAttachment) return;

    setSendingReply(true);
    try {
      // Send manual message
      await api.sendMessage({
        device_id: selectedTask.device_id,
        phone: selectedTask.phone,
        message: replyText || uploadedAttachment?.file_name || 'Attachment',
        task_id: selectedTask.id,
        message_type: uploadedAttachment?.message_type || 'text',
        media_url: uploadedAttachment?.url || undefined,
        file_name: uploadedAttachment?.file_name || undefined,
      });

      // Clear input
      setReplyText('');
      setUploadedAttachment(null);

      // Refresh task details silently to load the updated message logs without showing a loading spinner
      await fetchTaskDetails(selectedTask.uuid, true);
    } catch (err: any) {
      showToast(err.message || 'Failed to send message', 'error');
    } finally {
      setSendingReply(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Open':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_8px_rgba(59,130,246,0.1)]';
      case 'On Progress':
        return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 shadow-[0_0_8px_rgba(234,179,8,0.1)]';
      case 'On Hold':
        return 'bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-[0_0_8px_rgba(249,115,22,0.1)]';
      case 'Closed':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]';
      default:
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Open':
        return <AlertCircle className="w-4 h-4 text-blue-400" />;
      case 'On Progress':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'On Hold':
        return <AlertCircle className="w-4 h-4 text-orange-400" />;
      case 'Closed':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      default:
        return <HelpCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'Open':
        return (
          <span className="relative flex h-2 w-2 mr-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
        );
      case 'On Progress':
        return (
          <span className="relative flex h-2 w-2 mr-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
          </span>
        );
      case 'On Hold':
        return <span className="h-2 w-2 mr-1.5 rounded-full bg-orange-500"></span>;
      case 'Closed':
        return <span className="h-2 w-2 mr-1.5 rounded-full bg-emerald-500"></span>;
      default:
        return <span className="h-2 w-2 mr-1.5 rounded-full bg-slate-500"></span>;
    }
  };

  // Local Search Filter
  const filteredTasks = tasks.filter(task => {
    const q = searchQuery.toLowerCase();
    const phone = task.phone.toLowerCase();
    const name = (task.contact_name || '').toLowerCase();
    const msg = task.trigger_msg.toLowerCase();
    const num = (task.number || '').toLowerCase();
    return phone.includes(q) || name.includes(q) || msg.includes(q) || num.includes(q);
  });

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const renderMessageContent = (msg: TaskMessage) => {
    if (msg.message_type === 'image') {
      const imgUrl = msg.media_url?.startsWith('http') ? msg.media_url : `${API_URL}${msg.media_url}`;
      return (
        <div className="space-y-2 max-w-sm">
          <div
            className="relative rounded-md overflow-hidden border border-slate-200 dark:border-slate-800 cursor-zoom-in group shadow-sm bg-black/5"
            onClick={() => setPreviewImage(imgUrl)}
          >
            <img
              src={imgUrl}
              alt={msg.file_name || "Attachment"}
              className="max-h-60 object-cover w-full transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
              <Eye className="w-5 h-5" />
            </div>
          </div>
          {msg.message && msg.message !== msg.file_name && (
            <p className="text-sm whitespace-pre-wrap leading-relaxed px-1 mt-1 text-slate-805 dark:text-slate-200">{msg.message}</p>
          )}
        </div>
      );
    }

    if (msg.message_type === 'document') {
      const docUrl = msg.media_url?.startsWith('http') ? msg.media_url : `${API_URL}${msg.media_url}`;
      return (
        <div className="space-y-2 min-w-[200px] max-w-sm">
          <div className="p-3 rounded-md border flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-lg bg-red-500/10 text-red-500 flex-shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate text-slate-850 dark:text-slate-205">{msg.file_name || 'Document.pdf'}</p>
                <p className="text-[10px] text-slate-500">PDF Document</p>
              </div>
            </div>
            <a
              href={docUrl}
              download={msg.file_name || 'Document.pdf'}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-605 dark:text-slate-350 border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer flex-shrink-0"
              title="Download File"
            >
              <Download className="w-4 h-4" />
            </a>
          </div>
          {msg.message && msg.message !== msg.file_name && (
            <p className="text-sm whitespace-pre-wrap leading-relaxed px-1 mt-1 text-slate-805 dark:text-slate-205">{msg.message}</p>
          )}
        </div>
      );
    }

    return <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.message}</p>;
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-md bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 text-sm flex items-center gap-2 animate-pulse">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center bg-white dark:bg-[#0d1428]/45 p-4 rounded-lg border border-slate-200 dark:border-[#1e293b]/40 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2.5">
            <ClipboardList className="w-7 h-7 text-whatsapp drop-shadow-[0_0_8px_rgba(37,211,102,0.3)]" />
            <span>Support Tickets & Tasks</span>
          </h1>
          <p className="text-slate-550 dark:text-slate-400 text-sm mt-1">Resolve helpdesk sessions triggered from auto-reply keywords</p>
        </div>
        <button
          onClick={() => fetchTasksList(page)}
          className="p-2.5 rounded-md bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-350 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-850 transition-all cursor-pointer shadow-sm flex items-center justify-center"
          title="Refresh List"
        >
          <RefreshCw className={`w-4.5 h-4.5 ${listLoading ? 'animate-spin text-whatsapp' : ''}`} />
        </button>
      </div>

      {/* Main Split Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-210px)] min-h-[500px]">

        {/* Left column: Tasks list (4 cols) */}
        <div className="lg:col-span-3 glass-card rounded-lg flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800/80">
          {/* Filters & Search Box */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-850/80 space-y-3 bg-slate-50/50 dark:bg-slate-950/20">
            {/* Status Tabs */}
            <div className="flex bg-slate-100 dark:bg-slate-900/50 p-1 rounded-md border border-slate-200 dark:border-slate-800/80">
              <button
                onClick={() => setStatusTab('active')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${statusTab === 'active'
                  ? 'bg-white dark:bg-whatsapp/15 text-emerald-600 dark:text-whatsapp border border-slate-200 dark:border-whatsapp/20 font-bold shadow'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                Active
              </button>
              <button
                onClick={() => setStatusTab('Closed')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${statusTab === 'Closed'
                  ? 'bg-white dark:bg-whatsapp/15 text-emerald-600 dark:text-whatsapp border border-slate-200 dark:border-whatsapp/20 font-bold shadow'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                Closed
              </button>
              <button
                onClick={() => setStatusTab('all')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${statusTab === 'all'
                  ? 'bg-white dark:bg-whatsapp/15 text-emerald-600 dark:text-whatsapp border border-slate-200 dark:border-whatsapp/20 font-bold shadow'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                All
              </button>
            </div>

            {/* Live Search and Device filter */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="relative flex items-center bg-white dark:bg-slate-900/60 rounded-md border border-slate-200 dark:border-slate-800/80 focus-within:border-whatsapp/40 transition-all">
                <Search className="w-3.5 h-3.5 text-slate-450 dark:text-slate-500 absolute left-3" />
                <input
                  type="text"
                  placeholder="Search contact or keyword..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent pl-9 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center bg-white dark:bg-slate-900/60 rounded-md border border-slate-200 dark:border-slate-800/80 px-2">
                <Smartphone className="w-3.5 h-3.5 text-slate-450 dark:text-slate-500 mr-2" />
                <select
                  value={selectedDevice}
                  onChange={(e) => setSelectedDevice(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="w-full bg-transparent border-none py-1.5 text-xs text-slate-850 dark:text-slate-300 focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-300">All Devices</option>
                  {devices.map(d => (
                    <option key={d.id} value={d.id} className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-300">{d.device_name}</option>
                  ))}
                </select>
              </div>

              {/* Category filter */}
              {taskCategories.length > 0 && (
                <div className="flex items-center bg-white dark:bg-slate-900/60 rounded-md border border-slate-200 dark:border-slate-800/80 px-2 sm:col-span-2">
                  <span className="text-slate-450 dark:text-slate-500 text-[10px] font-bold uppercase mr-2 whitespace-nowrap">Cat:</span>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full bg-transparent border-none py-1.5 text-xs text-slate-850 dark:text-slate-300 focus:outline-none cursor-pointer"
                  >
                    <option value="all" className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-300">All Categories</option>
                    {taskCategories.map(cat => (
                      <option key={cat.uuid} value={cat.uuid} className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-300">{cat.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* List area */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-150 dark:divide-slate-850/40">
            {listLoading && filteredTasks.length === 0 ? (
              <div className="flex justify-center items-center py-20">
                <RefreshCw className="w-8 h-8 text-whatsapp animate-spin" />
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="py-20 text-center text-slate-500 text-sm flex flex-col items-center justify-center space-y-3">
                <ClipboardList className="w-12 h-12 text-slate-700 animate-pulse" />
                <div className="space-y-1">
                  <p className="font-semibold text-slate-450">No tasks found</p>
                  <p className="text-xs text-slate-550">Try broadening your search query or switching filters.</p>
                </div>
              </div>
            ) : (
              filteredTasks.map((task) => {
                const isSelected = selectedTask?.id === task.id;
                const displayName = task.contact_name || `+${task.phone.split('@')[0]}`;
                const initial = displayName.replace(/[+]/g, '').charAt(0).toUpperCase() || '?';
                const avatarGrad = getAvatarGradient(task.phone);

                return (
                  <div
                    key={task.id}
                    onClick={() => fetchTaskDetails(task.uuid)}
                    className={`p-4 flex gap-3.5 transition-all duration-300 cursor-pointer select-none border-l-4 border-b border-slate-150 dark:border-slate-850/40 relative group ${isSelected
                      ? 'bg-slate-50 dark:bg-slate-900/40 border-l-whatsapp border-y border-y-slate-200 dark:border-y-[#1e293b]/20 shadow-[inset_0_0_12px_rgba(37,211,102,0.03)]'
                      : 'border-l-transparent hover:bg-slate-100/40 dark:hover:bg-slate-900/20'
                      }`}
                  >
                    {/* Contact Avatar Gradient */}
                    <div className={`w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center font-extrabold text-sm text-white shadow-md bg-gradient-to-br ${avatarGrad} border-2 ${isSelected ? 'border-whatsapp scale-105 shadow-whatsapp/15' : 'border-slate-200 dark:border-slate-800'
                      } transition-all duration-300`}>
                      {initial}
                    </div>

                    {/* Task Info */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {task.number && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 font-mono text-[9px] font-bold border border-slate-200 dark:border-slate-800 flex-shrink-0">
                                {task.number}
                              </span>
                            )}
                            <span className={`font-semibold text-sm truncate transition-colors duration-200 ${isSelected ? 'text-emerald-600 dark:text-whatsapp font-bold' : 'text-slate-800 dark:text-slate-200'
                              }`}>
                              {displayName}
                            </span>
                          </div>
                          {task.contact_name && (
                            <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                              +{task.phone.split('@')[0]}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider flex items-center ${getStatusBadge(task.status)}`}>
                            {getStatusDot(task.status)}
                            {task.status}
                          </span>
                          {task.category && (
                            <span
                              className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider text-white"
                              style={{ backgroundColor: task.category.color + '33', color: task.category.color, border: `1px solid ${task.category.color}44` }}
                            >
                              {task.category.name}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quote Trigger */}
                      <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-900/80 px-3 py-1.5 rounded-md flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 transition-colors group-hover:border-slate-350 dark:group-hover:border-slate-800/80">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-450 dark:text-slate-550 flex-shrink-0" />
                        <span className="truncate flex-1 italic">
                          {task.trigger_msg}
                        </span>
                      </div>

                      {/* Meta information */}
                      <div className="flex justify-between items-center text-[10px] text-slate-500 pt-0.5">
                        <span className="flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-slate-500 dark:text-slate-650" />
                          <span className="truncate max-w-[120px] text-slate-600 dark:text-slate-400 font-medium">{task.device?.device_name || 'Device'}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-slate-550 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/35 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800/40">
                            Age: {getTaskAge(task)}
                          </span>
                          {task.pic_name && (
                            <span className="text-[9px] text-emerald-600 dark:text-whatsapp bg-emerald-500/10 dark:bg-whatsapp/10 px-1.5 py-0.5 rounded border border-emerald-500/20 dark:border-whatsapp/20">
                              PIC: <span className="font-semibold">{task.pic_name}</span>
                            </span>
                          )}
                          <span className="font-mono text-slate-500 bg-slate-100 dark:bg-slate-900/35 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-800/40">
                            {new Date(task.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Hover chevron element */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-hover:right-3 transition-all duration-300 text-slate-400 dark:text-slate-600">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="p-3 border-t border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950/30 flex justify-between items-center">
              <button
                disabled={page <= 1 || listLoading}
                onClick={() => fetchTasksList(page - 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-700 disabled:opacity-50 cursor-pointer transition-colors"
              >
                Previous
              </button>
              <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
              <button
                disabled={page >= totalPages || listLoading}
                onClick={() => fetchTasksList(page + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-700 disabled:opacity-50 cursor-pointer transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Right column: Conversation log detail (8 cols) */}
        <div className="lg:col-span-8 glass-card rounded-lg flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800/80 bg-slate-50/10 dark:bg-slate-950/5">
          {detailLoading ? (
            <div className="flex-1 flex justify-center items-center">
              <RefreshCw className="w-8 h-8 text-whatsapp animate-spin" />
            </div>
          ) : selectedTask ? (
            <>
              {/* Detail Header */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-100/50 dark:bg-slate-900/30 backdrop-blur-md flex justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarGradient(selectedTask.phone)} flex items-center justify-center text-white font-extrabold text-sm shadow-md`}>
                    {selectedTask.contact_name ? selectedTask.contact_name.charAt(0).toUpperCase() : '+'}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                      {selectedTask.number && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-900/70 text-slate-700 dark:text-slate-450 font-mono text-[10px] font-bold border border-slate-300/60 dark:border-slate-800">
                          {selectedTask.number}
                        </span>
                      )}
                      <span>{selectedTask.contact_name || `+${selectedTask.phone.split('@')[0]}`}</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 flex items-center gap-2 font-mono mt-0.5">
                      {selectedTask.contact_name && (
                        <span className="text-slate-650 dark:text-slate-400">
                          +{selectedTask.phone.split('@')[0]}
                        </span>
                      )}
                      {selectedTask.contact_name && <span className="text-slate-300 dark:text-slate-850">•</span>}
                      <span className="flex items-center gap-1 text-slate-500">
                        <Smartphone className="w-3.5 h-3.5 text-slate-450 dark:text-slate-600" />
                        <span>{selectedTask.device?.device_name}</span>
                      </span>
                      <span className="text-slate-300 dark:text-slate-850">•</span>
                      <span className="flex items-center gap-1 text-slate-500" title="Task Age (Umur)">
                        <Clock className="w-3.5 h-3.5 text-slate-450 dark:text-slate-600" />
                        <span>Age: {getTaskAge(selectedTask)}</span>
                      </span>
                      {selectedTask.pic_name && (
                        <>
                          <span className="text-slate-300 dark:text-slate-850">•</span>
                          <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-whatsapp px-1.5 py-0.5 rounded border border-emerald-500/20 dark:border-whatsapp/20 text-[9px] uppercase font-bold tracking-wider">
                            <UserCheck className="w-3 h-3 text-emerald-600 dark:text-whatsapp" />
                            <span>PIC: {selectedTask.pic_name}</span>
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Status Selector + Category Assign */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-md focus-within:border-whatsapp/30 transition-all shadow-inner">
                    {getStatusIcon(selectedTask.status)}
                    <select
                      value={selectedTask.status}
                      onChange={(e) => handleUpdateTask(selectedTask.uuid, { status: e.target.value })}
                      className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-350 focus:outline-none cursor-pointer pr-1"
                    >
                      <option value="Open" className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-350">Open</option>
                      <option value="On Progress" className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-350">On Progress</option>
                      <option value="On Hold" className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-350">On Hold</option>
                      <option value="Closed" className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-350">Closed</option>
                    </select>
                  </div>

                  {/* Category assign dropdown */}
                  {taskCategories.length > 0 && (
                    <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-md focus-within:border-indigo-500/30 transition-all shadow-inner">
                      <span className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase">Cat</span>
                      <select
                        value={selectedTask.category?.uuid || ''}
                        onChange={(e) => handleUpdateTask(selectedTask.uuid, { category_uuid: e.target.value || undefined })}
                        className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer pr-1"
                        style={{ color: selectedTask.category?.color || '#94a3b8' }}
                      >
                        <option value="" className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-300">— None —</option>
                        {taskCategories.map(cat => (
                          <option key={cat.uuid} value={cat.uuid} className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-300">{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Messages Chat Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-100/50 dark:bg-[#090e1a]/60 border-y border-slate-200 dark:border-slate-800/50 flex flex-col scrollbar-thin">

                {/* Triggering Message Banner */}
                <div className="self-center bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/15 rounded-lg p-4 max-w-lg text-center space-y-2 shadow-sm backdrop-blur-sm">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-[10px] font-bold tracking-wider uppercase">
                    <AlertCircle className="w-3 h-3" />
                    <span>Ticket Trigger Msg</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-200 italic font-medium">"{selectedTask.trigger_msg}"</p>
                  <span className="text-[9px] text-slate-500 dark:text-slate-550 block font-mono">{new Date(selectedTask.created_at).toLocaleString()}</span>
                </div>

                {/* Ticket Description / Notes by PIC */}
                <div className="self-center w-full max-w-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-lg p-4 space-y-2.5 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Task Description / Notes
                    </span>
                    {descEditing ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveDescription}
                          disabled={savingDesc}
                          className="text-[10px] font-bold text-emerald-600 hover:text-emerald-500 transition-colors cursor-pointer"
                        >
                          {savingDesc ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDescInput(selectedTask.description || '');
                            setDescEditing(false);
                          }}
                          className="text-[10px] font-bold text-slate-500 hover:text-slate-400 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      selectedTask.status !== 'Closed' && (
                        <button
                          type="button"
                          onClick={() => setDescEditing(true)}
                          className="text-[10px] font-bold text-whatsapp hover:underline transition-all cursor-pointer"
                        >
                          Edit
                        </button>
                      )
                    )}
                  </div>
                  {descEditing ? (
                    <textarea
                      value={descInput}
                      onChange={(e) => setDescInput(e.target.value)}
                      placeholder="Add task description or notes here..."
                      className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp resize-none min-h-[60px]"
                    />
                  ) : (
                    <p className={`text-xs whitespace-pre-wrap leading-relaxed ${selectedTask.description ? 'text-slate-700 dark:text-slate-300' : 'text-slate-450 dark:text-slate-600 italic'}`}>
                      {selectedTask.description || 'No description provided yet.'}
                    </p>
                  )}
                </div>

                {/* Chat message bubbles */}
                {selectedTask.task_messages && selectedTask.task_messages.map((tm) => {
                  const isMe = tm.direction === 'OUT';
                  return (
                    <div
                      key={tm.id}
                      className={`w-full flex ${isMe ? 'justify-end' : 'justify-start'}`}
                    >
                      {isMe ? (
                        // Operator (Right Side)
                        <div className="flex flex-col space-y-1 items-end max-w-[80%] select-none">
                          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5 px-1">
                            <span>Operator</span>
                            <UserCheck className="w-3.5 h-3.5 text-whatsapp" />
                          </span>

                          <div
                            className="px-4 py-2.5 bg-emerald-100/70 dark:bg-emerald-950/50 text-slate-900 dark:text-slate-200 border border-emerald-200 dark:border-emerald-500/25 rounded-lg rounded-tr-none text-sm leading-relaxed shadow-sm"
                          >
                            {renderMessageContent(tm)}
                          </div>

                          <div className="flex items-center gap-1.5 px-1 mt-0.5">
                            <span className="text-[10px] text-slate-500 font-mono">
                              {new Date(tm.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <CheckCheck className="w-4 h-4 text-whatsapp drop-shadow-[0_0_2px_rgba(37,211,102,0.4)]" />
                          </div>
                        </div>
                      ) : (
                        // Client / WhatsApp Sender (Left Side with Avatar)
                        <div className="flex items-start gap-3.5 max-w-[80%]">
                          {/* Avatar */}
                          <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex-shrink-0 flex items-center justify-center text-slate-500 dark:text-slate-400 shadow-sm mt-1 border border-slate-200 dark:border-slate-700/40">
                            <User className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                          </div>

                          {/* Content column */}
                          <div className="flex flex-col space-y-1 items-start">
                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider px-1">
                              {selectedTask.contact_name || `+${selectedTask.phone.split('@')[0]}`}
                            </span>

                            <div
                              className="px-4 py-2.5 bg-white dark:bg-slate-900/75 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-850/85 rounded-lg rounded-tl-none text-sm leading-relaxed shadow-sm"
                            >
                              {renderMessageContent(tm)}
                            </div>

                            <span className="text-[10px] text-slate-500 font-mono mt-0.5 px-1">
                              {new Date(tm.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat Input Footer */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-850/80 bg-white dark:bg-slate-950/35">
                {selectedTask.status === 'Closed' ? (
                  <div className="p-4 bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/10 rounded-lg text-center text-xs text-red-600 dark:text-red-400 font-semibold flex items-center justify-center gap-2 shadow-inner">
                    <AlertCircle className="w-4 h-4" />
                    <span>This ticket is Closed. Change status to re-open and reply.</span>
                  </div>
                ) : (
                  <form onSubmit={handleSendReply} className="flex flex-col gap-2.5 w-full">
                    {/* Upload Attachment Preview */}
                    {uploadedAttachment && (
                      <div className="p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between gap-3 text-xs animate-in slide-in-from-bottom-2 duration-205 shadow-inner">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {uploadedAttachment.message_type === 'image' ? (
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 flex-shrink-0">
                              <img src={uploadedAttachment.url.startsWith('http') ? `${uploadedAttachment.url}` : `${uploadedAttachment.url}`} alt="Preview" className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="p-2 rounded-lg bg-red-500/10 text-red-500 flex-shrink-0">
                              <FileText className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{uploadedAttachment.file_name}</p>
                            <p className="text-[10px] text-slate-500 uppercase font-extrabold">{uploadedAttachment.message_type}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setUploadedAttachment(null)}
                          className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-850 dark:hover:text-white transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <div className="flex gap-2.5 items-center">
                      {/* Attachment Picker */}
                      <input
                        type="file"
                        id="chat-file-input"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={handleFileChange}
                        disabled={uploadingAttachment || sendingReply}
                      />
                      <label
                        htmlFor="chat-file-input"
                        className={`p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-550 dark:text-slate-400 hover:text-slate-805 dark:hover:text-white transition-all cursor-pointer shadow-sm flex items-center justify-center flex-shrink-0 ${uploadingAttachment ? 'animate-pulse' : ''}`}
                        title="Attach Image or PDF"
                      >
                        {uploadingAttachment ? (
                          <RefreshCw className="w-4.5 h-4.5 animate-spin text-whatsapp" />
                        ) : (
                          <Paperclip className="w-4.5 h-4.5" />
                        )}
                      </label>

                      <div className="flex-1 relative flex items-center bg-slate-50 dark:bg-slate-900/65 rounded-md border border-slate-200 dark:border-slate-800 focus-within:border-whatsapp/40 focus-within:ring-1 focus-within:ring-whatsapp/30 transition-all shadow-inner">
                        <input
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder={uploadedAttachment ? "Add a caption..." : "Type a message to reply on WhatsApp..."}
                          disabled={sendingReply}
                          className="w-full px-4 py-3 bg-transparent text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none text-sm"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={(!replyText.trim() && !uploadedAttachment) || sendingReply || uploadingAttachment}
                        className="bg-whatsapp hover:bg-emerald-500 text-black px-5 py-3 rounded-md transition-all cursor-pointer glow-green disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 font-bold text-sm shadow-md"
                      >
                        {sendingReply ? (
                          <RefreshCw className="w-4.5 h-4.5 animate-spin" />
                        ) : (
                          <>
                            <span>Send</span>
                            <Send className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 space-y-4 bg-slate-50/50 dark:bg-slate-950/10">
              <div className="p-4.5 rounded-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80 text-slate-450 dark:text-slate-705 shadow-sm">
                <ClipboardList className="w-14 h-14 text-slate-400 dark:text-slate-500 animate-pulse-slow" />
              </div>
              <div className="text-center max-w-xs space-y-1">
                <h3 className="font-semibold text-slate-800 dark:text-white text-base">No Ticket Selected</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Select a support ticket from the left panel to review message logs and send manual WhatsApp replies.</p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Image Full-screen Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-lg border border-slate-800/80 bg-slate-950 shadow-2xl animate-zoom-in" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="Preview" className="max-w-full max-h-[85vh] object-contain" />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 p-2 rounded-md bg-black/60 text-white hover:bg-black/80 hover:text-whatsapp transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`flex items-center gap-3 px-4 py-3.5 rounded-md border shadow-xl backdrop-blur-md bg-white/90 dark:bg-[#0d1425]/90 ${toast.type === 'error'
            ? 'border-red-500/30 text-red-600 dark:text-red-400 shadow-red-500/5'
            : 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-emerald-500/5'
            }`}>
            <div className={`p-1.5 rounded-lg ${toast.type === 'error' ? 'bg-red-500/10' : 'bg-emerald-500/10'
              }`}>
              <AlertCircle className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold tracking-wide">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-3 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
