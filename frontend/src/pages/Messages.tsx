import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { useSearchParams } from 'react-router-dom';
import { api, connectDeviceWS } from '../services/api';
import { Send, Smartphone, ArrowDownLeft, ArrowUpRight, ShieldAlert, Check, CheckCheck, HelpCircle, RefreshCw, X, FileText, Download, Eye } from 'lucide-react';

export default function Messages() {
  const { devices, user, permissions } = useStore();
  const isAdmin = user?.role === 'admin';
  const messagesPerm = permissions?.find(p => p.key === 'messages');
  const canSend = isAdmin || !!messagesPerm?.can_create;
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedDeviceFilter, setSelectedDeviceFilter] = useState<string>('');
  const [searchParams] = useSearchParams();
  
  // Send message form state
  const [sendDeviceId, setSendDeviceId] = useState<string>('');
  const [recipientPhone, setRecipientPhone] = useState<string>('');
  const [messageBody, setMessageBody] = useState<string>('');

  // Pre-populate recipient phone from URL query param if present
  useEffect(() => {
    const phone = searchParams.get('phone');
    if (phone) {
      setRecipientPhone(phone);
    }
  }, [searchParams]);
  
  const [loading, setLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Contacts Mapping for displaying names
  const [contactsMap, setContactsMap] = useState<{ [phone: string]: string }>({});

  // Add Contact Modal state
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [contactFormName, setContactFormName] = useState('');
  const [contactFormPhone, setContactFormPhone] = useState('');
  const [contactFormGroup, setContactFormGroup] = useState('');
  const [contactFormDeviceId, setContactFormDeviceId] = useState<number | ''>('');
  const [contactActionLoading, setContactActionLoading] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSuccess, setContactSuccess] = useState<string | null>(null);

  const fetchContactsMap = async () => {
    try {
      const response = await api.listContacts('', '', 1, 1000);
      const mapping: { [phone: string]: string } = {};
      if (response && response.data) {
        response.data.forEach((c: any) => {
          mapping[c.phone] = c.name;
        });
      }
      setContactsMap(mapping);
    } catch (err) {
      console.error('Failed to prefetch contacts map:', err);
    }
  };

  const handleOpenAddContactModal = (phone: string, deviceId: number) => {
    setContactFormName('');
    setContactFormPhone(phone);
    setContactFormGroup('');
    setContactFormDeviceId(deviceId || '');
    setContactError(null);
    setContactSuccess(null);
    setIsAddContactOpen(true);
  };

  const handleAddContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactFormName.trim() || !contactFormPhone.trim()) return;

    setContactActionLoading(true);
    setContactError(null);
    try {
      await api.createContact({
        name: contactFormName,
        phone: contactFormPhone,
        group: contactFormGroup,
        device_id: contactFormDeviceId ? Number(contactFormDeviceId) : null,
      });
      setContactSuccess('Contact saved successfully!');
      setTimeout(() => {
        setIsAddContactOpen(false);
        fetchContactsMap();
      }, 1000);
    } catch (err: any) {
      setContactError(err.message || 'Failed to save contact');
    } finally {
      setContactActionLoading(false);
    }
  };

  useEffect(() => {
    fetchContactsMap();
  }, []);

  const fetchMessages = async (devId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const msgList = await api.listMessages(devId);
      setMessages(msgList);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch message logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const devId = selectedDeviceFilter ? parseInt(selectedDeviceFilter, 10) : undefined;
    fetchMessages(devId);
  }, [selectedDeviceFilter]);

  // WebSocket Subscription for Realtime Message Updates
  useEffect(() => {
    const activeSockets: { [id: number]: WebSocket } = {};

    // Determine which device IDs we need to listen to
    let devicesToConnect: {id: number, uuid: string}[] = [];
    if (selectedDeviceFilter) {
      const devId = parseInt(selectedDeviceFilter, 10);
      const dev = devices.find(d => d.id === devId);
      if (dev && dev.status === 'CONNECTED') {
        devicesToConnect = [{id: dev.id, uuid: dev.uuid}];
      }
    } else {
      devicesToConnect = devices
        .filter(d => d.status === 'CONNECTED')
        .map(d => ({id: d.id, uuid: d.uuid}));
    }

    devicesToConnect.forEach((dev) => {
      try {
        const ws = connectDeviceWS(dev.uuid, (type, data) => {
          if (type === 'message_sent' || type === 'message_failed') {
            setMessages((prevMessages) =>
              prevMessages.map((msg) => {
                if (msg.id === data.id || msg.uuid === data.uuid) {
                  return {
                    ...msg,
                    status: data.status,
                    sent_at: data.sent_at || msg.sent_at,
                  };
                }
                return msg;
              })
            );
          } else if (type === 'message_received') {
            // Prepend new message if it matches our active filter
            if (!selectedDeviceFilter || parseInt(selectedDeviceFilter, 10) === data.device_id) {
              setMessages((prevMessages) => {
                // Avoid duplicate prepending if we fetch simultaneously
                if (prevMessages.some(m => m.id === data.id || m.uuid === data.uuid)) {
                  return prevMessages;
                }
                return [data, ...prevMessages];
              });
            }
          }
        });
        activeSockets[dev.id] = ws;
      } catch (err) {
        console.error(`Failed to connect WebSocket for device ${dev.id}:`, err);
      }
    });

    return () => {
      Object.values(activeSockets).forEach((ws) => {
        ws.close();
      });
    };
  }, [devices, selectedDeviceFilter]);

  // Set default send device if we have active connected devices
  useEffect(() => {
    const connected = devices.find((d) => d.status === 'CONNECTED');
    if (connected && !sendDeviceId) {
      setSendDeviceId(connected.id.toString());
    }
  }, [devices]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendDeviceId || !recipientPhone.trim() || !messageBody.trim()) return;

    setSendLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await api.sendMessage({
        device_id: parseInt(sendDeviceId, 10),
        phone: recipientPhone.trim(),
        message: messageBody,
      });
      setSuccessMsg('Message successfully enqueued for transmission!');
      setMessageBody('');
      
      // Reload messages list
      const devId = selectedDeviceFilter ? parseInt(selectedDeviceFilter, 10) : undefined;
      fetchMessages(devId);
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSendLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <LoaderIcon />;
      case 'SENT':
        return <Check className="w-3.5 h-3.5 text-slate-400" />;
      case 'DELIVERED':
        return <CheckCheck className="w-3.5 h-3.5 text-slate-400" />;
      case 'READ':
        return <CheckCheck className="w-3.5 h-3.5 text-whatsapp" />;
      case 'FAILED':
        return <ShieldAlert className="w-3.5 h-3.5 text-red-500" />;
      default:
        return <HelpCircle className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-amber-50/50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-100 dark:border-amber-500/20';
      case 'SENT':
        return 'bg-blue-50/50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20';
      case 'DELIVERED':
        return 'bg-emerald-50/50 dark:bg-emerald-500/10 text-emerald-650 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20';
      case 'READ':
        return 'bg-whatsapp/10 text-emerald-600 dark:text-whatsapp border border-whatsapp/20';
      case 'FAILED':
        return 'bg-red-50/50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-105 dark:border-red-500/20';
      default:
        return 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    }
  };

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const renderMessageContent = (msg: any) => {
    if (msg.message_type === 'image') {
      const imgUrl = msg.media_url?.startsWith('http') ? msg.media_url : `${API_URL}${msg.media_url}`;
      return (
        <div className="space-y-2 mt-2 max-w-xs">
          <div 
            className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 cursor-zoom-in group shadow-sm bg-black/5"
            onClick={() => setPreviewImage(imgUrl)}
          >
            <img 
              src={imgUrl} 
              alt={msg.file_name || "Attachment"} 
              className="max-h-40 object-cover w-full transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          {msg.message && msg.message !== msg.file_name && (
            <p className="text-xs text-slate-700 dark:text-slate-350 leading-relaxed break-words whitespace-pre-wrap">{msg.message}</p>
          )}
        </div>
      );
    }
    
    if (msg.message_type === 'document') {
      const docUrl = msg.media_url?.startsWith('http') ? msg.media_url : `${API_URL}${msg.media_url}`;
      return (
        <div className="space-y-2 mt-2 min-w-[200px] max-w-xs">
          <div className="p-2.5 rounded-xl border flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-red-500/10 text-red-500 flex-shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate text-slate-800 dark:text-slate-205">{msg.file_name || 'Document.pdf'}</p>
                <p className="text-[9px] text-slate-500">PDF Document</p>
              </div>
            </div>
            <a 
              href={docUrl} 
              download={msg.file_name || 'Document.pdf'}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-605 dark:text-slate-350 border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer flex-shrink-0"
              title="Download File"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          </div>
          {msg.message && msg.message !== msg.file_name && (
            <p className="text-xs text-slate-705 dark:text-slate-300 leading-relaxed break-words whitespace-pre-wrap">{msg.message}</p>
          )}
        </div>
      );
    }

    return (
      <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed break-words whitespace-pre-wrap">
        {msg.message}
      </p>
    );
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Send Message Form */}
      {canSend && (
        <div className="lg:col-span-1 space-y-6">
        <div className="glass-card rounded-2xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Manual Transmission</h2>
            <p className="text-xs text-slate-550 dark:text-slate-400 mt-1">Send a quick test message using any active device.</p>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 text-xs font-medium">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-4 rounded-xl bg-whatsapp/15 border border-whatsapp/20 text-emerald-600 dark:text-whatsapp text-xs font-semibold">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSendMessage} className="space-y-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Select Sender Device</label>
              <div className="relative">
                <Smartphone className="absolute left-4 top-3.5 h-4.5 w-4.5 text-slate-450 dark:text-slate-550" />
                <select
                  value={sendDeviceId}
                  onChange={(e) => setSendDeviceId(e.target.value)}
                  required
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0d1428] text-slate-800 dark:text-white focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm appearance-none cursor-pointer"
                >
                  <option value="" disabled>Choose device...</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id} disabled={d.status !== 'CONNECTED'} className="bg-white dark:bg-slate-950 text-slate-800 dark:text-white">
                      {d.device_name} ({d.status === 'CONNECTED' ? 'CONNECTED' : 'OFFLINE'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Recipient Phone Number</label>
              <input
                type="text"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="628123456789 (Include country code)"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-650 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Message Content</label>
              <textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder="Write message details..."
                required
                rows={4}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-650 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm resize-none leading-relaxed"
              />
            </div>

            <button
              type="submit"
              disabled={sendLoading || devices.length === 0}
              className="w-full bg-whatsapp hover:bg-emerald-500 text-black font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all glow-green cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow"
            >
              <span>{sendLoading ? 'Enqueuing...' : 'Send Message'}</span>
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
      )}

      {/* Message logs */}
      <div className={canSend ? "lg:col-span-2 space-y-6" : "lg:col-span-3 space-y-6"}>
        <div className="glass-card rounded-2xl p-6 space-y-6 flex flex-col h-[650px]">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Transmission Logs</h2>
              <p className="text-xs text-slate-550 dark:text-slate-400 mt-1">Realtime message history.</p>
            </div>
            
            <div className="flex items-center gap-2">
              <select
                value={selectedDeviceFilter}
                onChange={(e) => setSelectedDeviceFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-800 bg-slate-55 dark:bg-[#0d1428] rounded-xl text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
              >
                <option value="" className="bg-white dark:bg-slate-950 text-slate-800 dark:text-white">All Devices</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id} className="bg-white dark:bg-slate-950 text-slate-800 dark:text-white">
                    {d.device_name}
                  </option>
                ))}
              </select>

              <button
                onClick={() => {
                  const devId = selectedDeviceFilter ? parseInt(selectedDeviceFilter, 10) : undefined;
                  fetchMessages(devId);
                }}
                disabled={loading}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/30 text-slate-605 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition-all cursor-pointer shadow-sm"
                title="Refresh Logs"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Logs List Container */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {loading && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-2">
                <RefreshCw className="w-8 h-8 text-whatsapp animate-spin" />
                <span className="text-xs text-slate-550">Loading records...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <Send className="w-10 h-10 text-slate-400 dark:text-slate-600" />
                <span className="text-sm font-semibold text-slate-800 dark:text-white">No messages logged</span>
                <span className="text-xs text-slate-500 max-w-[200px]">Send a test message above to begin.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => {
                  const isOutgoing = msg.direction === 'OUT';
                  return (
                    <div
                      key={msg.id}
                      className="p-4 rounded-xl bg-slate-50/40 dark:bg-[#0d1428]/30 border border-slate-200 dark:border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:bg-slate-100/50 dark:hover:bg-slate-900/30 shadow-sm"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Direction Badge */}
                        <div className={`p-2 rounded-lg border flex-shrink-0 mt-0.5 ${
                          isOutgoing 
                            ? 'bg-purple-50 dark:bg-purple-500/10 border-purple-100 dark:border-purple-500/20 text-purple-600 dark:text-purple-400' 
                            : 'bg-orange-50 dark:bg-orange-500/10 border-orange-100 dark:border-orange-500/20 text-orange-600 dark:text-orange-400'
                        }`}>
                          {isOutgoing ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                        </div>
                        
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {(() => {
                              const rawPhone = msg.phone.split('@')[0];
                              const cleanPhone = rawPhone.replace(/\D/g, '');
                              const contactName = contactsMap[cleanPhone];
                              if (contactName) {
                                  return (
                                    <>
                                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{contactName}</span>
                                      <span className="text-xs text-slate-500 font-mono">+{cleanPhone}</span>
                                    </>
                                  );
                              }
                              return (
                                <>
                                  <span className="text-sm font-semibold text-slate-900 dark:text-white font-mono">+{cleanPhone}</span>
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-100 dark:border-amber-500/20">
                                    Unsaved
                                  </span>
                                  {canSend && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenAddContactModal(cleanPhone, msg.device_id)}
                                      className="text-[10px] text-emerald-600 dark:text-whatsapp hover:underline font-semibold cursor-pointer"
                                    >
                                      Add Contact
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                            <span className="text-[10px] text-slate-450 dark:text-slate-500 font-mono">
                              {new Date(msg.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                          {renderMessageContent(msg)}
                        </div>
                      </div>

                      {/* Status */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between flex-shrink-0 gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-150 dark:border-slate-800/40">
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border ${getStatusBadgeClass(msg.status)}`}>
                          {getStatusIcon(msg.status)}
                          <span className="uppercase tracking-wide">{msg.status}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
      {/* Add Contact Modal */}
      {isAddContactOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md glass-card rounded-2xl p-6 space-y-6 animate-zoom-in">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Save Unsaved Number</h3>
              <button
                onClick={() => setIsAddContactOpen(false)}
                className="text-slate-550 hover:text-slate-805 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {contactError && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 text-xs font-medium">
                {contactError}
              </div>
            )}

            {contactSuccess && (
              <div className="p-4 rounded-xl bg-whatsapp/15 border border-whatsapp/20 text-emerald-600 dark:text-whatsapp text-xs flex items-center gap-2 font-semibold">
                <Check className="w-4 h-4" />
                <span>{contactSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAddContactSubmit} className="space-y-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Full Name</label>
                <input
                  type="text"
                  value={contactFormName}
                  onChange={(e) => setContactFormName(e.target.value)}
                  placeholder="e.g. John Doe"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0d1428] text-slate-850 dark:text-white placeholder-slate-400 dark:placeholder-slate-650 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Phone Number</label>
                <input
                  type="text"
                  value={contactFormPhone}
                  disabled
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#0d1428]/50 text-slate-500 dark:text-slate-400 focus:outline-none transition-all text-sm font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Associate Device</label>
                <select
                  value={contactFormDeviceId}
                  onChange={(e) => setContactFormDeviceId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0d1428] text-slate-850 dark:text-white focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm cursor-pointer"
                >
                  <option value="" className="bg-white dark:bg-slate-950 text-slate-800 dark:text-white">No associated device (Manual)</option>
                  {devices.map((device) => (
                    <option key={device.id} value={device.id} className="bg-white dark:bg-slate-950 text-slate-850 dark:text-white">
                      {device.device_name} ({device.phone || 'No phone number'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Group / Label</label>
                <input
                  type="text"
                  value={contactFormGroup}
                  onChange={(e) => setContactFormGroup(e.target.value)}
                  placeholder="e.g. Customers, VIP, Staff"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0d1428] text-slate-850 dark:text-white placeholder-slate-400 dark:placeholder-slate-655 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddContactOpen(false)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-300 font-semibold text-sm transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={contactActionLoading}
                  className="w-1/2 py-2.5 rounded-xl bg-whatsapp hover:bg-emerald-500 text-black font-semibold text-sm transition-all cursor-pointer glow-green flex items-center justify-center gap-1 shadow"
                >
                  <span>{contactActionLoading ? 'Saving...' : 'Save Contact'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Full-screen Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950 shadow-2xl animate-zoom-in" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="Preview" className="max-w-full max-h-[85vh] object-contain" />
            <button 
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-black/60 text-white hover:bg-black/80 hover:text-whatsapp transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function LoaderIcon() {
  return (
    <svg className="animate-spin h-3.5 w-3.5 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}
