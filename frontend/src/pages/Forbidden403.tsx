import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';

export default function Forbidden403() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full glass-card card-accent-red rounded-lg p-8 text-center space-y-6 relative overflow-hidden border border-red-500/20 shadow-[0_0_50px_rgba(239,68,68,0.05)]">
        
        {/* Glowing Ambient Background Effect */}
        <div className="absolute -top-20 -left-20 w-40 h-40 rounded-full bg-red-500/10 blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-20 -right-20 w-40 h-40 rounded-full bg-red-500/10 blur-3xl pointer-events-none"></div>

        {/* Icon Header */}
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.1)]">
            <ShieldAlert className="w-16 h-16" />
          </div>
        </div>

        {/* Error Info */}
        <div className="space-y-2 relative z-10">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">403</h2>
          <h3 className="text-lg font-semibold text-red-400 uppercase tracking-wider">Akses Ditolak</h3>
          <p className="text-slate-550 dark:text-slate-400 text-sm leading-relaxed">
            Maaf, Anda tidak memiliki izin atau hak akses yang cukup untuk membuka halaman/fitur ini. 
            Silakan hubungi administrator sistem untuk pengaturan akses lebih lanjut.
          </p>
        </div>
 
        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4 relative z-10">
          <button
            onClick={() => window.history.back()}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-655 dark:text-slate-300 font-semibold text-sm transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali</span>
          </button>
          
          <button
            onClick={() => navigate('/')}
            className="flex items-center justify-center gap-2 bg-whatsapp hover:bg-emerald-500 text-black px-5 py-2.5 rounded-md font-semibold text-sm transition-all cursor-pointer glow-green shadow"
          >
            <Home className="w-4 h-4" />
            <span>Ke Dashboard</span>
          </button>
        </div>

      </div>
    </div>
  );
}
