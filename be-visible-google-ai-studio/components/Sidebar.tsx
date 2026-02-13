import React from 'react';
import { 
  LayoutDashboard, 
  Link2, 
  CreditCard, 
  HelpCircle, 
  ChevronDown,
  Activity,
  Rocket,
  Shield
} from 'lucide-react';

interface SidebarProps {
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
  onSignOut?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onSignOut }) => {
  const handleNavClick = (tabName: string) => {
    if (setActiveTab) {
      setActiveTab(tabName);
    }
  };

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col h-full shrink-0 z-20">
      {/* Logo Area */}
      <div className="h-20 flex items-center px-6 border-b border-gray-100">
        <img 
          src="https://i.ibb.co/4wxqhcJv/image-20.png" 
          alt="be-visible.ai logo" 
          className="h-14 w-auto" 
        />
      </div>

      <div className="p-5 space-y-6 flex-1 overflow-y-auto">
        {/* Active Brand Selector */}
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2.5 block px-1">
            Active Brand
          </label>
          <button className="w-full flex items-center justify-between px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors shadow-sm text-sm font-medium text-slate-700">
            <span className="flex items-center gap-2">
               <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
               Incredibuild
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Unified Navigation */}
        <nav className="space-y-1.5">
          <NavItem 
            icon={<LayoutDashboard size={18} />} 
            label="Manage Prompts" 
            active={activeTab === 'Manage Prompts'} 
            onClick={() => handleNavClick('Manage Prompts')}
          />
          <NavItem 
            icon={<Shield size={18} />} 
            label="Manage Competitors" 
            active={activeTab === 'Manage Competitors'} 
            onClick={() => handleNavClick('Manage Competitors')}
          />
          <NavItem 
            icon={<Link2 size={18} />} 
            label="Integrations" 
            active={activeTab === 'Integrations'} 
            onClick={() => handleNavClick('Integrations')}
          />
          <NavItem 
            icon={<CreditCard size={18} />} 
            label="Billing" 
            active={activeTab === 'Billing'}
            onClick={() => handleNavClick('Billing')}
          />
          <NavItem 
            icon={<HelpCircle size={18} />} 
            label="Support" 
            active={activeTab === 'Support'}
            onClick={() => handleNavClick('Support')}
          />
          
          <button 
            onClick={() => handleNavClick('Getting Started')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'Getting Started'
                ? 'bg-brand-brown text-white shadow-sm'
                : 'text-slate-600 hover:bg-gray-50 hover:text-brand-brown'
            }`}
          >
            <span className={activeTab === 'Getting Started' ? 'text-white' : 'text-gray-400'}>
              <Rocket size={18} />
            </span>
            Getting Started
          </button>

          <NavItem icon={<Activity size={18} />} label="Brands" />
        </nav>
      </div>

      {/* User Footer */}
      <div className="p-5 border-t border-gray-100 space-y-2">
        <button
          onClick={() => handleNavClick('User Settings')}
          className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all hover:bg-gray-50 text-left ${activeTab === 'User Settings' ? 'bg-slate-50 ring-1 ring-brand-brown/10' : ''}`}
        >
          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-medium text-sm transition-colors ${activeTab === 'User Settings' ? 'bg-brand-brown text-white' : 'bg-gray-100 text-slate-600'}`}>
            TS
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-semibold text-brand-brown truncate">Tomer</span>
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Premium Account</span>
          </div>
        </button>
        {onSignOut && (
          <button
            onClick={onSignOut}
            className="w-full text-xs text-slate-400 hover:text-red-500 transition-colors py-1"
          >
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
    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      active
        ? 'bg-brand-brown text-white shadow-sm'
        : 'text-slate-600 hover:bg-gray-50 hover:text-brand-brown'
    }`}
  >
    <span className={active ? 'text-white' : 'text-gray-400'}>{icon}</span>
    {label}
  </button>
);