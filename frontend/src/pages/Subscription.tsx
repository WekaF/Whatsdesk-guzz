import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../services/api';
import { 
  Smartphone, Send, Bot, Check, 
  Clock, AlertCircle, CreditCard, RefreshCw, Users 
} from 'lucide-react';

export default function Subscription() {
  const { user, updateUser, devices } = useStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [autoRepliesCount, setAutoRepliesCount] = useState(0);
  const [teamMembersCount, setTeamMembersCount] = useState(0);

  // Load auto replies to get current rule usage and list users to get team size
  useEffect(() => {
    const fetchAutoReplies = async () => {
      try {
        const rules = await api.listAutoReplies();
        setAutoRepliesCount(rules.length);
      } catch (err) {
        console.error('Failed to load auto replies count:', err);
      }
    };
    const fetchTeam = async () => {
      try {
        const data = await api.listUsers();
        const count = data.filter((u: any) => u.id !== user?.id).length;
        setTeamMembersCount(count);
      } catch (err) {
        console.error('Failed to load team members:', err);
      }
    };

    fetchAutoReplies();
    if (user?.role === 'owner_subscriber' || user?.role === 'superadmin') {
      fetchTeam();
    }
  }, [user]);

  const currentTier = user?.subscription_tier?.toLowerCase() || 'free';

  const tierLimits = {
    free: { maxDevices: 1, maxMessages: 200, maxRules: 3, maxUsers: 1, name: 'Free', hasAPI: false, hasWebhooks: false },
    lite: { maxDevices: 1, maxMessages: 5000, maxRules: 20, maxUsers: 2, name: 'Lite', hasAPI: true, hasWebhooks: false },
    regular: { maxDevices: 3, maxMessages: 50000, maxRules: 999999, maxUsers: 5, name: 'Regular', hasAPI: true, hasWebhooks: true },
    pro: { maxDevices: 10, maxMessages: 500000, maxRules: 999999, maxUsers: 999999, name: 'Pro', hasAPI: true, hasWebhooks: true },
  };

  const currentLimits = tierLimits[currentTier as keyof typeof tierLimits] || tierLimits.free;

  const pricingTiers = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      description: 'Ideal untuk mencoba WhatsApp Gateway & CRM dasar.',
      features: [
        '1 Perangkat Aktif',
        '200 Pesan Keluar / bulan',
        'Max 3 Aturan Auto-Reply',
        'Akses CRM Tugas Dasar',
        'Tanpa Akses API & Webhook',
        'Dukungan Komunitas',
      ],
      color: 'from-slate-500 to-slate-700',
      glow: 'glow-slate',
    },
    {
      id: 'lite',
      name: 'Lite',
      price: 150000,
      description: 'Cocok untuk bisnis kecil & operasional tim mandiri.',
      features: [
        '1 Perangkat Aktif',
        '5.000 Pesan Keluar / bulan',
        'Max 20 Aturan Auto-Reply',
        'Max 2 Anggota Tim (PIC)',
        'Akses Basic API Key',
        'Tanpa Akses Webhook',
        'Dukungan Email 24 Jam',
      ],
      color: 'from-emerald-400 to-emerald-600',
      glow: 'glow-green',
    },
    {
      id: 'regular',
      name: 'Regular',
      price: 350000,
      description: 'Pilihan terbaik untuk tim marketing & CS profesional.',
      features: [
        '3 Perangkat Aktif',
        '50.000 Pesan Keluar / bulan',
        'Unlimited Auto-Reply',
        'Max 5 Anggota Tim (PIC)',
        'Full API Key & Webhook',
        'Prioritas Antrean Pesan',
        'Dukungan WA & Email 24/7',
      ],
      color: 'from-indigo-500 to-purple-600',
      glow: 'glow-blue',
      isPopular: true,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 750000,
      description: 'Solusi terlengkap dengan volume pesan super besar.',
      features: [
        '10 Perangkat Aktif',
        'FUP 500.000 Pesan / bulan',
        'Unlimited Auto-Reply',
        'Unlimited Anggota Tim (PIC)',
        'Full API Key & Webhook',
        'Dedicated Server Gateway',
        'Manager Akun Khusus (VIP)',
      ],
      color: 'from-amber-500 to-orange-600',
      glow: 'glow-amber',
    },
  ];

  const handleUpgrade = async (tierId: string) => {
    if (!user?.uuid) return;
    if (tierId === currentTier) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await api.createCheckout(tierId);
      const snapToken = res.snap_token;

      // @ts-ignore
      if (window.snap) {
        // @ts-ignore
        window.snap.pay(snapToken, {
          onSuccess: async function () {
            setSuccess(`Pembayaran berhasil! Memproses aktivasi paket ${tierId.toUpperCase()}...`);
            // Wait slightly for webhook to propagate, then fetch profile
            setTimeout(async () => {
              try {
                const updatedUser = await api.getUser(user.uuid);
                updateUser(updatedUser);
                setSuccess(`Paket ${tierId.toUpperCase()} Anda telah aktif!`);
                setTimeout(() => setSuccess(null), 5000);
              } catch (err) {
                console.error(err);
              }
            }, 2500);
          },
          onPending: function () {
            setSuccess('Menunggu pembayaran Anda. Silakan selesaikan instruksi pembayaran.');
            setTimeout(() => setSuccess(null), 8000);
          },
          onError: function () {
            setError('Pembayaran gagal atau dibatalkan.');
          },
          onClose: function () {
            console.log('Payment popup closed by user');
          }
        });
      } else {
        // Fallback to direct redirect URL if Snap JS SDK is not loaded
        window.location.href = res.redirect_url;
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memproses transaksi langganan.');
    } finally {
      setLoading(false);
    }
  };

  // Usage percentages
  const devicesUsed = devices.length;
  const devicesMax = currentLimits.maxDevices;
  const devicesPercent = Math.min((devicesUsed / devicesMax) * 100, 100);

  const messagesUsed = user?.monthly_message_sent || 0;
  const messagesMax = currentLimits.maxMessages;
  const messagesPercent = Math.min((messagesUsed / messagesMax) * 100, 100);

  const rulesUsed = autoRepliesCount;
  const rulesMax = currentLimits.maxRules;
  const rulesPercent = rulesMax === 999999 ? 0 : Math.min((rulesUsed / rulesMax) * 100, 100);

  const teamMembersMax = currentLimits.maxUsers - 1;
  const teamMembersPercent = teamMembersMax <= 0 ? 0 : Math.min((teamMembersCount / teamMembersMax) * 100, 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Subscription & Limits</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Monitor usage and upgrade your subscription plan</p>
      </div>

      {/* Alert Notifications */}
      {error && (
        <div className="p-4 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2 animate-fade-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-whatsapp text-sm flex items-center gap-2 animate-fade-in">
          <Check className="w-5 h-5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Usage Overview Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Device Quota Card */}
        <div className="glass-card rounded-lg p-5 border border-slate-200 dark:border-slate-800/80 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[160px]">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-[10px] font-extrabold uppercase tracking-wider">Device Limits</span>
              <Smartphone className="w-4.5 h-4.5 text-blue-500" />
            </div>
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {devicesUsed} <span className="text-sm font-normal text-slate-400">/ {devicesMax} Devices</span>
            </p>
          </div>
          <div className="space-y-2 mt-4">
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${devicesPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>{devicesPercent.toFixed(0)}% Used</span>
              <span>Max allowed by {currentLimits.name} plan</span>
            </div>
          </div>
        </div>

        {/* Message Usage Card */}
        <div className="glass-card rounded-lg p-5 border border-slate-200 dark:border-slate-800/80 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[160px]">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-[10px] font-extrabold uppercase tracking-wider">Monthly Message Quota</span>
              <Send className="w-4.5 h-4.5 text-emerald-500" />
            </div>
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {messagesUsed.toLocaleString()} <span className="text-sm font-normal text-slate-400">/ {messagesMax === 500000 ? '500k (FUP)' : messagesMax.toLocaleString()} Messages</span>
            </p>
          </div>
          <div className="space-y-2 mt-4">
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${messagesPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>{messagesPercent.toFixed(0)}% Used</span>
              <span className="flex items-center gap-1 font-semibold">
                <Clock className="w-3 h-3" />
                Resets on: {user?.message_reset_at ? new Date(user.message_reset_at).toLocaleDateString() : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* Auto Reply Rules Card */}
        <div className="glass-card rounded-lg p-5 border border-slate-200 dark:border-slate-800/80 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[160px]">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-[10px] font-extrabold uppercase tracking-wider">Auto-Reply Rule Limits</span>
              <Bot className="w-4.5 h-4.5 text-purple-500" />
            </div>
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {rulesUsed} <span className="text-sm font-normal text-slate-400">/ {rulesMax === 999999 ? 'Unlimited' : `${rulesMax} Rules`}</span>
            </p>
          </div>
          <div className="space-y-2 mt-4">
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${rulesMax === 999999 ? 'bg-indigo-500' : 'bg-purple-500'}`}
                style={{ width: `${rulesMax === 999999 ? 100 : rulesPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>{rulesMax === 999999 ? 'Unlimited Access' : `${rulesPercent.toFixed(0)}% Used`}</span>
              <span>Keyword rules active</span>
            </div>
          </div>
        </div>

        {/* Team Members Card */}
        <div className="glass-card rounded-lg p-5 border border-slate-200 dark:border-slate-800/80 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[160px]">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-[10px] font-extrabold uppercase tracking-wider">Team Member Limits</span>
              <Users className="w-4.5 h-4.5 text-amber-500" />
            </div>
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {teamMembersCount} <span className="text-sm font-normal text-slate-400">/ {teamMembersMax === 999998 ? 'Unlimited' : `${teamMembersMax} Members`}</span>
            </p>
          </div>
          <div className="space-y-2 mt-4">
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 bg-amber-500`}
                style={{ width: `${teamMembersMax === 999998 ? 100 : teamMembersPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>{teamMembersMax === 999998 ? 'Unlimited Access' : `${teamMembersPercent.toFixed(0)}% Used`}</span>
              <span>Sub-accounts active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Plans Selection Panel */}
      <div className="glass-card rounded-xl border border-slate-200 dark:border-slate-800/80 p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200/60 dark:border-slate-800/60 pb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Upgrade or Change Plan</h3>
            <p className="text-xs text-slate-500">Pick the best plan that aligns with your business operations. Upgrades take effect immediately.</p>
          </div>
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/50 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700/40 text-[11px] font-semibold">
            <CreditCard className="w-4.5 h-4.5 text-slate-500" />
            <span>Simulated Subscription System</span>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {pricingTiers.map((tier) => {
            const isActive = tier.id === currentTier;
            return (
              <div 
                key={tier.id}
                className={`relative p-5 rounded-xl border flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 ${
                  isActive
                    ? 'border-whatsapp bg-whatsapp/5 dark:bg-emerald-950/10 shadow-lg ring-1 ring-whatsapp/30'
                    : tier.isPopular
                    ? 'border-indigo-500 bg-indigo-500/5 dark:bg-indigo-950/10 shadow-md ring-1 ring-indigo-500/15'
                    : 'border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-[#0a1020]'
                }`}
              >
                {isActive && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-whatsapp text-black text-[9px] font-black tracking-wider uppercase px-2.5 py-1 rounded-full shadow-sm">
                    Current Plan
                  </div>
                )}
                {tier.isPopular && !isActive && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[9px] font-black tracking-wider uppercase px-2.5 py-1 rounded-full shadow-sm">
                    Best Value
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-1">
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight">{tier.name}</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed min-h-[32px]">
                      {tier.description}
                    </p>
                  </div>

                  <div className="py-1">
                    {tier.price === 0 ? (
                      <div className="text-2xl font-black text-slate-900 dark:text-white">Free</div>
                    ) : (
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-xs font-bold text-slate-400">Rp</span>
                        <span className="text-2xl font-black text-slate-900 dark:text-white">
                          {tier.price.toLocaleString('id-ID')}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400">/bln</span>
                      </div>
                    )}
                  </div>

                  <ul className="space-y-2 border-t border-slate-100 dark:border-slate-800/40 pt-4 text-xs">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-slate-650 dark:text-slate-350">
                        <Check className="w-3.5 h-3.5 text-whatsapp flex-shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-5 mt-5 border-t border-slate-100 dark:border-slate-800/30">
                  <button
                    disabled={isActive || loading}
                    onClick={() => handleUpgrade(tier.id)}
                    className={`w-full py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      isActive
                        ? 'bg-whatsapp/15 text-whatsapp border border-whatsapp/30 cursor-default'
                        : loading
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                        : tier.isPopular
                        ? 'bg-indigo-500 hover:bg-indigo-600 text-white shadow shadow-indigo-500/15'
                        : 'bg-slate-950 hover:bg-slate-900 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-950 shadow'
                    }`}
                  >
                    {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{isActive ? 'Active Plan' : 'Select Plan'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
