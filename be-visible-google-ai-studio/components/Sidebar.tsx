import React from 'react';
import {
  LayoutDashboard,
  Link2,
  CreditCard,
  HelpCircle,
  ChevronDown,
  Activity,
  Rocket,
  Shield,
  Building2,
  MapPin,
  UserRound,
  LogOut,
} from 'lucide-react';
import { useAuth } from './AuthContext';

interface SidebarProps {
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
  onSignOut?: () => void;
  brandName?: string;
  brandDomain?: string;
  userBusinessType?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onSignOut, brandName, brandDomain, userBusinessType }) => {
  const isRealEstate = userBusinessType === 'real_estate_israel';
  const { user } = useAuth();

  const handleNavClick = (tabName: string) => {
    if (setActiveTab) setActiveTab(tabName);
  };

  const email = user?.email ?? '';
  const emailPrefix = email.split('@')[0] ?? '';
  const initials = emailPrefix.slice(0, 2).toUpperCase() || '?';
  const displayName = emailPrefix || email;

  return (
    <aside className="w-[232px] bg-white flex flex-col h-full shrink-0 z-20" style={{ borderRight: '1px solid #e8edf4' }}>
      {/* Logo Area */}
      <div className="h-[68px] flex items-center px-5" style={{ borderBottom: '1px solid #e8edf4' }}>
        <img
          src="/be-visible-logo.png"
          alt="be-visible.ai logo"
          className="h-[52px] w-auto"
        />
      </div>

      <div className="flex flex-col flex-1 overflow-y-auto px-3 pt-4 pb-2 gap-5">
        {/* Active Brand Selector */}
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">
            Active Brand
          </p>
          <button className="w-full flex items-center justify-between px-3 py-2.5 bg-white rounded-xl hover:bg-slate-50 transition-smooth" style={{ border: '1px solid #e8edf4' }}>
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#22c55e' }}></span>
              <span className="text-sm font-medium text-slate-700 truncate">{brandName || '—'}</span>
            </span>
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="space-y-0.5 flex-1">
          <NavItem
            icon={<LayoutDashboard size={16} />}
            label="Manage Prompts"
            active={activeTab === 'Manage Prompts'}
            onClick={() => handleNavClick('Manage Prompts')}
          />
          <NavItem
            icon={<Shield size={16} />}
            label="Manage Competitors"
            active={activeTab === 'Manage Competitors'}
            onClick={() => handleNavClick('Manage Competitors')}
          />
          <NavItem
            icon={<UserRound size={16} />}
            label="Personas"
            active={activeTab === 'Personas'}
            onClick={() => handleNavClick('Personas')}
          />
          {isRealEstate && (
            <NavItem
              icon={<Building2 size={16} />}
              label="Projects"
              active={activeTab === 'Projects'}
              onClick={() => handleNavClick('Projects')}
            />
          )}
          {isRealEstate && (
            <NavItem
              icon={<MapPin size={16} />}
              label="Manage Projects"
              active={activeTab === 'Manage Projects'}
              onClick={() => handleNavClick('Manage Projects')}
            />
          )}
          <NavItem
            icon={<Link2 size={16} />}
            label="Integrations"
            active={activeTab === 'Integrations'}
            onClick={() => handleNavClick('Integrations')}
          />
          <NavItem
            icon={<CreditCard size={16} />}
            label="Billing"
            active={activeTab === 'Billing'}
            onClick={() => handleNavClick('Billing')}
          />
          <NavItem
            icon={<HelpCircle size={16} />}
            label="Support"
            active={activeTab === 'Support'}
            onClick={() => handleNavClick('Support')}
          />
          <NavItem
            icon={<Rocket size={16} />}
            label="Getting Started"
            active={activeTab === 'Getting Started'}
            onClick={() => handleNavClick('Getting Started')}
          />
          <NavItem icon={<Activity size={16} />} label="Brands" active={activeTab === 'Brands'} onClick={() => handleNavClick('Brands')} />
        </nav>
      </div>

      {/* User Footer */}
      <div className="px-3 pb-3 pt-2" style={{ borderTop: '1px solid #e8edf4' }}>
        <button
          onClick={() => handleNavClick('User Settings')}
          className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-smooth text-left ${activeTab === 'User Settings' ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm text-white shrink-0"
            style={{ background: activeTab === 'User Settings' ? '#1e1b4b' : 'linear-gradient(135deg, #1e1b4b 0%, #6366f1 100%)' }}
          >
            {initials}
          </div>
          <div className="flex flex-col overflow-hidden min-w-0">
            <span className="text-sm font-semibold text-slate-800 truncate">{displayName}</span>
            <span className="text-[10px] text-slate-400 truncate">{email}</span>
          </div>
        </button>
        {onSignOut && (
          <button
            onClick={onSignOut}
            className="w-full mt-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-smooth"
          >
            <LogOut size={13} />
            Sign Out
          </button>
        )}
      </div>
    </aside>
  );
};

const NavItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-smooth ${
      active
        ? 'bg-brand-brown text-white shadow-sm'
        : 'text-slate-600 hover:bg-indigo-50/70 hover:text-brand-brown'
    }`}
  >
    <span className={`shrink-0 ${active ? 'text-white' : 'text-slate-400'}`}>{icon}</span>
    {label}
  </button>
);
