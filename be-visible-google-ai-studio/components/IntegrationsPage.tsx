
import React, { useState } from 'react';
import { 
  ExternalLink, 
  HelpCircle, 
  AlertTriangle, 
  ThumbsUp, 
  Plus, 
  ChevronRight,
  Search,
  BarChart2,
  PieChart,
  Layout,
  Table as TableIcon,
  Zap,
  RefreshCw,
  Mail,
  Cpu
} from 'lucide-react';

interface IntegrationCardProps {
  name: string;
  description: string;
  logo: string;
  status?: 'active' | 'upcoming';
  votes?: number;
  onVote?: () => void;
  isVoted?: boolean;
}

const IntegrationCard: React.FC<IntegrationCardProps> = ({ 
  name, 
  description, 
  logo, 
  status = 'upcoming', 
  votes = 0, 
  onVote,
  isVoted 
}) => {
  const brandTerracotta = '#874B34';
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:border-slate-300 hover:shadow-md transition-all p-6 flex flex-col group h-full">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-center shrink-0 p-2 overflow-hidden">
          <img src={logo} alt={`${name} logo`} className="w-full h-full object-contain" />
        </div>
        {status === 'upcoming' && (
          <span className="px-2.5 py-1 bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest rounded-full">
            Coming soon
          </span>
        )}
      </div>
      
      <div className="flex-1 space-y-1">
        <h4 className="text-base font-bold text-slate-900 tracking-tight">{name}</h4>
        <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-2">
          {description}
        </p>
      </div>
      
      <div className="mt-6 flex items-center justify-between">
        {status === 'upcoming' ? (
          <>
            <button 
              onClick={onVote}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                isVoted 
                  ? 'bg-orange-50 text-orange-600 border border-orange-100' 
                  : 'bg-gray-50 text-slate-400 border border-gray-100 hover:border-orange-200 hover:text-orange-500'
              }`}
            >
              <ThumbsUp size={12} fill={isVoted ? 'currentColor' : 'none'} />
              {votes} {votes === 1 ? 'vote' : 'votes'}
            </button>
            <button className="text-[10px] font-black text-slate-300 uppercase tracking-widest cursor-not-allowed">
              Connect
            </button>
          </>
        ) : (
          <button className="w-full bg-brand-brown text-white py-2 px-4 rounded-lg text-xs font-bold shadow-lg hover:shadow-brand-brown/20 hover:-translate-y-0.5 transition-all">
            Connect
          </button>
        )}
      </div>
    </div>
  );
};

export const IntegrationsPage: React.FC = () => {
  const brandTerracotta = '#874B34';
  const brandBrown = '#2C1308';
  
  const [votes, setVotes] = useState<Record<string, number>>({
    'Looker': 4,
    'Power BI': 1,
    'Tableau': 0,
    'Google Sheets': 3,
    'SISTRIX': 0,
    'Seobility': 1,
    'Similarweb': 0,
    'Zapier': 2,
    'Make': 1
  });

  const [votedItems, setVotedItems] = useState<Set<string>>(new Set());

  const handleVote = (name: string) => {
    if (votedItems.has(name)) return;
    setVotes(prev => ({ ...prev, [name]: prev[name] + 1 }));
    setVotedItems(prev => {
      const next = new Set(prev);
      next.add(name);
      return next;
    });
  };

  const logos = {
    gsc: "https://www.google.com/s2/favicons?domain=search.google.com&sz=128",
    ga4: "https://www.google.com/s2/favicons?domain=analytics.google.com&sz=128",
    looker: "https://www.google.com/s2/favicons?domain=looker.com&sz=128",
    powerbi: "https://www.google.com/s2/favicons?domain=powerbi.microsoft.com&sz=128",
    tableau: "https://www.google.com/s2/favicons?domain=tableau.com&sz=128",
    sheets: "https://www.google.com/s2/favicons?domain=google.com/sheets&sz=128",
    sistrix: "https://www.google.com/s2/favicons?domain=sistrix.com&sz=128",
    seobility: "https://www.google.com/s2/favicons?domain=seobility.net&sz=128",
    similarweb: "https://www.google.com/s2/favicons?domain=similarweb.com&sz=128",
    zapier: "https://www.google.com/s2/favicons?domain=zapier.com&sz=128",
    make: "https://www.google.com/s2/favicons?domain=make.com&sz=128"
  };

  return (
    <div className="space-y-10 pb-20 animate-fadeIn">
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Available Integrations</h2>
        <button className="flex items-center gap-2 text-xs font-black text-slate-400 hover:text-brand-brown uppercase tracking-widest transition-colors">
          <HelpCircle size={14} />
          Need help?
        </button>
      </div>

      {/* Available Integrations Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Google Search Console */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex flex-col space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-center p-2.5">
              <img src={logos.gsc} alt="Google Search Console logo" className="w-full h-full object-contain" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900">Google Search Console</h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                Connect your Google Search Console to sync indexing data and technical visibility metrics.
              </p>
            </div>
          </div>
          
          {/* Warning Message */}
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-5 flex items-start gap-4">
            <div className="p-2 bg-orange-100 rounded-lg text-orange-600 shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-black text-orange-900 uppercase tracking-widest">Google account required</p>
              <p className="text-sm text-orange-800 font-medium">
                You need to connect your Google account first to use Google Search Console integration.
              </p>
            </div>
          </div>

          <button className="w-full bg-brand-brown text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-brown/20 hover:scale-[1.01] active:scale-95 transition-all">
            Connect Google Account
          </button>
        </div>

        {/* Google Analytics 4 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex flex-col space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-center p-2.5">
              <img src={logos.ga4} alt="Google Analytics 4 logo" className="w-full h-full object-contain" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900">Google Analytics 4</h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                Connect GA4 to track AI-driven traffic conversions and behavior directly in BrandViz.
              </p>
            </div>
          </div>
          
          <div className="flex-1" /> {/* Spacer */}

          <button className="w-full bg-brand-brown text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-brown/20 hover:scale-[1.01] active:scale-95 transition-all">
            Connect Google Analytics
          </button>
        </div>
      </div>

      {/* Upcoming Integrations Section */}
      <div className="space-y-6 pt-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Upcoming Integrations</h2>
          <div className="h-0.5 bg-gray-100 flex-1 rounded-full" />
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <IntegrationCard 
            name="Looker" 
            logo={logos.looker} 
            description="Send metrics to Looker dashboards for high-level executive reporting."
            votes={votes['Looker']}
            onVote={() => handleVote('Looker')}
            isVoted={votedItems.has('Looker')}
          />
          <IntegrationCard 
            name="Power BI" 
            logo={logos.powerbi} 
            description="Publish datasets to Microsoft Power BI for custom organizational analysis."
            votes={votes['Power BI']}
            onVote={() => handleVote('Power BI')}
            isVoted={votedItems.has('Power BI')}
          />
          <IntegrationCard 
            name="Tableau" 
            logo={logos.tableau} 
            description="Pipe insights to Tableau workbooks for visual data storytelling."
            votes={votes['Tableau']}
            onVote={() => handleVote('Tableau')}
            isVoted={votedItems.has('Tableau')}
          />
          <IntegrationCard 
            name="Google Sheets" 
            logo={logos.sheets} 
            description="Export tables and automate custom analyses with live Google Sheets sync."
            votes={votes['Google Sheets']}
            onVote={() => handleVote('Google Sheets')}
            isVoted={votedItems.has('Google Sheets')}
          />
          <IntegrationCard 
            name="SISTRIX" 
            logo={logos.sistrix} 
            description="Blend ranking data and visibility index from SISTRIX into your reports."
            votes={votes['SISTRIX']}
            onVote={() => handleVote('SISTRIX')}
            isVoted={votedItems.has('SISTRIX')}
          />
          <IntegrationCard 
            name="Seobility" 
            logo={logos.seobility} 
            description="Ingest technical SEO metrics and site audit data from Seobility."
            votes={votes['Seobility']}
            onVote={() => handleVote('Seobility')}
            isVoted={votedItems.has('Seobility')}
          />
          <IntegrationCard 
            name="Similarweb" 
            logo={logos.similarweb} 
            description="Augment market traffic data with Similarweb real-time intelligence."
            votes={votes['Similarweb']}
            onVote={() => handleVote('Similarweb')}
            isVoted={votedItems.has('Similarweb')}
          />
          <IntegrationCard 
            name="Zapier" 
            logo={logos.zapier} 
            description="Trigger automations and send alerts across 5000+ apps when insights update."
            votes={votes['Zapier']}
            onVote={() => handleVote('Zapier')}
            isVoted={votedItems.has('Zapier')}
          />
          <IntegrationCard 
            name="Make" 
            logo={logos.make} 
            description="Build complex visual workflows and data pipes with Make (formerly Integromat)."
            votes={votes['Make']}
            onVote={() => handleVote('Make')}
            isVoted={votedItems.has('Make')}
          />
        </div>
      </div>
    </div>
  );
};
