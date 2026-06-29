import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { api } from '../services/api';
import { Users, Search, Plus, Edit2, Trash2, X, MessageSquare, Tag, ShieldAlert, Check, Download } from 'lucide-react';

interface Contact {
  id: number;
  uuid: string;
  name: string;
  phone: string;
  group: string;
  device_id?: number | null;
  device?: {
    id: number;
    device_name: string;
    phone: string;
  } | null;
  created_at: string;
}

export default function Contacts() {
  const { user, permissions, devices: storeDevices } = useStore();
  const connectedDevices = storeDevices.filter(d => d.status === 'CONNECTED');
  const isAdmin = user?.role === 'superadmin';
  const contactsPerm = permissions?.find(p => p.key === 'contacts');
  const canCreate = isAdmin || !!contactsPerm?.can_create;
  const canUpdate = isAdmin || !!contactsPerm?.can_update;
  const canDelete = isAdmin || !!contactsPerm?.can_delete;

  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [groups, setGroups] = useState<string[]>([]);

  // Tabs state
  const [activeTab, setActiveTab] = useState<'directory' | 'unsaved'>('directory');
  const [unsavedSenders, setUnsavedSenders] = useState<any[]>([]);
  const [unsavedPage, setUnsavedPage] = useState(1);
  const [unsavedTotal, setUnsavedTotal] = useState(0);
  const [unsavedTotalPages, setUnsavedTotalPages] = useState(1);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalContacts, setTotalContacts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formGroup, setFormGroup] = useState('');
  const [formDeviceId, setFormDeviceId] = useState<number | ''>('');

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Import WhatsApp contacts state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedImportDevice, setSelectedImportDevice] = useState<number | ''>('');
  const [importGroup, setImportGroup] = useState('WhatsApp Import');
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; total: number } | null>(null);

  const handleOpenImport = () => {
    setError(null);
    setSuccess(null);
    setImportResult(null);
    setSelectedImportDevice('');
    setImportGroup('WhatsApp Import');
    setIsImportOpen(true);
  };

  const handleImportWhatsAppContacts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedImportDevice) return;

    setActionLoading(true);
    setError(null);
    setImportResult(null);
    try {
      const result = await api.importWhatsAppContacts({
        device_id: Number(selectedImportDevice),
        group: importGroup,
      });
      setImportResult(result);
      setSuccess('Contacts imported successfully!');
      fetchContacts();
    } catch (err: any) {
      setError(err.message || 'Failed to import WhatsApp contacts');
    } finally {
      setActionLoading(false);
    }
  };

  const fetchUnsavedCount = async () => {
    try {
      const response = await api.listUnsavedSenders(1, 1);
      setUnsavedTotal(response.total);
    } catch (err) {
      console.error('Failed to fetch unsaved count:', err);
    }
  };

  const fetchUnsavedSenders = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listUnsavedSenders(unsavedPage, pageSize);
      setUnsavedSenders(response.data);
      setUnsavedTotal(response.total);
      setUnsavedTotalPages(response.total_pages);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch unsaved senders');
    } finally {
      setLoading(false);
    }
  };

  const fetchContacts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listContacts(searchQuery, selectedGroup, currentPage, pageSize);
      setContacts(response.data);
      setTotalContacts(response.total);
      setTotalPages(response.total_pages);

      // Extract unique groups for filter dropdown
      const uniqueGroups = await api.listContactGroups();
      setGroups(uniqueGroups);

      // Update unsaved count
      fetchUnsavedCount();
    } catch (err: any) {
      setError(err.message || 'Failed to fetch contacts');
    } finally {
      setLoading(false);
    }
  };

  // Reset to page 1 on search or filter change
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [searchQuery, selectedGroup]);

  useEffect(() => {
    if (activeTab === 'directory') {
      const delayDebounce = setTimeout(() => {
        fetchContacts();
      }, 300);
      return () => clearTimeout(delayDebounce);
    } else {
      fetchUnsavedSenders();
    }
  }, [currentPage, pageSize, searchQuery, selectedGroup, activeTab, unsavedPage]);



  const handleOpenAdd = () => {
    setFormName('');
    setFormPhone('');
    setFormGroup('');
    setFormDeviceId('');
    setError(null);
    setSuccess(null);
    setIsAddOpen(true);
  };

  const handleOpenAddWithPhone = (phone: string, deviceId?: number) => {
    setFormName('');
    setFormPhone(phone);
    setFormGroup('');
    setFormDeviceId(deviceId || '');
    setError(null);
    setSuccess(null);
    setIsAddOpen(true);
  };

  const handleOpenEdit = (contact: Contact) => {
    setActiveContact(contact);
    setFormName(contact.name);
    setFormPhone(contact.phone);
    setFormGroup(contact.group || '');
    setFormDeviceId(contact.device_id || '');
    setError(null);
    setSuccess(null);
    setIsEditOpen(true);
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) return;

    setActionLoading(true);
    setError(null);
    try {
      await api.createContact({
        name: formName,
        phone: formPhone,
        group: formGroup,
        device_id: formDeviceId ? Number(formDeviceId) : null,
      });
      setSuccess('Contact added successfully!');
      setTimeout(() => {
        setIsAddOpen(false);
        if (activeTab === 'directory') {
          fetchContacts();
        } else {
          fetchUnsavedSenders();
          fetchUnsavedCount();
        }
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to add contact');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeContact || !formName.trim() || !formPhone.trim()) return;

    setActionLoading(true);
    setError(null);
    try {
      await api.updateContact(activeContact.uuid, {
        name: formName,
        phone: formPhone,
        group: formGroup,
        device_id: formDeviceId ? Number(formDeviceId) : null,
      });
      setSuccess('Contact updated successfully!');
      setTimeout(() => {
        setIsEditOpen(false);
        fetchContacts();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to update contact');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteContact = async (uuid: string, name: string) => {
    if (!confirm(`Are you sure you want to delete contact "${name}"?`)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.deleteContact(uuid);
      fetchContacts();
    } catch (err: any) {
      setError(err.message || 'Failed to delete contact');
      setLoading(false);
    }
  };

  const handleQuickMessage = (phone: string) => {
    navigate(`/messages?phone=${phone}`);
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Users className="w-7 h-7 text-whatsapp" />
            <span>Contact Directory</span>
          </h1>
          <p className="text-slate-550 dark:text-slate-400 text-sm">Manage customers, groups and phone records</p>
        </div>

        {canCreate && (
          <div className="flex gap-2.5 w-full sm:w-auto">
            <button
              onClick={handleOpenImport}
              className="w-1/2 sm:w-auto flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-350 hover:text-slate-950 dark:hover:text-white hover:border-slate-350 dark:hover:border-slate-700 px-4 py-2.5 rounded-md text-xs font-semibold transition-all cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Import Contacts</span>
            </button>
            <button
              onClick={handleOpenAdd}
              className="w-1/2 sm:w-auto flex items-center justify-center gap-2 bg-whatsapp hover:bg-emerald-500 text-black px-4 py-2.5 rounded-md text-xs font-semibold transition-all cursor-pointer glow-green shadow"
            >
              <Plus className="w-4 h-4" />
              <span>Add Contact</span>
            </button>
          </div>
        )}
      </div>

      {error && !isAddOpen && !isEditOpen && (
        <div className="p-4 rounded-md bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 text-sm flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
        <button
          onClick={() => setActiveTab('directory')}
          className={`pb-3 text-sm font-semibold transition-all relative cursor-pointer ${
            activeTab === 'directory' 
              ? 'text-whatsapp border-b-2 border-whatsapp' 
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          Directory ({totalContacts})
        </button>
        <button
          onClick={() => setActiveTab('unsaved')}
          className={`pb-3 text-sm font-semibold transition-all relative cursor-pointer flex items-center ${
            activeTab === 'unsaved' 
              ? 'text-whatsapp border-b-2 border-whatsapp' 
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          <span>Unsaved Senders</span>
          {unsavedTotal > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500 border border-amber-100 dark:border-amber-500/30 animate-pulse">
              {unsavedTotal}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'directory' && (
        <div className="glass-card rounded-lg p-4 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-3.5 h-4.5 w-4.5 text-slate-450 dark:text-slate-550" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone or group..."
              className="w-full pl-12 pr-4 py-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0d1428] text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
            />
          </div>

          <div className="w-full md:w-48">
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full px-4 py-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0d1428] text-slate-700 dark:text-slate-300 focus:outline-none focus:border-whatsapp cursor-pointer text-sm"
            >
              <option value="" className="bg-white dark:bg-[#0d1428] text-slate-800 dark:text-white">All Groups</option>
              {groups.map((group) => (
                <option key={group} value={group} className="bg-white dark:bg-[#0d1428] text-slate-800 dark:text-white">
                  {group}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Directory Grid */}
      <div className="glass-card card-accent rounded-lg overflow-hidden border border-slate-200 dark:border-slate-850">
        <div className="overflow-x-auto">
          {activeTab === 'directory' ? (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-550 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="px-6 py-4">Contact Details</th>
                  <th className="px-6 py-4">Phone Number</th>
                  <th className="px-6 py-4">Device</th>
                  <th className="px-6 py-4">Group/Tag</th>
                  <th className="px-6 py-4">Saved At</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 dark:divide-slate-800/60 text-sm">
                {loading && contacts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-500">
                      Loading directory...
                    </td>
                  </tr>
                ) : contacts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16 space-y-3">
                      <div className="flex justify-center">
                        <Users className="w-12 h-12 text-slate-400 dark:text-slate-700" />
                      </div>
                      <p className="font-semibold text-slate-800 dark:text-white">No contacts found</p>
                      <p className="text-xs text-slate-500">Add a contact to your directory to start messaging.</p>
                    </td>
                  </tr>
                ) : (
                  contacts.map((contact) => (
                    <tr key={contact.id} className="hover:bg-slate-100/30 dark:hover:bg-slate-900/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-105 border border-slate-200 dark:bg-slate-800 dark:border-slate-700/50 flex items-center justify-center text-slate-700 dark:text-white font-semibold uppercase">
                            {contact.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">{contact.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-650 dark:text-slate-305">
                        +{contact.phone}
                      </td>
                      <td className="px-6 py-4">
                        {contact.device ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
                            <span>{contact.device.device_name}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {contact.group ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-105 dark:border-purple-500/20">
                            <Tag className="w-3 h-3" />
                            <span>{contact.group}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {new Date(contact.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleQuickMessage(contact.phone)}
                            className="p-2 rounded-lg bg-whatsapp/10 border border-whatsapp/20 text-emerald-600 dark:text-whatsapp hover:text-black dark:hover:text-black hover:bg-whatsapp transition-all cursor-pointer"
                            title="Send Quick Message"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          {canUpdate && (
                            <button
                              onClick={() => handleOpenEdit(contact)}
                              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-205 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
                              title="Edit Contact"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDeleteContact(contact.uuid, contact.name)}
                              className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 hover:text-white hover:bg-red-500 transition-all cursor-pointer"
                              title="Delete Contact"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-550 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="px-6 py-4">Sender Phone</th>
                  <th className="px-6 py-4">Device Received</th>
                  <th className="px-6 py-4">Last Message</th>
                  <th className="px-6 py-4">Received At</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 dark:divide-slate-800/60 text-sm">
                {loading && unsavedSenders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-slate-500">
                      Loading unsaved senders...
                    </td>
                  </tr>
                ) : unsavedSenders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16 space-y-3">
                      <div className="flex justify-center">
                        <Users className="w-12 h-12 text-slate-400 dark:text-slate-700" />
                      </div>
                      <p className="font-semibold text-slate-800 dark:text-white">All senders saved</p>
                      <p className="text-xs text-slate-500">There are no messages from unsaved numbers.</p>
                    </td>
                  </tr>
                ) : (
                  unsavedSenders.map((sender) => (
                    <tr key={sender.phone} className="hover:bg-slate-100/30 dark:hover:bg-slate-900/20 transition-colors">
                      <td className="px-6 py-4 font-mono text-slate-700 dark:text-slate-300">
                        +{sender.phone}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-500/20">
                          <span>{sender.device_name}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 max-w-xs truncate text-slate-500 dark:text-slate-400">
                        {sender.last_message_text}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {new Date(sender.last_message_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenAddWithPhone(sender.phone, sender.device_id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-whatsapp hover:bg-emerald-500 text-black text-xs font-semibold transition-all cursor-pointer glow-green shadow"
                            title="Save to Contacts"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Save Contact</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Directory Pagination Footer */}
        {activeTab === 'directory' && totalContacts > 0 && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-900/20 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-550 dark:text-slate-400">
            <div className="flex items-center gap-4">
              <span>
                Showing <span className="font-semibold text-slate-800 dark:text-white">{Math.min(totalContacts, (currentPage - 1) * pageSize + 1)}</span> to{' '}
                <span className="font-semibold text-slate-800 dark:text-white">{Math.min(totalContacts, currentPage * pageSize)}</span> of{' '}
                <span className="font-semibold text-slate-800 dark:text-white">{totalContacts}</span> entries
              </span>
              <div className="flex items-center gap-1.5 border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0d1428] rounded-lg px-2 py-1 shadow-sm">
                <span className="text-[10px] uppercase text-slate-450 dark:text-slate-500 font-semibold">Show</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-transparent text-slate-800 dark:text-white focus:outline-none cursor-pointer text-xs font-semibold"
                >
                  <option value="10" className="bg-white dark:bg-[#0d1428] text-slate-800 dark:text-white">10</option>
                  <option value="20" className="bg-white dark:bg-[#0d1428] text-slate-800 dark:text-white">20</option>
                  <option value="50" className="bg-white dark:bg-[#0d1428] text-slate-800 dark:text-white">50</option>
                  <option value="100" className="bg-white dark:bg-[#0d1428] text-slate-800 dark:text-white">100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50 hover:bg-slate-205 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed font-medium shadow-sm"
              >
                Previous
              </button>

              {/* Page numbers */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((p, idx, arr) => {
                  const showEllipsisBefore = idx > 0 && p - arr[idx - 1] > 1;
                  return (
                    <div key={p} className="flex items-center gap-1">
                      {showEllipsisBefore && <span className="px-2 text-slate-400 dark:text-slate-600">...</span>}
                      <button
                        onClick={() => setCurrentPage(p)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${currentPage === p
                            ? 'bg-whatsapp border-whatsapp text-black glow-green'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50 hover:bg-slate-205 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-sm'
                          }`}
                      >
                        {p}
                      </button>
                    </div>
                  );
                })}

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50 hover:bg-slate-205 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed font-medium shadow-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Unsaved Pagination Footer */}
        {activeTab === 'unsaved' && unsavedTotal > 0 && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-900/20 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-550 dark:text-slate-400">
            <div className="flex items-center gap-4">
              <span>
                Showing <span className="font-semibold text-slate-800 dark:text-white">{Math.min(unsavedTotal, (unsavedPage - 1) * pageSize + 1)}</span> to{' '}
                <span className="font-semibold text-slate-800 dark:text-white">{Math.min(unsavedTotal, unsavedPage * pageSize)}</span> of{' '}
                <span className="font-semibold text-slate-800 dark:text-white">{unsavedTotal}</span> entries
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setUnsavedPage(prev => Math.max(1, prev - 1))}
                disabled={unsavedPage === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50 hover:bg-slate-205 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed font-medium shadow-sm"
              >
                Previous
              </button>

              {Array.from({ length: unsavedTotalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setUnsavedPage(p)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                    unsavedPage === p
                      ? 'bg-whatsapp border-whatsapp text-black glow-green'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50 hover:bg-slate-205 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-sm'
                  }`}
                >
                  {p}
                </button>
              ))}

              <button
                onClick={() => setUnsavedPage(prev => Math.min(unsavedTotalPages, prev + 1))}
                disabled={unsavedPage === unsavedTotalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50 hover:bg-slate-205 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed font-medium shadow-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Contact Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md glass-card rounded-lg p-6 space-y-6 animate-zoom-in">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Create New Contact</h3>
              <button
                onClick={() => setIsAddOpen(false)}
                className="text-slate-500 hover:text-slate-850 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-4 rounded-md bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 text-xs font-medium">
                {error}
              </div>
            )}

            {success && (
              <div className="p-4 rounded-md bg-whatsapp/15 border border-whatsapp/20 text-emerald-600 dark:text-whatsapp text-xs flex items-center gap-2 font-semibold">
                <Check className="w-4 h-4" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleAddContact} className="space-y-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Full Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. John Doe"
                  required
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0d1428] text-slate-850 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">WhatsApp Phone Number</label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="e.g. 628123456789"
                  required
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0d1428] text-slate-850 dark:text-white placeholder-slate-450 dark:placeholder-slate-600 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Associate WhatsApp Device (Optional)</label>
                <select
                  value={formDeviceId}
                  onChange={(e) => setFormDeviceId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0d1428] text-slate-850 dark:text-white focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm cursor-pointer"
                >
                  <option value="" className="bg-white dark:bg-[#0d1428] text-slate-800 dark:text-white">No associated device (Manual)</option>
                  {storeDevices.map((device) => (
                    <option key={device.id} value={device.id} className="bg-white dark:bg-[#0d1428] text-slate-850 dark:text-white">
                      {device.device_name} ({device.phone || 'No phone number'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Group / Label</label>
                <input
                  type="text"
                  value={formGroup}
                  onChange={(e) => setFormGroup(e.target.value)}
                  placeholder="e.g. Customers, VIP, Staff"
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0d1428] text-slate-850 dark:text-white placeholder-slate-405 dark:placeholder-slate-600 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="w-1/2 py-2.5 rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-300 font-semibold text-sm transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-1/2 py-2.5 rounded-md bg-whatsapp hover:bg-emerald-500 text-black font-semibold text-sm transition-all cursor-pointer glow-green flex items-center justify-center gap-1 shadow"
                >
                  <span>{actionLoading ? 'Saving...' : 'Add Contact'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Contact Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md glass-card rounded-lg p-6 space-y-6 animate-zoom-in">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Modify Contact Details</h3>
              <button
                onClick={() => setIsEditOpen(false)}
                className="text-slate-500 hover:text-slate-850 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-4 rounded-md bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 text-xs font-medium">
                {error}
              </div>
            )}

            {success && (
              <div className="p-4 rounded-md bg-whatsapp/15 border border-whatsapp/20 text-emerald-600 dark:text-whatsapp text-xs flex items-center gap-2 font-semibold">
                <Check className="w-4 h-4" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleEditContact} className="space-y-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-305 text-xs font-semibold uppercase tracking-wider mb-2">Full Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. John Doe"
                  required
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0d1428] text-slate-850 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">WhatsApp Phone Number</label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="e.g. 628123456789"
                  required
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0d1428] text-slate-850 dark:text-white placeholder-slate-450 dark:placeholder-slate-600 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-305 text-xs font-semibold uppercase tracking-wider mb-2">Associate WhatsApp Device (Optional)</label>
                <select
                  value={formDeviceId}
                  onChange={(e) => setFormDeviceId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0d1428] text-slate-850 dark:text-white focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm cursor-pointer"
                >
                  <option value="" className="bg-white dark:bg-[#0d1428] text-slate-800 dark:text-white">No associated device (Manual)</option>
                  {storeDevices.map((device) => (
                    <option key={device.id} value={device.id} className="bg-white dark:bg-[#0d1428] text-slate-850 dark:text-white">
                      {device.device_name} ({device.phone || 'No phone number'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Group / Label</label>
                <input
                  type="text"
                  value={formGroup}
                  onChange={(e) => setFormGroup(e.target.value)}
                  placeholder="e.g. Customers, VIP, Staff"
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0d1428] text-slate-850 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="w-1/2 py-2.5 rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-300 font-semibold text-sm transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-1/2 py-2.5 rounded-md bg-whatsapp hover:bg-emerald-500 text-black font-semibold text-sm transition-all cursor-pointer glow-green flex items-center justify-center gap-1 shadow"
                >
                  <span>{actionLoading ? 'Updating...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Contacts Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md glass-card rounded-lg p-6 space-y-6 animate-zoom-in">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Import from WhatsApp</h3>
              <button
                onClick={() => setIsImportOpen(false)}
                className="text-slate-500 hover:text-slate-850 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-4 rounded-md bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 text-xs font-medium">
                {error}
              </div>
            )}

            {success && importResult && (
              <div className="p-4 rounded-md bg-whatsapp/15 border border-whatsapp/20 text-emerald-600 dark:text-whatsapp text-xs space-y-2 font-medium">
                <div className="flex items-center gap-2 font-semibold">
                  <Check className="w-4 h-4" />
                  <span>{success}</span>
                </div>
                <div className="pl-6 space-y-1 text-slate-600 dark:text-slate-300">
                  <p>• Imported: <span className="font-semibold text-slate-900 dark:text-white">{importResult.imported}</span> new contacts</p>
                  <p>• Skipped: <span className="font-semibold text-slate-900 dark:text-white">{importResult.skipped}</span> duplicates</p>
                </div>
              </div>
            )}

            {!importResult && (
              <form onSubmit={handleImportWhatsAppContacts} className="space-y-4">
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Select Sender Device</label>
                  {connectedDevices.length === 0 ? (
                    <div className="p-4 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs space-y-3 font-medium">
                      <p>No connected WhatsApp devices found. You need a connected device to import contacts.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setIsImportOpen(false);
                          navigate('/devices');
                        }}
                        className="text-emerald-650 dark:text-whatsapp hover:underline font-bold block cursor-pointer"
                      >
                        Go to Devices page &rarr;
                      </button>
                    </div>
                  ) : (
                    <select
                      value={selectedImportDevice}
                      onChange={(e) => setSelectedImportDevice(e.target.value === '' ? '' : Number(e.target.value))}
                      required
                      className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0d1428] text-slate-800 dark:text-white focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm cursor-pointer"
                    >
                      <option value="" className="bg-white dark:bg-slate-950 text-slate-850 dark:text-white">Choose a connected device...</option>
                      {connectedDevices.map((device) => (
                        <option key={device.id} value={device.id} className="bg-white dark:bg-slate-950 text-slate-850 dark:text-white">
                          {device.device_name} ({device.phone || 'No phone number'})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-305 text-xs font-semibold uppercase tracking-wider mb-2">Group / Label for Imported Contacts</label>
                  <input
                    type="text"
                    value={importGroup}
                    onChange={(e) => setImportGroup(e.target.value)}
                    placeholder="e.g. WhatsApp Import"
                    className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0d1428] text-slate-850 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                  />
                  <p className="text-slate-500 text-[10px] mt-1">This label helps you easily filter these contacts later.</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsImportOpen(false)}
                    className="w-1/2 py-2.5 rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-300 font-semibold text-sm transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading || !selectedImportDevice}
                    className="w-1/2 py-2.5 rounded-md bg-whatsapp hover:bg-emerald-500 text-black font-semibold text-sm transition-all cursor-pointer glow-green flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed shadow"
                  >
                    <span>{actionLoading ? 'Importing...' : 'Import Contacts'}</span>
                  </button>
                </div>
              </form>
            )}

            {importResult && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setIsImportOpen(false)}
                  className="w-full py-2.5 rounded-md bg-whatsapp hover:bg-emerald-500 text-black font-semibold text-sm transition-all cursor-pointer glow-green shadow"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
