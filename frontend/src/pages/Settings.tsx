import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useStore } from '../store/useStore';
import {
  Users,
  Shield,
  CheckSquare,
  Plus,
  Trash2,
  Edit2,
  Save,
  RefreshCw,
  X,
  ShieldAlert,
  Check,
  Lock
} from 'lucide-react';

interface DeviceItem {
  id: number;
  uuid: string;
  device_name: string;
}

interface TaskCategoryItem {
  id: number;
  uuid: string;
  name: string;
  color: string;
}

interface UserItem {
  id: number;
  uuid: string;
  name: string;
  nickname?: string;
  email: string;
  role: string;
  phone_number?: string;
  is_notification_enabled?: boolean;
  created_at: string;
  devices?: DeviceItem[];
  task_categories?: TaskCategoryItem[];
}

interface RoleItem {
  id: number;
  uuid: string;
  name: string;
  description: string;
}



interface PermissionItem {
  menu_id: number;
  menu_key: string;
  menu_name: string;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
}
export default function Settings() {
  const { user: currentUser, permissions: userPermissions } = useStore();
  const isSuperAdmin = currentUser?.role === 'superadmin';
  const isOwner = currentUser?.role === 'owner_subscriber';

  // Permissions helpers
  const usersPerm = userPermissions?.find(p => p.key === 'users');
  const canCreateUser = isSuperAdmin || isOwner || !!usersPerm?.can_create;
  const canUpdateUser = isSuperAdmin || isOwner || !!usersPerm?.can_update;
  const canDeleteUser = isSuperAdmin || isOwner || !!usersPerm?.can_delete;

  const rolesPerm = userPermissions?.find(p => p.key === 'roles');
  const canCreateRole = isSuperAdmin || !!rolesPerm?.can_create;
  const canUpdateRole = isSuperAdmin || !!rolesPerm?.can_update;
  const canDeleteRole = isSuperAdmin || !!rolesPerm?.can_delete;
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'permissions'>('users');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Users State
  const [users, setUsers] = useState<UserItem[]>([]);
  const [devicesList, setDevicesList] = useState<DeviceItem[]>([]);
  const [categoriesList, setCategoriesList] = useState<TaskCategoryItem[]>([]);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [userForm, setUserForm] = useState({
    name: '',
    nickname: '',
    email: '',
    password: '',
    role: 'user',
    device_ids: [] as number[],
    task_category_uuids: [] as string[],
    phone_number: '',
    is_notification_enabled: false
  });

  // Roles State
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: ''
  });

  // Permissions State
  const [selectedRoleUuid, setSelectedRoleUuid] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);

  // Fetch functions
  const fetchUsers = async () => {
    try {
      const data = await api.listUsers();
      setUsers(data);
      const devices = await api.listDevices();
      setDevicesList(devices);
      const categories = await api.listTaskCategories();
      setCategoriesList(categories);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users');
    }
  };

  const fetchRoles = async () => {
    try {
      const data = await api.listRoles();
      setRoles(data);
      if (data.length > 0 && !selectedRoleUuid) {
        // Find first role that is not admin if possible
        const nonAdmin = data.find(r => r.name !== 'admin') || data[0];
        setSelectedRoleUuid(nonAdmin.uuid);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch roles');
    }
  };

  const fetchPermissions = async (roleUuid: string) => {
    try {
      setLoading(true);
      const data = await api.getRolePermissions(roleUuid);
      setPermissions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch role permissions');
    } finally {
      setLoading(false);
    }
  };

  // Load initial data
  useEffect(() => {
    setError(null);
    setSuccess(null);
    if (activeTab === 'users') {
      fetchUsers();
      fetchRoles();
    } else if (activeTab === 'roles') {
      fetchRoles();
    } else if (activeTab === 'permissions') {
      fetchRoles();
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedRoleUuid && activeTab === 'permissions') {
      fetchPermissions(selectedRoleUuid);
    }
  }, [selectedRoleUuid, activeTab]);

  // Alert helpers
  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 4000);
  };

  // User CRUD Handlers
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (userForm.is_notification_enabled && userForm.phone_number.trim() === '') {
      setError('Phone number is required when notifications are enabled');
      return;
    }
    setLoading(true);
    try {
      await api.createUser(userForm);
      showSuccess('User created successfully');
      setIsAddingUser(false);
      setUserForm({
        name: '',
        nickname: '',
        email: '',
        password: '',
        role: 'user',
        device_ids: [],
        task_category_uuids: [],
        phone_number: '',
        is_notification_enabled: false
      });
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setError(null);
    if (userForm.is_notification_enabled && userForm.phone_number.trim() === '') {
      setError('Phone number is required when notifications are enabled');
      return;
    }
    setLoading(true);
    try {
      const payload: any = {
        name: userForm.name,
        nickname: userForm.nickname,
        email: userForm.email,
        role: userForm.role,
        device_ids: userForm.device_ids,
        task_category_uuids: userForm.task_category_uuids,
        phone_number: userForm.phone_number,
        is_notification_enabled: userForm.is_notification_enabled
      };
      if (userForm.password.trim() !== '') {
        payload.password = userForm.password;
      }
      await api.updateUser(editingUser.uuid, payload);
      showSuccess('User updated successfully');
      setEditingUser(null);
      setIsAddingUser(false);
      setUserForm({
        name: '',
        nickname: '',
        email: '',
        password: '',
        role: 'user',
        device_ids: [],
        task_category_uuids: [],
        phone_number: '',
        is_notification_enabled: false
      });
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (user: UserItem) => {
    if (user.id === currentUser?.id) {
      setError('You cannot delete your own account');
      return;
    }
    if (!confirm('Are you sure you want to delete this user?')) return;
    setError(null);
    try {
      await api.deleteUser(user.uuid);
      showSuccess('User deleted successfully');
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    }
  };

  const startEditUser = (user: UserItem) => {
    setEditingUser(user);
    setUserForm({
      name: user.name,
      nickname: user.nickname || '',
      email: user.email,
      password: '',
      role: user.role,
      device_ids: user.devices ? user.devices.map(d => d.id) : [],
      task_category_uuids: user.task_categories ? user.task_categories.map(c => c.uuid) : [],
      phone_number: user.phone_number || '',
      is_notification_enabled: !!user.is_notification_enabled
    });
    setIsAddingUser(true);
  };

  // Role CRUD Handlers
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.createRole(roleForm);
      showSuccess('Role created successfully');
      setIsAddingRole(false);
      setRoleForm({ name: '', description: '' });
      fetchRoles();
    } catch (err: any) {
      setError(err.message || 'Failed to create role');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;
    setError(null);
    setLoading(true);
    try {
      await api.updateRole(editingRole.uuid, roleForm);
      showSuccess('Role updated successfully');
      setEditingRole(null);
      setIsAddingRole(false);
      setRoleForm({ name: '', description: '' });
      fetchRoles();
    } catch (err: any) {
      setError(err.message || 'Failed to update role');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (role: RoleItem) => {
    if (role.name === 'admin' || role.name === 'user') {
      setError(`Core system role '${role.name}' cannot be deleted`);
      return;
    }
    if (!confirm(`Are you sure you want to delete role '${role.name}'? This will set all users with this role to unassigned.`)) return;
    setError(null);
    try {
      await api.deleteRole(role.uuid);
      showSuccess('Role deleted successfully');
      fetchRoles();
    } catch (err: any) {
      setError(err.message || 'Failed to delete role');
    }
  };

  const startEditRole = (role: RoleItem) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: role.description
    });
    setIsAddingRole(true);
  };

  // Permission Handlers
  const handlePermissionChange = (menuId: number, field: 'can_create' | 'can_read' | 'can_update' | 'can_delete') => {
    setPermissions(prev => prev.map(p => {
      if (p.menu_id === menuId) {
        return {
          ...p,
          [field]: !p[field]
        };
      }
      return p;
    }));
  };

  const handleSavePermissions = async () => {
    if (!selectedRoleUuid) return;
    setError(null);
    setLoading(true);
    try {
      // Map PermissionItem array to payload API structure
      const payload = permissions.map(p => ({
        menu_id: p.menu_id,
        can_create: p.can_create,
        can_read: p.can_read,
        can_update: p.can_update,
        can_delete: p.can_delete
      }));
      await api.updateRolePermissions(selectedRoleUuid, payload);
      showSuccess('Role menu permissions updated successfully');
      fetchPermissions(selectedRoleUuid);
    } catch (err: any) {
      setError(err.message || 'Failed to save permissions');
    } finally {
      setLoading(false);
    }
  };
  const isSelectedRoleAdmin = () => {
    const roleObj = roles.find(r => r.uuid === selectedRoleUuid);
    return roleObj?.name === 'admin' || roleObj?.name === 'superadmin';
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">System Settings</h1>
          <p className="text-slate-550 dark:text-slate-400 text-sm">Manage users, roles, and granular menu permissions</p>
        </div>

        {/* Tab Selection */}
        <div className="bg-slate-100 dark:bg-[#111830]/60 p-1 rounded-md border border-slate-200 dark:border-slate-800 flex self-start shadow-inner">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${activeTab === 'users'
              ? 'bg-whatsapp text-black'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
          >
            <Users className="w-4 h-4" />
            <span>Users</span>
          </button>
          {isSuperAdmin && (
            <>
              <button
                onClick={() => setActiveTab('roles')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${activeTab === 'roles'
                  ? 'bg-whatsapp text-black'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
              >
                <Shield className="w-4 h-4" />
                <span>Roles</span>
              </button>
              <button
                onClick={() => setActiveTab('permissions')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${activeTab === 'permissions'
                  ? 'bg-whatsapp text-black'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
              >
                <CheckSquare className="w-4 h-4" />
                <span>Menu Access</span>
              </button>
            </>
          )}
        </div>
      </div>
      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-whatsapp text-sm flex items-center gap-2">
          <Check className="w-5 h-5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Main Settings Panel */}
      <div className="glass-card card-accent rounded-lg p-6 relative overflow-hidden">

        {/* Tab 1: User Management */}
        {activeTab === 'users' && (isSuperAdmin || isOwner) && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Users</h3>
                <p className="text-xs text-slate-500">Add, edit, or remove user accounts and roles</p>
              </div>
              {canCreateUser && (
                <button
                  onClick={() => {
                    setEditingUser(null);
                    setUserForm({
                      name: '',
                      nickname: '',
                      email: '',
                      password: '',
                      role: isSuperAdmin ? 'owner_subscriber' : 'admin_subscriber',
                      device_ids: [],
                      task_category_uuids: [],
                      phone_number: '',
                      is_notification_enabled: false
                    });
                    setIsAddingUser(true);
                  }}
                  className="flex items-center gap-2 bg-whatsapp hover:bg-emerald-500 text-black px-4 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer glow-green shadow"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add User</span>
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-500 dark:text-slate-400 border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="pb-3">Name</th>
                    <th className="pb-3">Email</th>
                    <th className="pb-3">Role</th>
                    <th className="pb-3">Devices</th>
                    <th className="pb-3">Task Categories</th>
                    <th className="pb-3">Created</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/10 transition-all">
                      <td className="py-4 text-slate-900 dark:text-white font-medium">
                        {u.name} {u.nickname && <span className="text-slate-500 dark:text-slate-400 font-normal text-xs">({u.nickname})</span>}
                      </td>
                      <td className="py-4">
                        <div className="font-mono text-slate-700 dark:text-slate-350">{u.email}</div>
                        {u.phone_number && (
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <span>Phone: +{u.phone_number}</span>
                            {u.is_notification_enabled && (
                              <span className="px-1.5 py-0.5 bg-emerald-500/10 text-whatsapp border border-emerald-500/20 rounded text-[8px] font-bold uppercase tracking-wider scale-90 origin-left">Notif Enabled</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${u.role === 'superadmin'
                          ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                          : u.role === 'owner_subscriber'
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                            : 'bg-emerald-500/10 text-whatsapp border border-emerald-500/20'
                          }`}>
                          {u.role.replace('_', ' ')}
                        </span>                      </td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {u.devices && u.devices.length > 0 ? (
                            u.devices.map(d => (
                              <span key={d.id} className="px-1.5 py-0.5 rounded bg-whatsapp/10 border border-whatsapp/20 text-emerald-600 dark:text-whatsapp text-[10px] font-semibold">
                                {d.device_name}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-slate-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {u.task_categories && u.task_categories.length > 0 ? (
                            u.task_categories.map(c => (
                              <span
                                key={c.uuid}
                                className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                style={{ backgroundColor: `${c.color}20`, border: `1px solid ${c.color}40`, color: c.color }}
                              >
                                {c.name}
                              </span>
                            ))
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-semibold">
                              All Categories
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 text-xs text-slate-500 dark:text-slate-450">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="py-4 text-right flex justify-end gap-2">
                        {canUpdateUser && (
                          <button
                            onClick={() => startEditUser(u)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-305 transition-all cursor-pointer"
                            title="Edit User"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {canDeleteUser && (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="p-1.5 rounded-lg border border-red-200 hover:border-red-500 bg-red-50 hover:bg-red-500 text-red-650 hover:text-white dark:border-red-500/20 dark:bg-red-500/10 dark:hover:bg-red-500 dark:hover:text-white dark:text-red-400 transition-all cursor-pointer"
                            title="Delete User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        No users registered.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Role Management */}
        {activeTab === 'roles' && (isSuperAdmin) && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">System Roles</h3>
                <p className="text-xs text-slate-500">Predefine user roles and access policies</p>
              </div>
              {canCreateRole && (
                <button
                  onClick={() => {
                    setEditingRole(null);
                    setRoleForm({ name: '', description: '' });
                    setIsAddingRole(true);
                  }}
                  className="flex items-center gap-2 bg-whatsapp hover:bg-emerald-500 text-black px-4 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer glow-green shadow"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Role</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-500 dark:text-slate-400 border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="pb-3 w-1/4">Role Name</th>
                    <th className="pb-3 w-1/2">Description</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40">
                  {roles.map((r) => {
                    const isSystem = r.name === 'admin' || r.name === 'user' || r.name === 'superadmin' || r.name === 'owner_subscriber' || r.name === 'admin_subscriber';
                    return (
                      <tr key={r.id} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/10 transition-all">
                        <td className="py-4 text-slate-900 dark:text-white font-medium flex items-center gap-2">
                          <span className="uppercase">{r.name}</span>
                          {isSystem && (
                            <span className="text-[10px] bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-slate-550 dark:text-slate-500 font-semibold uppercase tracking-wider">
                              System
                            </span>
                          )}
                        </td>
                        <td className="py-4 text-slate-700 dark:text-slate-405">{r.description || '-'}</td>
                        <td className="py-4 text-right flex justify-end gap-2">
                          {canUpdateRole && (
                            <button
                              onClick={() => startEditRole(r)}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-305 transition-all cursor-pointer"
                              title="Edit Role"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {!isSystem && canDeleteRole ? (
                            <button
                              onClick={() => handleDeleteRole(r)}
                              className="p-1.5 rounded-lg border border-red-200 hover:border-red-500 bg-red-50 hover:bg-red-500 text-red-650 hover:text-white dark:border-red-500/20 dark:bg-red-500/10 dark:hover:bg-red-500 dark:hover:text-white dark:text-red-400 transition-all cursor-pointer"
                              title="Delete Role"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <div className="w-8 h-8 flex items-center justify-center text-slate-400 dark:text-slate-600" title={isSystem ? "Locked Core Role" : "No Delete Permission"}>
                              <Lock className="w-4 h-4" />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Permissions Config Interface */}
        {activeTab === 'permissions' && isSuperAdmin && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Menu Access Control</h3>
                <p className="text-xs text-slate-500">Configure CRUD operations allowed for each user role</p>
              </div>

              {/* Role Select Dropdown */}
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#0d1426] border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-md shadow-inner">
                <span className="text-xs text-slate-500 uppercase font-semibold">Select Role:</span>
                <select
                  value={selectedRoleUuid || ''}
                  onChange={(e) => setSelectedRoleUuid(e.target.value)}
                  className="bg-transparent text-slate-800 dark:text-white font-medium text-sm border-none focus:outline-none cursor-pointer pr-4 uppercase"
                >
                  {roles.map(r => (
                    <option key={r.uuid} value={r.uuid} className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedRoleUuid && isSelectedRoleAdmin() ? (
              <div className="p-6 rounded-lg bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/20 text-slate-700 dark:text-slate-300 text-sm space-y-2 shadow-sm">
                <div className="flex items-center gap-2 text-indigo-500 dark:text-indigo-400 font-semibold text-base">
                  <Lock className="w-5 h-5" />
                  <span>Admin Permissions are Hardlocked</span>
                </div>
                <p className="text-slate-550 dark:text-slate-400 text-xs">
                  The 'admin' role has absolute permission to bypass authorization middleware across all modules, and its permissions cannot be modified.
                </p>
              </div>
            ) : null}

            {/* Permissions Matrix Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-500 dark:text-slate-400 border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="pb-3 w-1/3">Menu / Resource</th>
                    <th className="pb-3 text-center">Read</th>
                    <th className="pb-3 text-center">Create</th>
                    <th className="pb-3 text-center">Update</th>
                    <th className="pb-3 text-center">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40">
                  {permissions.map((p) => {
                    const disabled = isSelectedRoleAdmin() || loading || !canUpdateRole;
                    return (
                      <tr key={p.menu_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/5 transition-all">
                        <td className="py-4 text-slate-900 dark:text-white font-medium">
                          <div>
                            <p className="text-sm font-semibold">{p.menu_name}</p>
                            <p className="text-xs text-slate-500">/{p.menu_key}</p>
                          </div>
                        </td>
                        <td className="py-4 text-center">
                          <input
                            type="checkbox"
                            checked={p.can_read}
                            disabled={disabled}
                            onChange={() => handlePermissionChange(p.menu_id, 'can_read')}
                            className="w-4 h-4 accent-whatsapp rounded border-slate-350 dark:border-slate-800 bg-white dark:bg-slate-900/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="py-4 text-center">
                          <input
                            type="checkbox"
                            checked={p.can_create}
                            disabled={disabled}
                            onChange={() => handlePermissionChange(p.menu_id, 'can_create')}
                            className="w-4 h-4 accent-whatsapp rounded border-slate-350 dark:border-slate-800 bg-white dark:bg-slate-900/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="py-4 text-center">
                          <input
                            type="checkbox"
                            checked={p.can_update}
                            disabled={disabled}
                            onChange={() => handlePermissionChange(p.menu_id, 'can_update')}
                            className="w-4 h-4 accent-whatsapp rounded border-slate-350 dark:border-slate-800 bg-white dark:bg-slate-900/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="py-4 text-center">
                          <input
                            type="checkbox"
                            checked={p.can_delete}
                            disabled={disabled}
                            onChange={() => handlePermissionChange(p.menu_id, 'can_delete')}
                            className="w-4 h-4 accent-whatsapp rounded border-slate-350 dark:border-slate-800 bg-white dark:bg-slate-900/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Save Button */}
            {!isSelectedRoleAdmin() && canUpdateRole && (
              <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800/40">
                <button
                  onClick={handleSavePermissions}
                  disabled={loading}
                  className="flex items-center gap-2 bg-whatsapp hover:bg-emerald-500 text-black px-6 py-2.5 rounded-md transition-all cursor-pointer text-sm font-semibold glow-green shadow"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Save Permissions</span>
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Add / Edit User Modal */}
      {isAddingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md glass-card rounded-lg p-6 space-y-6 animate-zoom-in max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingUser ? 'Edit User details' : 'Register New User'}
              </h3>
              <button
                onClick={() => {
                  setIsAddingUser(false);
                  setUserForm({ name: '', nickname: '', email: '', password: '', role: 'user', device_ids: [], task_category_uuids: [], phone_number: '', is_notification_enabled: false });
                }}
                className="text-slate-500 hover:text-slate-900 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={editingUser ? handleUpdateUser : handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Name</label>
                <input
                  type="text"
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  placeholder="e.g. John Doe"
                  required
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-650 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Nickname / Alias</label>
                <input
                  type="text"
                  value={userForm.nickname}
                  onChange={(e) => setUserForm({ ...userForm, nickname: e.target.value })}
                  placeholder="e.g. John"
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-650 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Email</label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  placeholder="e.g. john@whatapps.com"
                  required
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-650 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">
                  Password {editingUser ? '(leave blank to keep current)' : ''}
                </label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  placeholder={editingUser ? '••••••••' : 'Enter account password'}
                  required={!editingUser}
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-650 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Phone Number</label>
                <input
                  type="text"
                  value={userForm.phone_number}
                  onChange={(e) => setUserForm({ ...userForm, phone_number: e.target.value })}
                  placeholder="e.g. 628123456789"
                  required={userForm.is_notification_enabled}
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-650 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                />
              </div>

              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="is_notification_enabled"
                  checked={userForm.is_notification_enabled}
                  onChange={(e) => setUserForm({ ...userForm, is_notification_enabled: e.target.checked })}
                  className="w-4 h-4 accent-whatsapp rounded border-slate-350 dark:border-slate-800 bg-white dark:bg-slate-900/50 cursor-pointer"
                />
                <label htmlFor="is_notification_enabled" className="text-slate-700 dark:text-slate-300 text-sm font-semibold cursor-pointer select-none">
                  Enable Task Notification Broadcasts
                </label>
              </div>

              {isSuperAdmin ? (
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Assign Role</label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                    className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] text-slate-800 dark:text-white focus:outline-none focus:border-whatsapp transition-all text-sm cursor-pointer uppercase font-semibold"
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.name} className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Assign Role</label>
                  <input
                    type="text"
                    value="admin_subscriber"
                    disabled
                    className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 focus:outline-none transition-all text-sm cursor-not-allowed uppercase font-semibold"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Assign Devices</label>
                <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md p-3 space-y-2 bg-slate-50/50 dark:bg-slate-900/30">
                  {devicesList.map(dev => (
                    <label key={dev.id} className="flex items-center gap-2 text-slate-705 dark:text-slate-300 text-sm cursor-pointer hover:text-slate-950 dark:hover:text-white transition-all">
                      <input
                        type="checkbox"
                        checked={userForm.device_ids.includes(dev.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setUserForm(prev => ({
                            ...prev,
                            device_ids: checked
                              ? [...prev.device_ids, dev.id]
                              : prev.device_ids.filter(id => id !== dev.id)
                          }));
                        }}
                        className="w-4 h-4 accent-whatsapp rounded border-slate-350 dark:border-slate-800 bg-white dark:bg-slate-900/50 cursor-pointer"
                      />
                      <span>{dev.device_name}</span>
                    </label>
                  ))}
                  {devicesList.length === 0 && (
                    <p className="text-xs text-slate-500 py-2">No devices registered in system.</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Assign Task Categories</label>
                <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md p-3 space-y-2 bg-slate-50/50 dark:bg-slate-900/30">
                  {categoriesList.map(cat => (
                    <label key={cat.uuid} className="flex items-center gap-2 text-slate-705 dark:text-slate-300 text-sm cursor-pointer hover:text-slate-950 dark:hover:text-white transition-all">
                      <input
                        type="checkbox"
                        checked={userForm.task_category_uuids.includes(cat.uuid)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setUserForm(prev => ({
                            ...prev,
                            task_category_uuids: checked
                              ? [...prev.task_category_uuids, cat.uuid]
                              : prev.task_category_uuids.filter(uuid => uuid !== cat.uuid)
                          }));
                        }}
                        className="w-4 h-4 accent-whatsapp rounded border-slate-350 dark:border-slate-800 bg-white dark:bg-slate-900/50 cursor-pointer"
                      />
                      <span
                        className="px-1.5 py-0.5 rounded text-xs font-semibold"
                        style={{ backgroundColor: `${cat.color}20`, border: `1px solid ${cat.color}40`, color: cat.color }}
                      >
                        {cat.name}
                      </span>
                    </label>
                  ))}
                  {categoriesList.length === 0 && (
                    <p className="text-xs text-slate-500 py-2">No task categories registered in system.</p>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">If no categories are assigned, the user will have access to all task categories.</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingUser(false)}
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
                  <span>{editingUser ? 'Save Changes' : 'Register'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Role Modal */}
      {isAddingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md glass-card rounded-lg p-6 space-y-6 animate-zoom-in max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingRole ? 'Edit Role Metadata' : 'Create Custom Role'}
              </h3>
              <button
                onClick={() => setIsAddingRole(false)}
                className="text-slate-500 hover:text-slate-900 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={editingRole ? handleUpdateRole : handleCreateRole} className="space-y-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Role Name</label>
                <input
                  type="text"
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  placeholder="e.g. manager"
                  required
                  disabled={editingRole?.name === 'admin' || editingRole?.name === 'user'}
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-805 dark:text-white placeholder-slate-400 dark:placeholder-slate-650 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed uppercase font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Description</label>
                <textarea
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  placeholder="What permissions does this role generally encapsulate?"
                  className="w-full px-4 py-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-805 dark:text-white placeholder-slate-400 dark:placeholder-slate-650 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm h-24"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingRole(false)}
                  className="w-1/2 py-2.5 rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/40 text-slate-655 dark:text-slate-300 font-semibold text-sm transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-1/2 py-2.5 rounded-md bg-whatsapp hover:bg-emerald-500 text-black font-semibold text-sm transition-all cursor-pointer glow-green flex items-center justify-center gap-1 shadow"
                >
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{editingRole ? 'Save Changes' : 'Create'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
