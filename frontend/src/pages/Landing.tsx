import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { 
  TabletSmartphone, Bot, ClipboardList, KeyRound, 
  Check, ArrowRight, Sparkles, MessageCircle, 
  ChevronDown
} from 'lucide-react';

export default function Landing() {
  const token = useStore((state) => state.token);
  const [isAnnual, setIsAnnual] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  const pricingTiers = [
    {
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
      cta: 'Mulai Sekarang',
      link: '/login',
      isPopular: false,
      color: 'from-slate-500 to-slate-700',
    },
    {
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
      cta: 'Pilih Lite',
      link: '/login',
      isPopular: false,
      color: 'from-emerald-400 to-emerald-600',
    },
    {
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
      cta: 'Coba Regular',
      link: '/login',
      isPopular: true,
      color: 'from-indigo-500 to-purple-600',
    },
    {
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
      cta: 'Pilih Pro',
      link: '/login',
      isPopular: false,
      color: 'from-amber-500 to-orange-600',
    },
  ];

  const faqs = [
    {
      q: 'Bagaimana cara menghubungkan WhatsApp saya ke WhatsDesk?',
      a: 'Sangat mudah! Anda hanya perlu masuk ke dashboard, masuk ke menu Devices, klik Add Device, lalu scan QR Code yang muncul menggunakan menu Perangkat Tertaut (Linked Devices) pada aplikasi WhatsApp di handphone Anda.'
    },
    {
      q: 'Apakah WhatsDesk aman bagi nomor WhatsApp saya?',
      a: 'WhatsDesk menggunakan protokol standar WebSocket WhatsApp Web resmi. Namun untuk menghindari pemblokiran (banned), harap patuhi kebijakan WhatsApp dan hindari pengiriman spam masal yang melanggar ketentuan layanan.'
    },
    {
      q: 'Bagaimana sistem penghitungan limit kuota bulanan?',
      a: 'Kuota pesan bulanan Anda akan direset otomatis setiap tanggal pendaftaran akun Anda setiap bulannya. Jika kuota Anda habis, Anda dapat melakukan top-up kuota atau melakukan upgrade tier langganan.'
    },
    {
      q: 'Apakah saya bisa membatalkan langganan kapan saja?',
      a: 'Tentu saja. Tidak ada ikatan kontrak jangka panjang. Anda dapat membatalkan atau mengubah paket langganan Anda kapan saja langsung dari menu penagihan di dashboard.'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060a14] text-slate-800 dark:text-[#e2e8f0] font-sans selection:bg-emerald-500 selection:text-white transition-colors duration-300">
      
      {/* Premium Header / Navigation */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/70 dark:bg-[#060a14]/70 border-b border-slate-200 dark:border-slate-800/60 transition-colors">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-md bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white shadow-md badge-glow-green">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight title-tracking">WhatsDesk.</span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <a href="#features" className="hover:text-emerald-500 transition-colors">Fitur Utama</a>
            <a href="#pricing" className="hover:text-emerald-500 transition-colors">Paket & Harga</a>
            <a href="#faq" className="hover:text-emerald-500 transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-4">
            {token ? (
              <Link 
                to="/dashboard" 
                className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-4 py-2 rounded-md text-sm font-bold shadow-md hover:scale-102 transition-all cursor-pointer"
              >
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-500 transition-colors">
                  Sign In
                </Link>
                <Link 
                  to="/login" 
                  className="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 rounded-md text-sm font-bold shadow-md hover:scale-102 transition-all cursor-pointer"
                >
                  Mulai Free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-16 pb-20 md:py-32 overflow-hidden bg-grid-pattern">
        {/* Glow ambient background details */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/10 dark:bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none z-0" />
        <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] bg-indigo-500/10 dark:bg-indigo-500/5 blur-[100px] rounded-full pointer-events-none z-0" />

        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-500/20 shadow-sm animate-pulse-slow">
            <Sparkles className="w-3.5 h-3.5" />
            WhatsApp CRM & Gateway SaaS Terpadu
          </div>

          <h1 className="text-4xl md:text-6xl font-black text-slate-950 dark:text-white tracking-tight leading-tight max-w-4xl mx-auto">
            Kelola WhatsApp Bisnis & Integrasikan <span className="bg-gradient-to-r from-emerald-400 via-teal-500 to-indigo-500 bg-clip-text text-transparent">API Tanpa Batas</span>
          </h1>

          <p className="text-base md:text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-medium">
            Hubungkan banyak nomor perangkat, otomatisasi pesan balasan, kelola delegasi tugas tim CS, serta integrasikan REST API & Webhook dalam satu dasbor premium.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link 
              to="/login" 
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg text-base font-bold shadow-lg hover:shadow-emerald-500/20 hover:scale-102 transition-all flex items-center justify-center gap-2"
            >
              Mulai Uji Coba Gratis <ArrowRight className="w-5 h-5" />
            </Link>
            <a 
              href="#pricing" 
              className="w-full sm:w-auto px-8 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-700 rounded-lg text-base font-bold transition-all flex items-center justify-center gap-2"
            >
              Lihat Detail Paket
            </a>
          </div>

          {/* Interactive UI Mockup Showcase */}
          <div className="pt-12 max-w-5xl mx-auto animate-slide-up">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white/50 dark:bg-[#0a1020]/60 p-3 shadow-2xl backdrop-blur-md">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-[#080d19] overflow-hidden aspect-[16/9] flex flex-col relative">
                {/* Mock Browser Header */}
                <div className="h-10 border-b border-slate-200 dark:border-slate-800/60 bg-slate-50 dark:bg-[#0b1122] px-4 flex items-center justify-between">
                  <div className="flex gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-400/80" />
                    <span className="w-3 h-3 rounded-full bg-amber-400/80" />
                    <span className="w-3 h-3 rounded-full bg-emerald-400/80" />
                  </div>
                  <div className="px-10 py-1 bg-slate-100 dark:bg-slate-800/60 rounded text-[10px] text-slate-400 max-w-xs truncate">
                    whatsdesk.abdulkhafit.biz.id/dashboard
                  </div>
                  <div className="w-12" />
                </div>
                
                {/* Mock Application Interface */}
                <div className="flex-1 flex bg-slate-50 dark:bg-[#060a14] select-none text-left">
                  {/* Left Sidebar Mock */}
                  <div className="w-40 border-r border-slate-200 dark:border-slate-800/60 bg-white dark:bg-[#0a1020]/80 p-3 space-y-3">
                    <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded-md w-2/3" />
                    <div className="space-y-1.5 pt-2">
                      <div className="h-7 bg-emerald-500/10 rounded-md flex items-center px-2 gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="h-3 bg-emerald-500/30 rounded w-16" />
                      </div>
                      <div className="h-7 rounded-md flex items-center px-2 gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700" />
                        <span className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-12" />
                      </div>
                      <div className="h-7 rounded-md flex items-center px-2 gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700" />
                        <span className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-20" />
                      </div>
                    </div>
                  </div>
                  {/* Dashboard Content Mock */}
                  <div className="flex-1 p-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="h-4 bg-slate-300 dark:bg-slate-700 rounded w-24" />
                        <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-32" />
                      </div>
                      <div className="h-6 bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 rounded-full px-2.5 py-0.5 text-[9px] font-bold">
                        Regular Tier Active
                      </div>
                    </div>
                    {/* Stats Card Grid */}
                    <div className="grid grid-cols-3 gap-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0a1020] space-y-2 card-accent">
                          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-16" />
                          <div className="h-6 bg-slate-300 dark:bg-slate-700 rounded w-8" />
                        </div>
                      ))}
                    </div>
                    {/* Bottom Split Layout */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0a1020] space-y-3">
                        <div className="h-3.5 bg-slate-300 dark:bg-slate-700 rounded w-20" />
                        <div className="space-y-2">
                          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-4/5" />
                        </div>
                      </div>
                      <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0a1020] space-y-3">
                        <div className="h-3.5 bg-slate-300 dark:bg-slate-700 rounded w-24" />
                        <div className="space-y-2">
                          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features Section */}
      <section id="features" className="py-20 bg-white dark:bg-[#080d1a] border-y border-slate-200 dark:border-slate-800/40 relative">
        <div className="max-w-7xl mx-auto px-6 space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-sm font-bold text-emerald-500 uppercase tracking-widest">Fitur Unggulan</h2>
            <h3 className="text-3xl font-black text-slate-950 dark:text-white tracking-tight leading-tight">
              Satu Dasbor untuk Seluruh Layanan WhatsApp Bisnis Anda
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Lupakan berganti-ganti aplikasi. Dari gateway API developer hingga delegasi tugas layanan pelanggan (CRM), semua terintegrasi secara efisien.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0a1020]/40 flex flex-col space-y-4 hover:border-emerald-500/30 transition-all card-accent">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <TabletSmartphone className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-lg text-slate-900 dark:text-white title-tracking">Multi-Device Gateway</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Hubungkan dan monitor banyak nomor WhatsApp dalam satu waktu dengan scanning kode QR yang sangat cepat dan stabil.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0a1020]/40 flex flex-col space-y-4 hover:border-indigo-500/30 transition-all card-accent card-accent-indigo">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                <Bot className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-lg text-slate-900 dark:text-white title-tracking">Otomatisasi Auto-Reply</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Buat aturan kata kunci pesan balasan instan (EXACT, CONTAINS, START_WITH) untuk melayani pembeli secara non-stop 24 jam.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0a1020]/40 flex flex-col space-y-4 hover:border-amber-500/30 transition-all card-accent card-accent-amber">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                <ClipboardList className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-lg text-slate-900 dark:text-white title-tracking">Tugas & Tiket CRM</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Ubah chat masuk menjadi tugas tiket support secara otomatis, delegasikan ke PIC, dan lacak progres log aktivitasnya.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0a1020]/40 flex flex-col space-y-4 hover:border-red-500/30 transition-all card-accent card-accent-red">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                <KeyRound className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-lg text-slate-900 dark:text-white title-tracking">API & Webhooks</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Integrasikan sistem server backend Anda sendiri melalui API key dan terima data chat masuk secara real-time via webhook.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section (Tiers) */}
      <section id="pricing" className="py-20 bg-slate-50/50 dark:bg-[#060a14] relative overflow-hidden">
        {/* Glow ambient */}
        <div className="absolute bottom-10 left-10 w-[300px] h-[300px] bg-indigo-500/10 dark:bg-indigo-500/5 blur-[90px] rounded-full pointer-events-none z-0" />
        
        <div className="max-w-7xl mx-auto px-6 space-y-12 relative z-10">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-sm font-bold text-emerald-500 uppercase tracking-widest">Paket Layanan</h2>
            <h3 className="text-3xl font-black text-slate-950 dark:text-white tracking-tight leading-tight">
              Pilih Paket Langganan Terbaik Anda
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Mulai dengan paket Free untuk mencoba fitur utama kami, lalu tingkatkan kapasitas tim Anda kapan saja sesuai kebutuhan pertumbuhan bisnis.
            </p>

            {/* Toggle Annual/Monthly */}
            <div className="flex items-center justify-center gap-3 pt-4">
              <span className={`text-xs font-semibold ${!isAnnual ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>Bulanan</span>
              <button 
                onClick={() => setIsAnnual(!isAnnual)}
                className="w-12 h-6.5 rounded-full bg-slate-200 dark:bg-slate-800 p-0.7 flex items-center cursor-pointer transition-all"
              >
                <div className={`w-5 h-5 rounded-full bg-emerald-500 shadow-sm transition-transform duration-200 ${isAnnual ? 'translate-x-5.5' : ''}`} />
              </button>
              <span className={`text-xs font-semibold flex items-center gap-1.5 ${isAnnual ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                Tahunan 
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] rounded-full font-bold">Hemat 20%</span>
              </span>
            </div>
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {pricingTiers.map((tier) => {
              const displayPrice = isAnnual ? tier.price * 0.8 : tier.price;
              return (
                <div 
                  key={tier.name} 
                  className={`relative p-6 rounded-2xl border bg-white dark:bg-[#0a1020] flex flex-col justify-between hover-scale-up ${
                    tier.isPopular 
                      ? 'border-emerald-500 shadow-xl dark:shadow-emerald-500/5 ring-1 ring-emerald-500/30' 
                      : 'border-slate-200 dark:border-slate-800/80 shadow-sm'
                  }`}
                >
                  {tier.isPopular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[10px] font-black tracking-wider uppercase px-3.5 py-1.5 rounded-full shadow-md">
                      Paling Populer
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h4 className="text-xl font-bold text-slate-950 dark:text-white title-tracking">{tier.name}</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed min-h-[32px]">{tier.description}</p>
                    </div>

                    <div className="py-2">
                      {tier.price === 0 ? (
                        <div className="text-3xl font-black text-slate-950 dark:text-white">Gratis</div>
                      ) : (
                        <div className="flex items-baseline gap-1">
                          <span className="text-xs font-bold text-slate-400">Rp</span>
                          <span className="text-3xl font-black text-slate-950 dark:text-white">
                            {(displayPrice).toLocaleString('id-ID')}
                          </span>
                          <span className="text-xs font-semibold text-slate-400">/bln</span>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-800/50 pt-4">
                      <ul className="space-y-2.5">
                        {tier.features.map((f, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-350 leading-tight">
                            <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="pt-6">
                    <Link 
                      to={tier.link}
                      className={`w-full py-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        tier.isPopular 
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-650 text-white shadow-md' 
                          : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-slate-900 dark:text-white border border-transparent dark:border-slate-700/50'
                      }`}
                    >
                      {tier.cta} <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 bg-white dark:bg-[#080d1a] border-t border-slate-200 dark:border-slate-800/40">
        <div className="max-w-4xl mx-auto px-6 space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-sm font-bold text-emerald-500 uppercase tracking-widest">Pertanyaan Umum</h2>
            <h3 className="text-3xl font-black text-slate-950 dark:text-white tracking-tight">
              Pertanyaan yang Sering Diajukan
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Ada pertanyaan lain? Silakan hubungi tim dukungan kami kapan saja.
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div 
                key={index} 
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0a1020]/30 overflow-hidden transition-all"
              >
                <button 
                  onClick={() => toggleFaq(index)}
                  className="w-full p-5 flex items-center justify-between text-left font-bold text-sm md:text-base text-slate-950 dark:text-white hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${activeFaq === index ? 'rotate-180' : ''}`} />
                </button>
                {activeFaq === index && (
                  <div className="px-5 pb-5 pt-1 text-xs md:text-sm text-slate-500 dark:text-slate-450 border-t border-slate-100 dark:border-slate-850/50 leading-relaxed animate-fade-in">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="py-20 bg-gradient-to-br from-slate-900 via-[#0a1020] to-[#060a14] text-white border-t border-slate-800/60 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none" />
        
        <div className="max-w-4xl mx-auto px-6 text-center space-y-6 relative z-10">
          <h3 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
            Siap Mengoptimalkan Operasional WhatsApp Bisnis Anda?
          </h3>
          <p className="text-sm md:text-base text-slate-400 max-w-xl mx-auto">
            Mulailah hari ini dengan paket Free. Butuh waktu kurang dari 2 menit untuk menghubungkan perangkat WhatsApp Anda.
          </p>
          <div className="pt-4">
            <Link 
              to="/login" 
              className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white px-8 py-4 rounded-lg font-bold shadow-lg hover:shadow-emerald-500/20 hover:scale-102 transition-all cursor-pointer"
            >
              Mulai Sekarang Gratis <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-slate-100 dark:bg-[#04070f] text-slate-400 border-t border-slate-200 dark:border-slate-800/40 text-xs md:text-sm transition-colors">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-black shadow-sm">
              W
            </div>
            <span className="font-bold text-slate-900 dark:text-white title-tracking">WhatsDesk.</span>
          </div>

          <p className="text-slate-400 text-xs text-center">
            &copy; {new Date().getFullYear()} WhatsDesk Inc. Hak Cipta Dilindungi Undang-Undang.
          </p>

          <div className="flex gap-6 text-xs font-semibold text-slate-450">
            <a href="#features" className="hover:text-emerald-500 transition-colors">Fitur</a>
            <a href="#pricing" className="hover:text-emerald-500 transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-emerald-500 transition-colors">FAQ</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
