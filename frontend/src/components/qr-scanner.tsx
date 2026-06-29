import { useEffect, useState } from 'react';
import { connectDeviceWS } from '../services/api';
import { useStore } from '../store/useStore';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface QRScannerProps {
  deviceId: number;
  deviceUuid: string;
  onClose: () => void;
}

export default function QRScanner({ deviceId, deviceUuid, onClose }: QRScannerProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('CONNECTING');
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const updateDeviceStatus = useStore((state) => state.updateDeviceStatus);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let isActive = true;

    try {
      ws = connectDeviceWS(deviceUuid, (type, data) => {
        if (!isActive) return;

        if (type === 'qr_code') {
          setQrCode(data.qr);
          setStatus('SCANNING');
        } else if (type === 'status_update') {
          setStatus(data.status);
          if (data.phone) {
            setPhone(data.phone);
          }
          // Sync with Zustand store
          updateDeviceStatus(deviceId, data.status, data.phone);
          
          if (data.status === 'CONNECTED') {
            setQrCode(null);
          }
        } else if (type === 'error') {
          setError(data.error || 'An error occurred during pairing.');
          setStatus('FAILED');
        }
      });
    } catch (err: any) {
      setError(err.message || 'Failed to connect to device channel.');
      setStatus('FAILED');
    }

    return () => {
      isActive = false;
      if (ws) {
        ws.close();
      }
    };
  }, [deviceId, updateDeviceStatus]);

  return (
    <div className="flex flex-col items-center justify-center p-6 space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-white">Link Device via QR Code</h3>
        <p className="text-slate-400 text-xs mt-1">Scan the QR code below using WhatsApp Link Devices</p>
      </div>

      <div className="w-64 h-64 relative flex items-center justify-center bg-slate-950/80 rounded-lg border border-slate-800 shadow-inner overflow-hidden">
        {status === 'CONNECTING' && (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-whatsapp animate-spin" />
            <span className="text-xs text-slate-400">Initializing pairing session...</span>
          </div>
        )}

        {status === 'SCANNING' && qrCode && (
          <div className="bg-white p-3 rounded-lg animate-fade-in shadow-xl">
            <img
              src={qrCode}
              alt="WhatsApp Pairing QR Code"
              className="w-48 h-48 block"
            />
          </div>
        )}

        {status === 'CONNECTED' && (
          <div className="flex flex-col items-center gap-3 text-center p-4">
            <div className="p-3 rounded-full bg-whatsapp/10 border border-whatsapp/20 text-whatsapp animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <span className="text-sm font-semibold text-white">Device Connected!</span>
            {phone && <span className="text-xs font-mono text-whatsapp">+{phone}</span>}
          </div>
        )}

        {status === 'FAILED' && (
          <div className="flex flex-col items-center gap-3 text-center p-4">
            <div className="p-3 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
              <AlertCircle className="w-10 h-10" />
            </div>
            <span className="text-sm font-semibold text-white">Pairing Failed</span>
            {error && <p className="text-xs text-slate-400">{error}</p>}
          </div>
        )}

        {status === 'DISCONNECTED' && (
          <div className="flex flex-col items-center gap-2 text-center p-4">
            <RefreshCw className="w-8 h-8 text-slate-500 animate-spin" />
            <span className="text-xs text-slate-400">QR Code expired or session disconnected. Please retry.</span>
          </div>
        )}
      </div>

      <div className="flex gap-3 w-full">
        {status === 'CONNECTED' ? (
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-md bg-whatsapp hover:bg-whatsapp-dark text-black font-semibold text-sm transition-all cursor-pointer glow-green text-center"
          >
            Done
          </button>
        ) : (
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-md border border-slate-800 hover:bg-slate-800/40 text-slate-300 font-medium text-sm transition-all cursor-pointer text-center"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
