import React, { useState } from 'react';
import { 
  User, 
  Mail, 
  Lock, 
  Trash2, 
  Save, 
  CheckCircle2, 
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';

export const UserSettingsPage: React.FC = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [formData, setFormData] = useState({
    name: 'Tomer S.',
    email: 'tomer@incredibuild.com',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsSaving(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1500);
  };

  const handleDeleteAccount = () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    alert("Account deletion request initiated.");
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
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-brown/5 text-brand-brown flex items-center justify-center">
                    <User size={20} />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase tracking-[0.1em]">General Profile</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-2">
                      Full Name
                    </label>
                    <input 
                      type="text" 
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleInputChange}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-brand-brown/5 focus:border-brand-brown outline-none font-bold text-slate-700 text-sm transition-all shadow-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-2">
                      Email Address
                    </label>
                    <input 
                      type="email" 
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-brand-brown/5 focus:border-brand-brown outline-none font-bold text-slate-700 text-sm transition-all shadow-sm"
                    />
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

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Current Password</label>
                    <div className="relative">
                      <input 
                        type={showPassword ? "text" : "password"}
                        name="currentPassword"
                        placeholder="••••••••"
                        value={formData.currentPassword}
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">New Password</label>
                      <input 
                        type="password"
                        name="newPassword"
                        placeholder="Min 8 characters"
                        value={formData.newPassword}
                        onChange={handleInputChange}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-brand-brown/5 focus:border-brand-brown outline-none font-bold text-slate-700 text-sm transition-all shadow-sm"
                      />
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
                      <Save size={18} /> Save All Changes
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
              {deleteConfirm && (
                <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest animate-pulse">
                  Are you absolutely sure?
                </span>
              )}
              <button 
                onClick={handleDeleteAccount}
                className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all border-2 ${
                  deleteConfirm 
                    ? 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700' 
                    : 'text-rose-500 border-rose-100 hover:border-rose-500 hover:bg-rose-50'
                }`}
              >
                <Trash2 size={18} />
                {deleteConfirm ? 'Confirm Account Deletion' : 'Delete My Account'}
              </button>
              {deleteConfirm && (
                <button 
                  onClick={() => setDeleteConfirm(false)}
                  className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:underline"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};