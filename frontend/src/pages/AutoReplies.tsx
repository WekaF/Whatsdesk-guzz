import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../services/api';
import { Plus, Trash2, Edit2, Bot, X, RefreshCw, ShieldAlert, MessageSquare, ClipboardList, Link2, Lock } from 'lucide-react';

interface AutoReplyRule {
  id: number;
  uuid: string;
  device_id: number;
  keyword: string;
  match_type: 'EXACT' | 'CONTAINS' | 'START_WITH';
  reply_message: string;
  webhook_url?: string;
  is_active: boolean;
  create_task: boolean;
  task_category_id?: number;
  task_category?: { id: number; uuid: string; name: string; color: string };
  created_at: string;
}

interface TaskCategory {
  id: number;
  uuid: string;
  name: string;
  description: string;
  color: string;
}

export default function AutoReplies() {
  const { devices, user, permissions } = useStore();
  const isAdmin = user?.role === 'superadmin';
  const autoRepliesPerm = permissions?.find(p => p.key === 'auto-replies');
  const canCreate = isAdmin || !!autoRepliesPerm?.can_create;
  const canUpdate = isAdmin || !!autoRepliesPerm?.can_update;
  const canDelete = isAdmin || !!autoRepliesPerm?.can_delete;

  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([]);
  const [selectedDeviceFilter, setSelectedDeviceFilter] = useState<number | 'all'>('all');

  const currentTier = user?.subscription_tier?.toLowerCase() || 'free';
  const tierLimits = {
    free: 3,
    lite: 20,
    regular: 999999,
    pro: 999999,
  };
  const maxRules = isAdmin ? 999999 : (tierLimits[currentTier as keyof typeof tierLimits] || 3);
  const isRulesLimitReached = rules.length >= maxRules;
  const hasWebhooks = isAdmin || currentTier === 'regular' || currentTier === 'pro';
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoReplyRule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [formDeviceID, setFormDeviceID] = useState<number>(0);
  const [formKeyword, setFormKeyword] = useState('');
  const [formMatchType, setFormMatchType] = useState<'EXACT' | 'CONTAINS' | 'START_WITH'>('EXACT');
  const [formReplyMessage, setFormReplyMessage] = useState('');
  const [formWebhookURL, setFormWebhookURL] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formCreateTask, setFormCreateTask] = useState(false);
  const [formTaskCategoryUUID, setFormTaskCategoryUUID] = useState('');

  // Initial Fetch
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rulesList, categoriesList] = await Promise.all([
        api.listAutoReplies(),
        api.listTaskCategories(),
      ]);
      setRules(rulesList);
      setTaskCategories(categoriesList);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch auto-reply data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (devices.length > 0 && formDeviceID === 0) {
      setFormDeviceID(devices[0].id);
    }
  }, [devices, formDeviceID]);

  // Filtered Rules
  const filteredRules = selectedDeviceFilter === 'all'
    ? rules
    : rules.filter(r => r.device_id === selectedDeviceFilter);

  // Open modal for Create
  const handleOpenCreateModal = () => {
    setEditingRule(null);
    setFormKeyword('');
    setFormMatchType('EXACT');
    setFormReplyMessage('');
    setFormWebhookURL('');
    setFormIsActive(true);
    setFormCreateTask(false);
    setFormTaskCategoryUUID('');
    if (devices.length > 0) {
      setFormDeviceID(devices[0].id);
    }
    setError(null);
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEditModal = (rule: AutoReplyRule) => {
    setEditingRule(rule);
    setFormDeviceID(rule.device_id);
    setFormKeyword(rule.keyword);
    setFormMatchType(rule.match_type);
    setFormReplyMessage(rule.reply_message || '');
    setFormWebhookURL(rule.webhook_url || '');
    setFormIsActive(rule.is_active);
    setFormCreateTask(rule.create_task || false);
    setFormTaskCategoryUUID(rule.task_category?.uuid || '');
    setError(null);
    setIsModalOpen(true);
  };

  // Handle Form Submit (Create / Edit)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formKeyword.trim() || (!formReplyMessage.trim() && !formWebhookURL.trim()) || formDeviceID === 0) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (editingRule) {
        // Update Rule
        const updated = await api.updateAutoReply(editingRule.uuid, {
          keyword: formKeyword,
          match_type: formMatchType,
          reply_message: formReplyMessage,
          webhook_url: formWebhookURL,
          is_active: formIsActive,
          create_task: formCreateTask,
          ...(formCreateTask ? { task_category_uuid: formTaskCategoryUUID } : {})
        });
        setRules(rules.map(r => r.uuid === editingRule.uuid ? updated : r));
      } else {
        // Create Rule
        const created = await api.createAutoReply({
          device_id: formDeviceID,
          keyword: formKeyword,
          match_type: formMatchType,
          reply_message: formReplyMessage,
          webhook_url: formWebhookURL,
          is_active: formIsActive,
          create_task: formCreateTask,
          ...(formCreateTask ? { task_category_uuid: formTaskCategoryUUID } : {})
        });
        setRules([created, ...rules]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save auto-reply rule');
    } finally {
      setLoading(false);
    }
  };

  // Delete Rule
  const handleDeleteRule = async (uuid: string) => {
    if (!confirm('Are you sure you want to delete this auto-reply rule?')) return;
    
    setLoading(true);
    setError(null);
    try {
      await api.deleteAutoReply(uuid);
      setRules(rules.filter(r => r.uuid !== uuid));
    } catch (err: any) {
      setError(err.message || 'Failed to delete rule');
    } finally {
      setLoading(false);
    }
  };

  // Toggle IsActive directly
  const handleToggleActive = async (rule: AutoReplyRule) => {
    try {
      const updated = await api.updateAutoReply(rule.uuid, { is_active: !rule.is_active });
      setRules(rules.map(r => r.uuid === rule.uuid ? updated : r));
    } catch (err: any) {
      setError(err.message || 'Failed to toggle status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Bot className="w-7 h-7 text-whatsapp" />
            <span>Auto Reply Rules</span>
            {!isAdmin && (
              <span className="text-[10px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 px-2 py-0.5 rounded-full text-slate-500 font-bold uppercase tracking-wider">
                {currentTier} Tier
              </span>
            )}
          </h1>
          <p className="text-slate-550 dark:text-slate-400 text-sm">
            Configure automatic responses when keywords match incoming messages {!isAdmin && `(Usage: ${rules.length} / ${maxRules === 999999 ? 'Unlimited' : maxRules} rules)`}
          </p>
        </div>

        {canCreate && (
          <button
            onClick={handleOpenCreateModal}
            disabled={devices.length === 0 || isRulesLimitReached}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md transition-all text-sm font-semibold shadow-sm ${
              devices.length === 0 || isRulesLimitReached
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-not-allowed'
                : 'bg-whatsapp hover:bg-emerald-500 text-black cursor-pointer glow-green shadow'
            }`}
          >
            {isRulesLimitReached ? <Lock className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{isRulesLimitReached ? 'Limit Reached' : 'Add Rule'}</span>
          </button>
        )}
      </div>

      {isRulesLimitReached && !isAdmin && (
        <div className="p-4 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-slate-700 dark:text-slate-350 text-sm flex items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-indigo-500 flex-shrink-0 animate-pulse" />
            <span>Anda telah mencapai batas maksimal ({maxRules}) aturan auto-reply untuk paket <strong>{currentTier.toUpperCase()}</strong>. Silakan upgrade paket untuk menambahkan lebih banyak aturan.</span>
          </div>
          <a
            href="/billing"
            className="flex-shrink-0 px-3.5 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded text-xs font-bold transition-all shadow shadow-indigo-500/15"
          >
            Upgrade Paket
          </a>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-md bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 text-sm flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Content panel */}
      <div className="flex flex-col gap-6">
        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-center gap-4 bg-white dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800/80 p-4 rounded-lg shadow-sm">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Filter by Device:</label>
          <select
            value={selectedDeviceFilter}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedDeviceFilter(val === 'all' ? 'all' : Number(val));
            }}
            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-whatsapp min-w-[200px]"
          >
            <option value="all">All Devices</option>
            {devices.map(d => (
              <option key={d.id} value={d.id}>{d.device_name} ({d.phone || 'no phone'})</option>
            ))}
          </select>
        </div>

        {/* Rules List Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {filteredRules.map((rule) => {
            const device = devices.find(d => d.id === rule.device_id);
            return (
              <div
                key={rule.id}
                className={`glass-card card-accent rounded-lg p-6 flex flex-col justify-between space-y-4 border ${
                  rule.is_active ? 'border-slate-200 dark:border-slate-800 hover:border-whatsapp/30' : 'border-slate-200/50 dark:border-slate-800/40 opacity-70'
                } transition-all relative overflow-hidden`}
              >
                {/* Header info */}
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white text-lg font-mono">
                        "{rule.keyword}"
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        rule.match_type === 'EXACT' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20' :
                        rule.match_type === 'CONTAINS' ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20' :
                        'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/20'
                      }`}>
                        {rule.match_type}
                      </span>
                      {rule.create_task && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                          <ClipboardList className="w-3 h-3" />
                          <span>Creates Task</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Device: <span className="text-slate-800 dark:text-slate-300">{device ? device.device_name : `Device #${rule.device_id}`}</span>
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {canUpdate ? (
                      <button
                        onClick={() => handleToggleActive(rule)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          rule.is_active
                            ? 'bg-whatsapp/10 border-whatsapp/25 text-emerald-600 dark:text-whatsapp'
                            : 'bg-slate-105 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
                        }`}
                      >
                        {rule.is_active ? 'Active' : 'Disabled'}
                      </button>
                    ) : (
                      <span
                        className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                          rule.is_active
                            ? 'bg-whatsapp/5 border-whatsapp/10 text-emerald-600/70 dark:text-whatsapp/70'
                            : 'bg-slate-50 border-slate-200 text-slate-550 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-500'
                        }`}
                      >
                        {rule.is_active ? 'Active' : 'Disabled'}
                      </span>
                    )}
                    {canUpdate && (
                      <button
                        onClick={() => handleOpenEditModal(rule)}
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
                        title="Edit Rule"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDeleteRule(rule.uuid)}
                        className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 hover:text-white hover:bg-red-500 transition-all cursor-pointer"
                        title="Delete Rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {rule.reply_message && (
                  <div className="bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 rounded-md p-4 flex gap-3 items-start">
                    <MessageSquare className="w-4 h-4 text-slate-450 dark:text-slate-550 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="text-slate-450 dark:text-slate-550 text-[10px] font-semibold uppercase tracking-wider">Reply message:</span>
                      <p className="text-slate-800 dark:text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">{rule.reply_message}</p>
                    </div>
                  </div>
                )}
                {rule.webhook_url && (
                  <div className="bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 rounded-md p-4 flex gap-3 items-start mt-2">
                    <Link2 className="w-4 h-4 text-whatsapp flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="text-slate-450 dark:text-slate-550 text-[10px] font-semibold uppercase tracking-wider">Webhook URL:</span>
                      <p className="text-slate-800 dark:text-slate-300 text-xs font-mono break-all leading-normal">{rule.webhook_url}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredRules.length === 0 && !loading && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-center space-y-4 glass rounded-lg border border-slate-200 dark:border-slate-800">
              <Bot className="w-16 h-16 text-slate-400 dark:text-slate-700 animate-pulse" />
              <div className="max-w-sm space-y-2">
                <h3 className="text-base font-semibold text-slate-800 dark:text-white">No Auto Reply rules found</h3>
                <p className="text-xs text-slate-500">
                  {selectedDeviceFilter === 'all'
                    ? 'Create rules to automatically reply to inbound user requests based on custom keywords.'
                    : 'No rules found for this specific device. Add your first auto-reply rule now!'}
                </p>
              </div>
              {devices.length > 0 ? (
                canCreate && (
                  <button
                    onClick={handleOpenCreateModal}
                    className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1e293b]/60 dark:hover:bg-[#1e293b] border border-slate-250 dark:border-slate-700 text-slate-800 dark:text-slate-200 px-4 py-2.5 rounded-md text-xs font-semibold transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create first rule</span>
                  </button>
                )
              ) : (
                <p className="text-yellow-600 dark:text-yellow-500 text-xs font-semibold">Please register and connect a WhatsApp device first.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg glass-card rounded-lg p-6 space-y-6 animate-zoom-in">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Bot className="w-5 h-5 text-whatsapp" />
                <span>{editingRule ? 'Edit Auto Reply Rule' : 'Create Auto Reply Rule'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Device selection */}
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Target Device</label>
                  <select
                    value={formDeviceID}
                    onChange={(e) => setFormDeviceID(Number(e.target.value))}
                    disabled={editingRule !== null}
                    className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white focus:outline-none focus:border-whatsapp text-sm disabled:opacity-60"
                  >
                    {devices.map(d => (
                      <option key={d.id} value={d.id}>{d.device_name}</option>
                    ))}
                  </select>
                </div>

                {/* Match type */}
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Match Type</label>
                  <select
                    value={formMatchType}
                    onChange={(e) => setFormMatchType(e.target.value as any)}
                    className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white focus:outline-none focus:border-whatsapp text-sm"
                  >
                    <option value="EXACT">Exact (Keyword matches text exactly)</option>
                    <option value="CONTAINS">Contains (Text contains keyword)</option>
                    <option value="START_WITH">Start With (Text starts with keyword)</option>
                  </select>
                </div>
              </div>

              {/* Keyword */}
              <div>
                <label className="block text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Keyword Trigger</label>
                <input
                  type="text"
                  value={formKeyword}
                  onChange={(e) => setFormKeyword(e.target.value)}
                  placeholder="e.g. price, help, halo"
                  required
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-whatsapp text-sm font-mono"
                />
              </div>

              {/* Reply message */}
              <div>
                <label className="block text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  Reply Message Template {!formWebhookURL.trim() && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  value={formReplyMessage}
                  onChange={(e) => setFormReplyMessage(e.target.value)}
                  placeholder="Insert your automatic reply content here. Optional if Webhook URL is set..."
                  rows={4}
                  required={!formWebhookURL.trim()}
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-whatsapp text-sm leading-relaxed"
                />
              </div>

              {/* Webhook URL */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    Webhook URL (Optional / Sesi Service Desk) {hasWebhooks && !formReplyMessage.trim() && <span className="text-red-500">*</span>}
                  </label>
                  {!hasWebhooks && (
                    <span className="flex items-center gap-1 text-[10px] text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                      <Lock className="w-3 h-3" />
                      <span>Regular / Pro Only</span>
                    </span>
                  )}
                </div>
                <input
                  type="url"
                  value={formWebhookURL}
                  onChange={(e) => setFormWebhookURL(e.target.value)}
                  placeholder={hasWebhooks ? "e.g. http://localhost:3000/servicedesk-hook" : "Upgrade ke paket Regular/Pro untuk mengaktifkan integrasi Webhook"}
                  disabled={!hasWebhooks}
                  required={hasWebhooks && !formReplyMessage.trim()}
                  className={`w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-whatsapp text-sm font-mono ${
                    !hasWebhooks ? 'cursor-not-allowed opacity-60 bg-slate-100/50 dark:bg-slate-950/20' : ''
                  }`}
                />
                {!hasWebhooks && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Ingin menggunakan webhook? <a href="/billing" className="text-indigo-400 font-semibold hover:underline">Upgrade ke Regular / Pro sekarang &rarr;</a>
                  </p>
                )}
              </div>

              {/* Toggle active & Create Task */}
              <div className="flex flex-col gap-3 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-850 p-4 rounded-md">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="formIsActive"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="w-4 h-4 rounded text-whatsapp bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 focus:ring-whatsapp focus:ring-offset-slate-900 cursor-pointer"
                  />
                  <label htmlFor="formIsActive" className="text-sm text-slate-700 dark:text-slate-300 font-semibold cursor-pointer select-none">
                    Enable this rule immediately (Is Active)
                  </label>
                </div>
                <div className="flex items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-800/40">
                  <input
                    type="checkbox"
                    id="formCreateTask"
                    checked={formCreateTask}
                    onChange={(e) => { setFormCreateTask(e.target.checked); if (!e.target.checked) setFormTaskCategoryUUID(''); }}
                    className="w-4 h-4 rounded text-whatsapp bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 focus:ring-whatsapp focus:ring-offset-slate-900 cursor-pointer"
                  />
                  <label htmlFor="formCreateTask" className="text-sm text-slate-700 dark:text-slate-300 font-semibold cursor-pointer select-none">
                    Convert to Support Task (Creates a Ticket on match)
                  </label>
                </div>

                {/* Category dropdown — shown & required when create_task is true */}
                {formCreateTask && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800/40">
                    <label className="block text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
                      Task Category <span className="text-red-500 dark:text-red-400">*</span>
                    </label>
                    {taskCategories.length === 0 ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        No categories found. Please create a Task Category first.
                      </p>
                    ) : (
                      <select
                        value={formTaskCategoryUUID}
                        onChange={(e) => setFormTaskCategoryUUID(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white focus:outline-none focus:border-whatsapp text-sm"
                      >
                        <option value="">— Select a category —</option>
                        {taskCategories.map(cat => (
                          <option key={cat.uuid} value={cat.uuid}>{cat.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-850">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-2.5 rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/40 text-slate-650 dark:text-slate-300 font-semibold text-sm transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-1/2 py-2.5 rounded-md bg-whatsapp hover:bg-emerald-500 text-black font-semibold text-sm transition-all cursor-pointer glow-green flex items-center justify-center gap-1 shadow"
                >
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{editingRule ? 'Update Rule' : 'Create Rule'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
