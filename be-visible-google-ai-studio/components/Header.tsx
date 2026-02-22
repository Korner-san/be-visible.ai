import React from 'react';
import { Calendar, Globe, Maximize2, RefreshCw, Monitor } from 'lucide-react';
import { TimeRange } from '../types';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  isScrolled?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ 
  activeTab, 
  setActiveTab, 
  timeRange, 
  setTimeRange,
  isScrolled
}) => {
  const tabs = ['Visibility', 'Competitors', 'Citations', 'Prompts', 'Improve'];

  return (
    <header 
      className={`px-4 h-16 flex items-center justify-between shrink-0 absolute top-0 w-full z-20 transition-all duration-300 ${
        isScrolled 
          ? 'bg-white/80 backdrop-blur-lg border-b border-gray-200/50 shadow-sm' 
          : 'bg-white border-b border-gray-200 shadow-sm'
      }`}
    >
      {/* Tabs */}
      <nav className="flex space-x-1 h-full items-center">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
              activeTab === tab
                ? 'bg-brand-brown text-white shadow-md'
                : 'text-slate-500 hover:bg-gray-100 hover:text-brand-brown'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200">
           <div className="flex items-center px-3 py-1 gap-2 border-r border-gray-200">
             <Globe size={14} className="text-gray-500" />
             <span className="text-xs font-semibold text-slate-700">(1/3)</span>
           </div>
           
           <div className="flex items-center gap-1 pl-1">
             {[TimeRange.SEVEN_DAYS, TimeRange.THIRTY_DAYS, TimeRange.NINETY_DAYS].map((range) => (
               <button
                 key={range}
                 onClick={() => setTimeRange(range)}
                 className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    timeRange === range 
                    ? 'bg-brand-brown text-white shadow-sm' 
                    : 'text-gray-500 hover:text-brand-brown hover:bg-gray-200'
                 }`}
               >
                 {range}
               </button>
             ))}
           </div>
        </div>

        <div className="flex items-center gap-1.5 text-gray-400">
          <IconButton icon={<Calendar size={18} />} />
          <IconButton icon={<Monitor size={18} />} />
          <IconButton icon={<RefreshCw size={18} />} />
          <IconButton icon={<Maximize2 size={18} />} />
        </div>
      </div>
    </header>
  );
};

const IconButton: React.FC<{ icon: React.ReactNode }> = ({ icon }) => (
  <button className="p-2 hover:bg-gray-100 rounded-full transition-colors hover:text-brand-brown">
    {icon}
  </button>
);