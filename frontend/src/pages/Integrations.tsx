import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import { api } from '../services/api';
import { KeyRound, Plus, Copy, Check, X, ShieldAlert, Smartphone, History, Eye, EyeOff, Lock } from 'lucide-react';

interface ApiKey {
  id: number;
  uuid: string;
  name: string;
  masked_token: string;
  device_id: number;
  is_active: boolean;
  allowed_ips?: string;
  expires_at?: string;
  last_used_at?: string;
  last_used_ip?: string;
  device?: {
    device_name: string;
    phone: string;
  };
  created_at: string;
}

interface MessageLog {
  id: number;
  uuid: string;
  phone: string;
  message: string;
  message_type: string;
  status: string;
  media_url?: string;
  file_name?: string;
  created_at: string;
}

export default function Integrations() {
  const { user, permissions } = useStore();
  const isAdmin = user?.role === 'superadmin';
  const integrasiPerm = permissions?.find(p => p.key === 'integrasi');
  const canCreate = isAdmin || !!integrasiPerm?.can_create;
  const canUpdate = isAdmin || !!integrasiPerm?.can_update;

  const currentTier = user?.subscription_tier?.toLowerCase() || 'free';
  const hasAPIAccess = isAdmin || currentTier !== 'free';

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create Modal state
  const [isAdding, setIsAdding] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyDeviceId, setNewKeyDeviceId] = useState<number>(0);
  const [newGeneratedToken, setNewGeneratedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  
  // Custom Security Configuration States
  const [formAllowedIPs, setFormAllowedIPs] = useState('*');
  const [formExpirationType, setFormExpirationType] = useState('never');
  const [formCustomExpirationDate, setFormCustomExpirationDate] = useState('');

  // Logs Modal state
  const [activeLogsKey, setActiveLogsKey] = useState<ApiKey | null>(null);
  const [logsList, setLogsList] = useState<MessageLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [logsSearch, setLogsSearch] = useState('');

  // Temporary show/hide visual state for masked tokens
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [keysList, devList] = await Promise.all([
        api.listApiKeys(),
        api.listDevices()
      ]);
      setApiKeys(keysList);
      setDevices(devList.filter(d => d.status === 'CONNECTED')); // Only show connected devices
    } catch (err: any) {
      setError(err.message || 'Failed to load integrations data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim() || !newKeyDeviceId) return;

    setLoading(true);
    setError(null);
    try {
      let expires_at: string | null = null;
      if (formExpirationType === '30') {
        expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      } else if (formExpirationType === '90') {
        expires_at = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      } else if (formExpirationType === 'custom' && formCustomExpirationDate) {
        expires_at = new Date(formCustomExpirationDate).toISOString();
      }

      const allowed_ips = formAllowedIPs.trim() === '' ? '*' : formAllowedIPs.trim();

      const response = await api.createApiKey({
        name: newKeyName,
        device_id: newKeyDeviceId,
        allowed_ips,
        expires_at
      });

      // Response includes the raw token in `token`
      setNewGeneratedToken(response.token);

      // Refresh list
      const keysList = await api.listApiKeys();
      setApiKeys(keysList);

      // Reset input form
      setNewKeyName('');
      setNewKeyDeviceId(0);
      setFormAllowedIPs('*');
      setFormExpirationType('never');
      setFormCustomExpirationDate('');
    } catch (err: any) {
      setError(err.message || 'Failed to create API key');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleKey = async (key: ApiKey) => {
    try {
      const updated = await api.toggleApiKey(key.uuid);
      setApiKeys(prev => prev.map(k => k.uuid === key.uuid ? { ...k, is_active: updated.is_active } : k));
    } catch (err: any) {
      setError(err.message || 'Failed to toggle API Key status');
    }
  };

  const handleViewLogs = async (key: ApiKey) => {
    setActiveLogsKey(key);
    setLogsPage(1);
    setLogsSearch('');
    setLoadingLogs(true);
    setLogsList([]);
    try {
      const response = await api.getApiKeyLogs(key.uuid, 1, 10, '');
      setLogsList(response.data);
      setLogsTotal(response.total);
      setLogsTotalPages(response.total_pages);
    } catch (err: any) {
      alert(err.message || 'Failed to load logs');
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (!activeLogsKey) return;

    const delayDebounceFn = setTimeout(() => {
      const load = async () => {
        setLoadingLogs(true);
        try {
          const response = await api.getApiKeyLogs(activeLogsKey.uuid, logsPage, 10, logsSearch);
          setLogsList(response.data);
          setLogsTotal(response.total);
          setLogsTotalPages(response.total_pages);
        } catch (err: any) {
          console.error(err);
        } finally {
          setLoadingLogs(false);
        }
      };
      load();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [logsSearch, logsPage, activeLogsKey]);

  const handleSearchChange = (val: string) => {
    setLogsSearch(val);
    setLogsPage(1);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const toggleReveal = (uuid: string) => {
    setRevealedKeys(prev => ({
      ...prev,
      [uuid]: !prev[uuid]
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <span>API Integrations</span>
            {!isAdmin && (
              <span className="text-[10px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 px-2 py-0.5 rounded-full text-slate-500 font-bold uppercase tracking-wider">
                {currentTier} Tier
              </span>
            )}
          </h1>
          <p className="text-slate-550 dark:text-slate-400 text-sm mt-0.5">
            Create and manage API Keys to connect external backend systems with WhatsApp Gateway
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => {
              if (!hasAPIAccess) return;
              setIsAdding(true);
              setNewGeneratedToken(null);
            }}
            disabled={!hasAPIAccess}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md transition-all text-sm font-semibold shadow-sm ${
              !hasAPIAccess
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-not-allowed'
                : 'bg-whatsapp hover:bg-emerald-500 text-black cursor-pointer glow-green shadow'
            }`}
          >
            {!hasAPIAccess ? <Lock className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>Create API Key</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 text-sm flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* API Keys Table */}
      <div className="glass-card rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800/60 shadow-md relative min-h-[300px]">
        {!hasAPIAccess && (
          <div className="absolute inset-0 bg-slate-50/80 dark:bg-[#060a14]/90 backdrop-blur-md z-20 flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-md">
              <Lock className="w-6 h-6 animate-pulse" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">API Key Integration is Locked</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Akses API Key WhatsDesk tidak tersedia untuk paket <strong>FREE</strong>. Silakan upgrade ke paket Lite, Regular, atau Pro untuk mulai mengintegrasikan sistem ERP, billing, CRM atau server Anda.
              </p>
            </div>
            <a
              href="/billing"
              className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-500/20 hover:scale-102 transition-all flex items-center gap-2"
            >
              Upgrade Paket Sekarang &rarr;
            </a>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800/60 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <th className="px-6 py-4">Key Name</th>
                <th className="px-6 py-4">Bound WhatsApp Device</th>
                <th className="px-6 py-4">API Token Prefix</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Allowed IPs</th>
                <th className="px-6 py-4">Expiration</th>
                <th className="px-6 py-4">Last Used</th>
                <th className="px-6 py-4">Created At</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 dark:divide-slate-800/40 text-sm">
              {apiKeys.map((key) => (
                <tr key={key.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-950 dark:text-white">
                    {key.name}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-whatsapp" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-slate-200">
                          {key.device?.device_name || `Device ID: ${key.device_id}`}
                        </span>
                        {key.device?.phone && (
                          <span className="block text-xs text-slate-500">
                            +{key.device.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span>
                        {revealedKeys[key.uuid] ? key.masked_token : 'wa_key_****************xxxx'}
                      </span>
                      <button
                        onClick={() => toggleReveal(key.uuid)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
                        title={revealedKeys[key.uuid] ? 'Hide Key' : 'Show Key Mask'}
                      >
                        {revealedKeys[key.uuid] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${key.is_active
                      ? 'bg-whatsapp/10 text-emerald-600 dark:text-whatsapp border-whatsapp/20'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                      }`}>
                      {key.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {key.allowed_ips === '*' || !key.allowed_ips ? (
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-655 dark:text-slate-350 text-xs font-mono font-medium border border-slate-250 dark:border-slate-700/60">
                        * (Any IP)
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-slate-700 dark:text-slate-300 block max-w-[150px] truncate" title={key.allowed_ips}>
                        {key.allowed_ips}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs">
                    {key.expires_at ? (
                      (() => {
                        const isExpired = new Date(key.expires_at) < new Date();
                        return (
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                            isExpired 
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25' 
                              : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                          }`}>
                            {isExpired ? 'Expired' : new Date(key.expires_at).toLocaleDateString()}
                          </span>
                        );
                      })()
                    ) : (
                      <span className="text-slate-400 italic">Never</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500">
                    {key.last_used_at ? (
                      <div title={`IP: ${key.last_used_ip || 'N/A'}`}>
                        <span>{new Date(key.last_used_at).toLocaleString()}</span>
                        {key.last_used_ip && (
                          <span className="block text-[10px] text-slate-405 dark:text-slate-450 font-mono">
                            IP: {key.last_used_ip}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">Never</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs">
                    {new Date(key.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end items-center gap-2">
                      {canUpdate && (
                        <button
                          onClick={() => handleToggleKey(key)}
                          className={`px-2.5 py-1 rounded text-xs font-bold border transition-all cursor-pointer ${key.is_active
                            ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/20'
                            : 'bg-whatsapp/10 hover:bg-whatsapp/20 text-emerald-600 dark:text-whatsapp border-whatsapp/20'
                            }`}
                          title={key.is_active ? 'Deactivate Key' : 'Activate Key'}
                        >
                          {key.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                      <button
                        onClick={() => handleViewLogs(key)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all cursor-pointer"
                        title="View Usage Logs"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>Logs</span>
                      </button>

                    </div>
                  </td>
                </tr>
              ))}

              {apiKeys.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <KeyRound className="w-12 h-12 text-slate-300 dark:text-slate-700 animate-pulse" />
                      <div>
                        <h3 className="font-semibold text-slate-800 dark:text-slate-250">No API Keys Generated</h3>
                        <p className="text-xs max-w-sm mt-1">Generate an API key and hook it to external servers to send notification messages autonomously.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add API Key Modal */}
      {isAdding && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md glass-card rounded-lg p-6 space-y-6 animate-zoom-in relative">
            <button
              onClick={() => setIsAdding(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-800 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {!newGeneratedToken ? (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Create Integration API Key</h3>
                  <p className="text-xs text-slate-500 mt-1">Generate a secure token linked to a specific active WhatsApp device.</p>
                </div>

                <form onSubmit={handleCreateKey} className="space-y-4">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Integration Name</label>
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g. ERP Invoicing system"
                      required
                      className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Linked Device</label>
                    <select
                      value={newKeyDeviceId}
                      onChange={(e) => setNewKeyDeviceId(Number(e.target.value))}
                      required
                      className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                    >
                      <option value="">Select a connected device...</option>
                      {devices.map(d => (
                        <option key={d.id} value={d.id}>{d.device_name} (+{d.phone})</option>
                      ))}
                    </select>
                    {devices.length === 0 && (
                      <p className="text-[10px] text-amber-500 font-medium mt-1">Note: Only active (CONNECTED) devices can be bound to API Keys.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Allowed IPs (Whitelist)</label>
                    <input
                      type="text"
                      value={formAllowedIPs}
                      onChange={(e) => setFormAllowedIPs(e.target.value)}
                      placeholder="e.g. 192.168.1.10, 203.0.113.5 (Default: * for any IP)"
                      className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Expiration Time</label>
                    <select
                      value={formExpirationType}
                      onChange={(e) => setFormExpirationType(e.target.value)}
                      className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                    >
                      <option value="never">Never (No expiration)</option>
                      <option value="30">30 Days</option>
                      <option value="90">90 Days</option>
                      <option value="custom">Custom Date...</option>
                    </select>
                  </div>

                  {formExpirationType === 'custom' && (
                    <div>
                      <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Custom Expiration Date</label>
                      <input
                        type="date"
                        value={formCustomExpirationDate}
                        onChange={(e) => setFormCustomExpirationDate(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                      />
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAdding(false)}
                      className="w-1/2 py-2.5 rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-300 font-semibold text-sm transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !newKeyName.trim() || !newKeyDeviceId}
                      className="w-1/2 py-2.5 rounded-md bg-whatsapp hover:bg-emerald-500 text-black font-semibold text-sm transition-all cursor-pointer glow-green shadow"
                    >
                      <span>Generate Key</span>
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white text-emerald-500">API Key Successfully Generated!</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Please copy the API key below and save it securely. <strong>For security reasons, it cannot be displayed again.</strong></p>
                </div>

                <div className="p-4 rounded bg-slate-900 border border-slate-800 flex items-center justify-between gap-4 font-mono text-sm text-slate-250 select-all relative overflow-hidden">
                  <div className="truncate flex-1 pr-4">{newGeneratedToken}</div>
                  <button
                    onClick={() => copyToClipboard(newGeneratedToken)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded transition-colors cursor-pointer"
                    title="Copy API Key"
                  >
                    {copiedToken ? <Check className="w-4 h-4 text-whatsapp" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  onClick={() => setIsAdding(false)}
                  className="w-full py-2.5 bg-whatsapp hover:bg-emerald-500 text-black font-semibold rounded-md transition-all text-sm cursor-pointer glow-green shadow text-center"
                >
                  Done, I Have Saved It
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Logs Modal */}
      {activeLogsKey && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-3xl glass-card rounded-lg p-6 space-y-4 animate-zoom-in relative max-h-[85vh] flex flex-col">

            {/* Header */}
            <div className="flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-whatsapp" />
                  <span>Integration Logs: {activeLogsKey.name}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">Outbound API transaction logs mapped to device</p>
              </div>
              <button
                onClick={() => setActiveLogsKey(null)}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0 bg-slate-50/50 dark:bg-slate-900/10 p-3 rounded-lg border border-slate-200 dark:border-slate-800/40">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={logsSearch}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search by phone or message content..."
                  className="w-full pl-3 pr-10 py-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-xs"
                />
                {logsSearch && (
                  <button
                    onClick={() => handleSearchChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Total Logs Found: <span className="text-slate-800 dark:text-white font-bold">{logsTotal}</span>
              </div>
            </div>

            {/* DataTable Grid */}
            <div className="flex-1 overflow-y-auto min-h-0 border border-slate-200 dark:border-slate-800/60 rounded-md">
              {loadingLogs ? (
                <div className="py-16 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
                  <span className="w-6 h-6 rounded-full border-2 border-whatsapp border-t-transparent animate-spin"></span>
                  <span>Loading logs...</span>
                </div>
              ) : logsList.length > 0 ? (
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100/50 dark:bg-slate-900/40 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800/60 sticky top-0">
                    <tr>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Message / Attachment</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Sent At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 dark:divide-slate-800/40">
                    {logsList.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/5">
                        <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-350">
                          +{log.phone}
                        </td>
                        <td className="px-4 py-3 max-w-[280px]">
                          <div className="space-y-1">
                            {log.message && <p className="truncate text-slate-805 dark:text-white" title={log.message}>{log.message}</p>}
                            {log.media_url && (
                              <div className="flex items-center gap-1.5 text-[10px] text-whatsapp font-medium bg-whatsapp/5 px-2 py-0.5 rounded border border-whatsapp/10 w-fit truncate max-w-full" title={log.media_url}>
                                <span>[{log.message_type.toUpperCase()}]</span>
                                <span className="truncate">{log.file_name || 'Attachment'}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${log.status === 'SENT' || log.status === 'DELIVERED' || log.status === 'READ'
                            ? 'bg-whatsapp/15 text-whatsapp'
                            : log.status === 'FAILED'
                              ? 'bg-red-500/15 text-red-500'
                              : 'bg-amber-500/15 text-amber-500 animate-pulse'
                            }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-16 text-center text-slate-500 text-sm">
                  <span>No message logs match your search.</span>
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            {logsTotal > 0 && (
              <div className="flex items-center justify-between flex-shrink-0 pt-3 border-t border-slate-150 dark:border-slate-800/40 text-xs">
                <div className="text-slate-550 dark:text-slate-400">
                  Showing {Math.min((logsPage - 1) * 10 + 1, logsTotal)} to {Math.min(logsPage * 10, logsTotal)} of {logsTotal} entries
                </div>
                <div className="flex items-center gap-1">
                  <button
                    disabled={logsPage === 1 || loadingLogs}
                    onClick={() => setLogsPage(p => Math.max(p - 1, 1))}
                    className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer font-medium"
                  >
                    Previous
                  </button>
                  {Array.from({ length: logsTotalPages }, (_, i) => i + 1).map(pageNum => (
                    <button
                      key={pageNum}
                      onClick={() => setLogsPage(pageNum)}
                      className={`px-2.5 py-1.5 rounded border font-semibold transition-all cursor-pointer ${logsPage === pageNum
                        ? 'bg-whatsapp border-whatsapp text-black font-black shadow-sm glow-green'
                        : 'border-slate-200 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                        }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                  <button
                    disabled={logsPage === logsTotalPages || loadingLogs}
                    onClick={() => setLogsPage(p => Math.min(p + 1, logsTotalPages))}
                    className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer font-medium"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end flex-shrink-0 pt-2 border-t border-slate-200 dark:border-slate-800/60">
              <button
                onClick={() => setActiveLogsKey(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/65 text-slate-700 dark:text-slate-200 rounded text-sm font-semibold transition-all cursor-pointer"
              >
                Close Logs
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
