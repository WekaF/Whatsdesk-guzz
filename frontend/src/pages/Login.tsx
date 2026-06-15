import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { api } from '../services/api';
import { KeyRound, Mail, User, MessageCircle, ArrowRight } from 'lucide-react';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useStore((state) => state.setAuth);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await api.register({ name, email, password });
        // After register, login automatically
        const data = await api.login({ email, password });
        setAuth(data.token, data.user);
        navigate('/');
      } else {
        const data = await api.login({ email, password });
        setAuth(data.token, data.user);
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b19] flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-300">
      {/* Background Gradients */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-whatsapp/5 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md">
        {/* App Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-whatsapp flex items-center justify-center glow-green mb-4">
            <MessageCircle className="w-8 h-8 text-slate-950 dark:text-slate-950" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-wider">WHAT DEKS</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-2">Scalable WhatsApp Multi-Device Gateway</p>
        </div>

        {/* Form Card */}
        <div className="glass-card rounded-2xl p-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
            {isRegister ? 'Create Account' : 'Welcome Back'}
          </h2>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-slate-700 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-3 h-5 w-5 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="John Doe"
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/30 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-slate-700 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-3 h-5 w-5 text-slate-400 dark:text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="name@company.com"
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/30 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <KeyRound className="absolute left-4 top-3 h-5 w-5 text-slate-400 dark:text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/30 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-whatsapp focus:ring-1 focus:ring-whatsapp transition-all text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-whatsapp hover:bg-emerald-500 text-slate-950 font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all glow-green cursor-pointer disabled:opacity-50"
            >
              <span>{loading ? 'Please wait...' : isRegister ? 'Register' : 'Sign In'}</span>
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>

          {/* Toggle Switch */}
          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
              className="text-whatsapp hover:underline text-sm font-medium"
            >
              {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
