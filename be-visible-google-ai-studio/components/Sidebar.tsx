import React from 'react';
import {
  LayoutDashboard,
  Eye,
  BarChart2,
  Link2,
  MessageSquare,
  Zap,
  SlidersHorizontal,
  Shield,
  UserRound,
  Tag,
  Building2,
  MapPin,
  Plug,
  CreditCard,
  Rocket,
  HelpCircle,
  ChevronDown,
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

const SidebarSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1 mt-1">{title}</p>
    <div className="space-y-0.5">{children}</div>
  </div>
);

const NavItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-smooth ${
      active
        ? 'bg-brand-brown text-white shadow-sm'
        : 'text-slate-600 hover:bg-indigo-50/70 hover:text-brand-brown'
    }`}
  >
    <span className={`shrink-0 ${active ? 'text-white' : 'text-slate-400'}`}>{icon}</span>
    {label}
  </button>
);

const Divider = () => <div className="h-px bg-slate-100 my-2" />;

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onSignOut, brandName, brandDomain, userBusinessType }) => {
  const isRealEstate = userBusinessType === 'real_estate_israel';
  const { user } = useAuth();

  const nav = (tab: string) => { if (setActiveTab) setActiveTab(tab); };

  const email = user?.email ?? '';
  const emailPrefix = email.split('@')[0] ?? '';
  const initials = emailPrefix.slice(0, 2).toUpperCase() || '?';
  const displayName = emailPrefix || email;

  return (
    <aside className="w-[220px] bg-white flex flex-col h-full shrink-0 z-20" style={{ borderRight: '1px solid #e8edf4' }}>

      {/* Logo */}
      <div className="h-[62px] flex items-center px-5 shrink-0" style={{ borderBottom: '1px solid #e8edf4' }}>
        <img src="/be-visible-logo.png" alt="be-visible.ai logo" className="h-[48px] w-auto" />
      </div>

      {/* Scrollable nav area */}
      <div className="flex flex-col flex-1 overflow-y-auto px-3 pt-3 pb-2 gap-3">

        {/* Active Brand */}
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-2">Active Brand</p>
          <button className="w-full flex items-center justify-between px-3 py-2 bg-white rounded-xl hover:bg-slate-50 transition-smooth" style={{ border: '1px solid #e8edf4' }}>
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#22c55e' }} />
              <span className="text-sm font-medium text-slate-700 truncate">{brandName || '—'}</span>
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
          </button>
        </div>

        <Divider />

        {/* Overview */}
        <SidebarSection title="Overview">
          <NavItem icon={<LayoutDashboard size={15} />} label="Overview" active={activeTab === 'Overview'} onClick={() => nav('Overview')} />
        </SidebarSection>

        <Divider />

        {/* Reports */}
        <SidebarSection title="Reports">
          <NavItem icon={<Eye size={15} />}           label="Visibility"   active={activeTab === 'Visibility'}   onClick={() => nav('Visibility')} />
          <NavItem icon={<BarChart2 size={15} />}     label="Competitors"  active={activeTab === 'Competitors'}  onClick={() => nav('Competitors')} />
          <NavItem icon={<Link2 size={15} />}         label="Citations"    active={activeTab === 'Citations'}    onClick={() => nav('Citations')} />
          <NavItem icon={<MessageSquare size={15} />} label="Prompts"      active={activeTab === 'Prompts'}      onClick={() => nav('Prompts')} />
          <NavItem icon={<Zap size={15} />}           label="Improve"      active={activeTab === 'Improve'}      onClick={() => nav('Improve')} />
        </SidebarSection>

        <Divider />

        {/* Setup */}
        <SidebarSection title="Setup">
          <NavItem icon={<SlidersHorizontal size={15} />} label="Manage Prompts"      active={activeTab === 'Manage Prompts'}      onClick={() => nav('Manage Prompts')} />
          <NavItem icon={<Shield size={15} />}            label="Manage Competitors"  active={activeTab === 'Manage Competitors'}  onClick={() => nav('Manage Competitors')} />
          <NavItem icon={<UserRound size={15} />}         label="Personas"            active={activeTab === 'Personas'}            onClick={() => nav('Personas')} />
          <NavItem icon={<Tag size={15} />}               label="Brands"              active={activeTab === 'Brands'}              onClick={() => nav('Brands')} />
          {isRealEstate && (
            <NavItem icon={<Building2 size={15} />} label="Projects"        active={activeTab === 'Projects'}        onClick={() => nav('Projects')} />
          )}
          {isRealEstate && (
            <NavItem icon={<MapPin size={15} />}    label="Manage Projects" active={activeTab === 'Manage Projects'} onClick={() => nav('Manage Projects')} />
          )}
        </SidebarSection>

        <Divider />

        {/* Account & System */}
        <SidebarSection title="Account & System">
          <NavItem icon={<Plug size={15} />}       label="Integrations" active={activeTab === 'Integrations'} onClick={() => nav('Integrations')} />
          <NavItem icon={<CreditCard size={15} />} label="Billing"      active={activeTab === 'Billing'}      onClick={() => nav('Billing')} />
        </SidebarSection>

        <Divider />

        {/* Help */}
        <SidebarSection title="Help">
          <NavItem icon={<Rocket size={15} />}    label="Getting Started" active={activeTab === 'Getting Started'} onClick={() => nav('Getting Started')} />
          <NavItem icon={<HelpCircle size={15} />} label="Support"        active={activeTab === 'Support'}        onClick={() => nav('Support')} />
        </SidebarSection>

      </div>

      {/* User footer */}
      <div className="px-3 pb-3 pt-2 shrink-0" style={{ borderTop: '1px solid #e8edf4' }}>
        <button
          onClick={() => nav('User Settings')}
          className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl transition-smooth text-left ${activeTab === 'User Settings' ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
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
            className="w-full mt-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-smooth"
          >
            <LogOut size={13} />
            Sign Out
          </button>
        )}
      </div>
    </aside>
  );
};
