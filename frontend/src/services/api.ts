import { useStore } from '../store/useStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

let _refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const currentToken = useStore.getState().token;
  if (!currentToken) return false;

  if (!_refreshPromise) {
    _refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${currentToken}` },
    })
      .then(async (r) => {
        if (!r.ok) return false;
        const data = await r.json();
        if (!data?.token || !data?.user) return false;
        if (!useStore.getState().token) return false;
        useStore.getState().setAuth(data.token, data.user);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        _refreshPromise = null;
      });
  }

  return _refreshPromise;
}

async function request<T>(path: string, options: RequestInit = {}, _isRetry = false): Promise<T> {
  const token = useStore.getState().token;
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) {
      if (!_isRetry) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          return request<T>(path, options, true);
        }
      }
      window.dispatchEvent(new CustomEvent('api-401'));
      throw new Error('Session expired. Please log in again.');
    }
    if (response.status === 403) {
      window.dispatchEvent(new CustomEvent('api-403'));
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Auth
  register: (data: any) => request<any>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: any) => request<any>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),

  // Devices
  listDevices: () => request<any[]>('/api/devices'),
  createDevice: (name: string) => request<any>('/api/devices', { method: 'POST', body: JSON.stringify({ device_name: name }) }),
  deleteDevice: (uuid: string) => request<any>(`/api/devices/${uuid}`, { method: 'DELETE' }),
  getDevice: (uuid: string) => request<any>(`/api/devices/${uuid}`),

  // Messages
  sendMessage: (data: { 
    device_id: number; 
    phone: string; 
    message: string; 
    task_id?: number; 
    message_type?: string; 
    media_url?: string; 
    file_name?: string; 
  }) => request<any>('/api/messages/send', { method: 'POST', body: JSON.stringify(data) }),
  uploadFile: (formData: FormData) => 
    request<{ url: string; file_name: string; message_type: 'image' | 'document' }>('/api/messages/upload', { 
      method: 'POST', 
      body: formData 
    }),
  listMessages: (deviceId?: number) => 
    request<any[]>(`/api/messages${deviceId ? `?device_id=${deviceId}` : ''}`),

  // Contacts
  listContacts: (search?: string, group?: string, page: number = 1, limit: number = 20) => {
    const params = new URLSearchParams();
    if (search) params.append('q', search);
    if (group) params.append('group', group);
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    const query = params.toString();
    return request<any>(`/api/contacts?${query}`);
  },
  listContactGroups: () => request<string[]>('/api/contacts/groups'),
  createContact: (data: { name: string; phone: string; group?: string; device_id?: number | null }) => 
    request<any>('/api/contacts', { method: 'POST', body: JSON.stringify(data) }),
  updateContact: (uuid: string, data: { name: string; phone: string; group?: string; device_id?: number | null }) => 
    request<any>(`/api/contacts/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteContact: (uuid: string) => 
    request<any>(`/api/contacts/${uuid}`, { method: 'DELETE' }),
  importWhatsAppContacts: (data: { device_id: number; group?: string }) => 
    request<any>('/api/contacts/import', { method: 'POST', body: JSON.stringify(data) }),
  listUnsavedSenders: (page: number = 1, limit: number = 20) => 
    request<any>(`/api/contacts/unsaved?page=${page}&limit=${limit}`),

  // Auto Replies
  listAutoReplies: (deviceId?: number) => 
    request<any[]>(`/api/auto-replies${deviceId ? `?device_id=${deviceId}` : ''}`),
  createAutoReply: (data: { device_id: number; keyword: string; match_type: string; reply_message: string; is_active?: boolean; create_task?: boolean; task_category_uuid?: string }) => 
    request<any>('/api/auto-replies', { method: 'POST', body: JSON.stringify(data) }),
  updateAutoReply: (uuid: string, data: { keyword?: string; match_type?: string; reply_message?: string; is_active?: boolean; create_task?: boolean; task_category_uuid?: string }) => 
    request<any>(`/api/auto-replies/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAutoReply: (uuid: string) => 
    request<any>(`/api/auto-replies/${uuid}`, { method: 'DELETE' }),

  // Tasks
  listTasks: (
    status?: string,
    deviceId?: number,
    page: number = 1,
    limit: number = 20,
    categoryUuid?: string,
    updatedBy?: string,
    unassigned?: boolean,
    startDate?: string,
    endDate?: string,
    sort?: string,
    order?: string,
    q?: string
  ) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (deviceId) params.append('device_id', deviceId.toString());
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (categoryUuid) params.append('category_uuid', categoryUuid);
    if (updatedBy) params.append('updated_by', updatedBy);
    if (unassigned !== undefined) params.append('unassigned', unassigned.toString());
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (sort) params.append('sort', sort);
    if (order) params.append('order', order);
    if (q) params.append('q', q);
    return request<any>(`/api/tasks?${params.toString()}`);
  },
  getTask: (uuid: string) => request<any>(`/api/tasks/${uuid}`),
  updateTask: (uuid: string, data: { status?: string; category_uuid?: string | null; description?: string; pic_user_id?: string | null }) =>
    request<any>(`/api/tasks/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
  listAssignees: () => request<any[]>('/api/tasks/assignees'),

  // Task Categories
  listTaskCategories: () => request<any[]>('/api/task-categories'),
  createTaskCategory: (data: { name: string; description?: string; color?: string }) =>
    request<any>('/api/task-categories', { method: 'POST', body: JSON.stringify(data) }),
  updateTaskCategory: (uuid: string, data: { name?: string; description?: string; color?: string }) =>
    request<any>(`/api/task-categories/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTaskCategory: (uuid: string) =>
    request<any>(`/api/task-categories/${uuid}`, { method: 'DELETE' }),

  // Stats
  getQueueStats: () => request<any>('/api/stats/queue'),
  getTaskStats: (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    const query = params.toString();
    return request<any>(`/api/stats/tasks${query ? `?${query}` : ''}`);
  },

  // User Management
  listUsers: () => request<any[]>('/api/users'),
  getUser: (uuid: string) => request<any>(`/api/users/${uuid}`),
  createUser: (data: any) => request<any>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (uuid: string, data: any) => request<any>(`/api/users/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (uuid: string) => request<any>(`/api/users/${uuid}`, { method: 'DELETE' }),

  // Role Management
  listRoles: () => request<any[]>('/api/roles'),
  getRole: (uuid: string) => request<any>(`/api/roles/${uuid}`),
  createRole: (data: any) => request<any>('/api/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRole: (uuid: string, data: any) => request<any>(`/api/roles/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRole: (uuid: string) => request<any>(`/api/roles/${uuid}`, { method: 'DELETE' }),
  getRolePermissions: (roleUuid: string) => request<any[]>(`/api/roles/${roleUuid}/permissions`),
  updateRolePermissions: (roleUuid: string, permissions: any[]) => 
    request<any>(`/api/roles/${roleUuid}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) }),

  // Menu & Permissions
  listMenus: () => request<any[]>('/api/menus'),
  getCurrentUserPermissions: () => request<any[]>('/api/auth/me/permissions'),

  // Token refresh
  refreshToken: () => tryRefreshToken(),
};

export function getTokenExpiryUnix(token: string): number | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

// WebSocket connection helper
export function connectDeviceWS(
  deviceUuid: string, 
  onEvent: (type: string, data: any) => void
): WebSocket {
  const token = useStore.getState().token || '';
  const ws = new WebSocket(`${WS_URL}/devices/${deviceUuid}/ws?token=${token}`);

  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type && payload.data) {
        onEvent(payload.type, payload.data);
      } else {
        onEvent('message', payload);
      }
    } catch (err) {
      logError('Failed to parse WS payload', err);
    }
  };

  ws.onerror = (err) => {
    logError('WebSocket connection error:', err);
  };

  ws.onclose = () => {
    logInfo(`WebSocket closed for device ${deviceUuid}`);
  };

  return ws;
}

function logInfo(msg: string) {
  console.log(`[WS Info] ${msg}`);
}

function logError(msg: string, err: any) {
  console.error(`[WS Error] ${msg}`, err);
}
