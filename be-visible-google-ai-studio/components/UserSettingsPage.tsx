import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  User,
  Lock,
  Trash2,
  Save,
  CheckCircle2,
  RefreshCw,
  Eye,
  EyeOff,
  FlaskConical,
  MapPin,
  ChevronDown,
  Globe
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

// ─── Timezone picker (same logic as OnboardingPage) ───────────────────────────

const ALL_TIMEZONES: string[] = (() => {
  try {
    return (Intl as any).supportedValuesOf('timeZone') as string[];
  } catch {
    return ['UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago',
      'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Jerusalem',
      'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
      'Australia/Sydney', 'Pacific/Auckland', 'America/Sao_Paulo', 'Africa/Cairo'];
  }
})();

function getUtcOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(new Date());
    const raw = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT';
    if (raw === 'GMT') return 'UTC+00:00';
    const m = raw.match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (!m) return 'UTC+00:00';
    return `UTC${m[1]}${m[2].padStart(2, '0')}:${(m[3] || '0').padStart(2, '0')}`;
  } catch { return 'UTC+00:00'; }
}

interface TimezonePickerProps { value: string; onChange: (tz: string) => void; }

function TimezonePicker({ value, onChange }: TimezonePickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return ALL_TIMEZONES;
    return ALL_TIMEZONES.filter(tz =>
      tz.toLowerCase().replace(/_/g, ' ').includes(q) ||
      tz.toLowerCase().includes(q.replace(/\s/g, '_'))
    );
  }, [query]);

  const label = (tz: string) => `(${getUtcOffset(tz)}) ${tz.replace(/_/g, ' ')}`;

  return (
    <div ref={containerRef} className="relative">
      <MapPin size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none z-10" />
      <input
        type="text"
        className="w-full px-6 py-4 pl-10 pr-12 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-brand-brown/5 focus:border-brand-brown outline-none font-bold text-slate-700 text-sm transition-all shadow-sm cursor-pointer"
        placeholder="Search timezone..."
        value={open ? query : label(value)}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
      />
      <ChevronDown size={16} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-y-auto" style={{ maxHeight: '224px' }}>
            {filtered.map(tz => (
              <button
                key={tz}
                type="button"
                className={`w-full text-left px-5 py-2.5 text-[13px] transition-colors ${tz === value ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
                onMouseDown={e => { e.preventDefault(); onChange(tz); setOpen(false); setQuery(''); }}
              >
                {label(tz)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface UserSettingsPageProps {
  onNavigateToForensic?: () => void;
  onTimezoneChange?: (tz: string) => void;
}

export const UserSettingsPage: React.FC<UserSettingsPageProps> = ({ onNavigateToForensic, onTimezoneChange }) => {
  const { user, signOut } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [timezone, setTimezone] = useState<string>('UTC');
  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  // Load stored timezone on mount
  useEffect(() => {
    if (!user) return;
    supabase.from('users').select('timezone').eq('id', user.id).single().then(({ data }) => {
      if (data?.timezone) setTimezone(data.timezone);
    });
  }, [user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);

    try {
      // Save timezone
      const { error: tzError } = await supabase
        .from('users')
        .update({ timezone })
        .eq('id', user!.id);

      if (tzError) throw new Error('Failed to save timezone: ' + tzError.message);

      // Change password if filled in
      if (formData.newPassword) {
        if (formData.newPassword !== formData.confirmPassword) {
          throw new Error('Passwords do not match');
        }
        if (formData.newPassword.length < 8) {
          throw new Error('Password must be at least 8 characters');
        }
        const { error: pwError } = await supabase.auth.updateUser({ password: formData.newPassword });
        if (pwError) throw new Error('Failed to update password: ' + pwError.message);
      }

      // Notify parent so Dashboard re-formats dates immediately
      onTimezoneChange?.(timezone);

      setShowSuccess(true);
      setFormData({ newPassword: '', confirmPassword: '' });
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/user/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId: user?.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Deletion failed');
      await signOut();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unknown error');
      setIsDeleting(false);
      setDeleteConfirm(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-20 animate-fadeIn">
      <div className="space-y-6">

        {/* Profile & Security Card */}
        <div className="bg-white rounded-[40px] border border-gray-200 shadow-xl shadow-brand-brown/5 overflow-hidden">
          <div className="p-8 md:p-12">
            <form onSubmit={handleSave} className="space-y-12">

              {/* General Information Section */}
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-brown/5 text-brand-brown flex items-center justify-center">
                      <User size={20} />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase tracking-[0.1em]">General Profile</h3>
                  </div>
                  {onNavigateToForensic && (
                    <button
                      type="button"
                      onClick={onNavigateToForensic}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-all"
                    >
                      <FlaskConical size={13} />
                      Forensic Panel
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      disabled
                      value={user?.email || ''}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-slate-400 text-sm shadow-sm cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-2">
                      <Globe size={12} />
                      Region / Timezone
                    </label>
                    <TimezonePicker value={timezone} onChange={setTimezone} />
                    <p className="text-[11px] text-slate-400 ml-1">
                      Affects how report dates appear in your dashboard
                    </p>
                  </div>
                </div>
              </div>

              {/* Security Section */}
              <div className="space-y-8 pt-8 border-t border-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-brown/5 text-brand-brown flex items-center justify-center">
                    <Lock size={20} />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase tracking-[0.1em]">Security & Password</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">New Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="newPassword"
                        placeholder="Leave blank to keep current"
                        value={formData.newPassword}
                        onChange={handleInputChange}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-brand-brown/5 focus:border-brand-brown outline-none font-bold text-slate-700 text-sm transition-all shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Confirm New Password</label>
                    <input
                      type="password"
                      name="confirmPassword"
                      placeholder="Repeat new password"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-brand-brown/5 focus:border-brand-brown outline-none font-bold text-slate-700 text-sm transition-all shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {showSuccess && (
                    <div className="flex items-center gap-2 text-emerald-600 animate-fadeIn">
                      <CheckCircle2 size={18} />
                      <span className="text-xs font-black uppercase tracking-widest">Changes Saved</span>
                    </div>
                  )}
                  {saveError && (
                    <p className="text-xs font-bold text-rose-500">{saveError}</p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={isSaving}
                  className={`px-12 py-4 bg-brand-brown text-white font-black uppercase tracking-[0.25em] rounded-2xl shadow-2xl shadow-brand-brown/20 hover:scale-[1.02] active:scale-95 transition-all text-xs flex items-center justify-center gap-3 ${isSaving ? 'opacity-80 cursor-not-allowed' : ''}`}
                >
                  {isSaving ? (
                    <RefreshCw size={20} className="animate-spin" />
                  ) : (
                    <>
                      <Save size={18} /> Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Account Deletion Section */}
        <div className="bg-white rounded-[40px] border border-rose-100 shadow-xl shadow-rose-500/5 overflow-hidden">
          <div className="p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-2 text-center md:text-left">
              <p className="text-sm text-slate-500 font-medium max-w-md">
                Deleting your account is permanent. This will remove all your prompts, history, and brand data.
              </p>
            </div>

            <div className="shrink-0 flex flex-col items-center md:items-end gap-3">
              {deleteConfirm && !isDeleting && (
                <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest animate-pulse">
                  Are you absolutely sure?
                </span>
              )}
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all border-2 ${
                  deleteConfirm
                    ? 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700'
                    : 'text-rose-500 border-rose-100 hover:border-rose-500 hover:bg-rose-50'
                } ${isDeleting ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isDeleting ? (
                  <RefreshCw size={18} className="animate-spin" />
                ) : (
                  <Trash2 size={18} />
                )}
                {isDeleting ? 'Deleting...' : deleteConfirm ? 'Confirm Account Deletion' : 'Delete My Account'}
              </button>
              {deleteConfirm && !isDeleting && (
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:underline"
                >
                  Cancel
                </button>
              )}
              {deleteError && (
                <p className="text-[11px] font-bold text-rose-600 max-w-xs text-center md:text-right">
                  {deleteError}
                </p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
