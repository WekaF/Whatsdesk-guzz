import { create } from 'zustand';
import { persist } from 'zustand/middleware';
interface User {
  id: number;
  uuid: string;
  name: string;
  nickname?: string;
  email: string;
  role: string;
  parent_id?: number;
  phone_number?: string;
  is_notification_enabled?: boolean;
  subscription_tier?: string;
  subscription_ends_at?: string;
  monthly_message_sent?: number;
  message_reset_at?: string;
}
interface Device {
  id: number;
  uuid: string;
  device_name: string;
  phone: string;
  status: string;
  jid: string;
  created_at: string;
}

export interface UserPermission {
  id: number;
  name: string;
  key: string;
  path: string;
  icon: string;
  sort_order: number;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
}

interface AppState {
  token: string | null;
  user: User | null;
  theme: 'light' | 'dark' | 'system';
  devices: Device[];
  selectedDeviceId: number | null;
  permissions: UserPermission[];
  setAuth: (token: string, user: User) => void;
  updateUser: (user: Partial<User>) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  logout: () => void;
  setDevices: (devices: Device[]) => void;
  addDevice: (device: Device) => void;
  removeDevice: (id: number) => void;
  updateDeviceStatus: (id: number, status: string, phone?: string) => void;
  setSelectedDeviceId: (id: number | null) => void;
  setPermissions: (permissions: UserPermission[]) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      theme: 'dark', // default to dark
      devices: [],
      selectedDeviceId: null,
      permissions: [],

      setAuth: (token, user) => set({ token, user }),
      updateUser: (userUpdates) => set((state) => ({
        user: state.user ? { ...state.user, ...userUpdates } : null
      })),
      setTheme: (theme) => set({ theme }),
      logout: () => set({ token: null, user: null, devices: [], selectedDeviceId: null, permissions: [] }),
      setDevices: (devices) => set({ devices }),
      addDevice: (device) => set((state) => ({ devices: [...state.devices, device] })),
      removeDevice: (id) =>
         set((state) => ({
           devices: state.devices.filter((d) => d.id !== id),
           selectedDeviceId: state.selectedDeviceId === id ? null : state.selectedDeviceId,
         })),
      updateDeviceStatus: (id, status, phone) =>
         set((state) => ({
           devices: state.devices.map((d) =>
             d.id === id ? { ...d, status, phone: phone || d.phone } : d
           ),
         })),
      setSelectedDeviceId: (id) => set({ selectedDeviceId: id }),
      setPermissions: (permissions) => set({ permissions }),
    }),
    {
      name: 'whatapps-storage',
      partialize: (state) => ({ token: state.token, user: state.user, theme: state.theme }),
    }
  )
);
