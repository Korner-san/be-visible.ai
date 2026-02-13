import React from 'react';
import { Clock, Construction, LayoutList, Hammer } from 'lucide-react';

export const ImprovePage: React.FC = () => {
  const brandTerracotta = '#874B34';

  return (
    <div className="h-[60vh] flex items-center justify-center animate-fadeIn">
      <div className="max-w-md w-full text-center space-y-8 p-10 bg-white rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 p-4 opacity-5">
           <Hammer size={80} style={{ color: brandTerracotta }} />
        </div>
        
        <div className="relative z-10 space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center border border-orange-100">
              <Clock className="w-8 h-8" style={{ color: brandTerracotta }} />
            </div>
          </div>
          
          <div className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 flex items-center justify-center gap-2">
              <Construction size={12} style={{ color: brandTerracotta }} />
              Module In Development
            </span>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Improve Page</h2>
          </div>
          
          <div className="p-4 bg-slate-50 rounded-xl border border-gray-100">
            <p className="text-sm text-slate-600 font-medium leading-relaxed">
              This hub will centralize your DIY and Partner-assisted tasks, providing a unified dashboard to track and complete visibility improvement assignments.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs font-bold text-gray-400 italic">
            <LayoutList size={14} />
            Execution tracking coming soon
          </div>
        </div>
      </div>
    </div>
  );
};