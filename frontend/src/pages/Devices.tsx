import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../services/api';
import QRScanner from '../components/qr-scanner';
import { Smartphone, Plus, Key, Link2, RefreshCw, X, ShieldAlert } from 'lucide-react';

export default function Devices() {
  const { devices, setDevices, addDevice, user, permissions } = useStore();
  const isAdmin = user?.role === 'admin';
  const devicesPerm = permissions?.find(p => p.key === 'devices');
  const canCreate = isAdmin || !!devicesPerm?.can_create;
  // const canDelete = isAdmin || !!devicesPerm?.can_delete;

  const [isAdding, setIsAdding] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [activeQRDevice, setActiveQRDevice] = useState<{ id: number, uuid: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = async () => {
    setLoading(true);
    setError(null);
    try {
      const devList = await api.listDevices();
      setDevices(devList);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceName.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const newDev = await api.createDevice(deviceName);
      addDevice(newDev);
      setDeviceName('');
      setIsAdding(false);

      // Auto open QR Scanner for the new device
      setActiveQRDevice({ id: newDev.id, uuid: newDev.uuid });
    } catch (err: any) {
      setError(err.message || 'Failed to create device');
    } finally {
      setLoading(false);
    }
  };

  // const handleDeleteDevice = async (device: any) => {
  //   if (!confirm('Are you sure you want to delete this device? This will unlink and clean all local session data.')) {
  //     return;
  //   }
  // 
  //   setLoading(true);
  //   setError(null);
  //   try {
  //     await api.deleteDevice(device.uuid);
  //     removeDevice(device.id);
  //   } catch (err: any) {
  //     setError(err.message || 'Failed to delete device');
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Device Management</h1>
          <p className="text-slate-550 dark:text-slate-400 text-sm">Register and connect WhatsApp active instances</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-whatsapp hover:bg-emerald-500 text-black px-4 py-2.5 rounded-xl transition-all cursor-pointer text-sm font-semibold glow-green"
          >
            <Plus className="w-4 h-4" />
            <span>Add Device</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 text-sm flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid of Devices */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {devices.map((device) => {
          const isConnected = device.status === 'CONNECTED';
          return (
            <div
              key={device.id}
              className={`glass-card rounded-2xl p-6 flex flex-col justify-between space-y-6 relative overflow-hidden ${isConnected ? 'glow-green border-whatsapp/20' : ''
                }`}
            >
              {/* Device Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/30 ${isConnected ? 'text-whatsapp' : 'text-slate-400 dark:text-slate-500'}`}>
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white text-base">{device.device_name}</h3>
                    <p className="text-xs text-slate-500">Registered {new Date(device.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                {/* <div className="flex gap-1">
                  {canDelete && (
                    <button
                      onClick={() => handleDeleteDevice(device)}
                      className="p-2 rounded-lg bg-red-50/15 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 hover:text-white hover:bg-red-500 transition-all cursor-pointer"
                      title="Delete Device"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div> */}
              </div>

              {/* Status and Phone info */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Link Status</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-medium ${isConnected
                      ? 'bg-whatsapp/15 text-whatsapp'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                  >
                    {device.status}
                  </span>
                </div>
                {device.phone && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">WhatsApp Number</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">+{device.phone}</span>
                  </div>
                )}
                {device.jid && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">JID</span>
                    <span className="font-mono text-slate-550 dark:text-slate-500 truncate max-w-[150px]">{device.jid}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-150 dark:border-slate-800/60">
                {!isConnected ? (
                  <button
                    onClick={() => setActiveQRDevice({ id: device.id, uuid: device.uuid })}
                    className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/40 dark:hover:bg-slate-800 border border-slate-250 dark:border-slate-700/60 text-slate-800 dark:text-white py-2.5 rounded-xl transition-all cursor-pointer text-sm font-semibold"
                  >
                    <Link2 className="w-4 h-4" />
                    <span>Scan Pairing QR</span>
                  </button>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-whatsapp text-xs font-semibold py-2.5 bg-whatsapp/5 rounded-xl border border-whatsapp/10">
                    <Key className="w-4 h-4" />
                    <span>Device Fully Linked</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {devices.length === 0 && !loading && (
          <div className="col-span-full py-16 flex flex-col items-center justify-center text-center space-y-4 glass rounded-2xl border border-slate-200 dark:border-slate-800">
            <Smartphone className="w-12 h-12 text-slate-400 dark:text-slate-600 animate-pulse" />
            <div className="max-w-xs space-y-1">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white">No devices registered</h3>
              <p className="text-xs text-slate-500">Add a device name to start connecting and sending WhatsApp notifications.</p>
            </div>
            {canCreate && (
              <button
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1e293b]/60 dark:hover:bg-[#1e293b] border border-slate-250 dark:border-slate-700 text-slate-800 dark:text-slate-200 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create first device</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add Device Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md glass-card rounded-2xl p-6 space-y-6 animate-zoom-in">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Register New Device</h3>
              <button
                onClick={() => setIsAdding(false)}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddDevice} className="space-y-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Device Name</label>
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g. Finance Billing Server"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-300 font-semibold text-sm transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-1/2 py-2.5 rounded-xl bg-whatsapp hover:bg-emerald-500 text-black font-semibold text-sm transition-all cursor-pointer glow-green flex items-center justify-center gap-1 shadow"
                >
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>Register</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      {activeQRDevice !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm glass-card rounded-2xl animate-zoom-in">
            <QRScanner
              deviceId={activeQRDevice.id}
              deviceUuid={activeQRDevice.uuid}
              onClose={() => {
                setActiveQRDevice(null);
                fetchDevices(); // Refresh list to get new connection state
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
