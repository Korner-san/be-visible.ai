import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { TimeRange } from '../types';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  onCustomRange?: (from: string, to: string) => void;
  isScrolled?: boolean;
  selectedModels?: string[];
  onModelsChange?: (models: string[]) => void;
}

// ─── Model logo SVGs ─────────────────────────────────────────────────────────

const OpenAILogo: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.843-3.368L15.115 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.403-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
  </svg>
);

const GoogleAILogo: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const ClaudeLogo: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-1.806-.097L1 12.587l.024-.222.767-.813.791-.07 1.952.024 2.385.12 1.952.098.839.05-.073-.203-1.731-3.023-1.21-2.122-.78-1.37-.274-.516a2.66 2.66 0 0 1-.194-.839c0-.436.145-.798.42-1.067a1.3 1.3 0 0 1 .952-.411c.363 0 .66.113.903.34l.444.377.718 1.195 1.048 1.829 1.355 2.359.306.58.178-.314.718-1.638.613-1.428.58-1.209.427-.927.347-.669.363-.484c.17-.234.388-.424.645-.56A1.765 1.765 0 0 1 12 4c.29 0 .572.066.823.186.363.17.629.439.79.79.17.363.19.735.056 1.113l-.194.548-.347.717-.702 1.493-.887 1.878-.734 1.54.169.017 2.022-.072 2.175-.024h1.718l1.476.072.685.17.282.364.081.427-.129.403-.33.258-.84.049-1.912-.024-2.432-.049-1.234-.024-.314.024-.017.105.613 1.05 1.403 2.416.911 1.54.435.726.097.37a1.416 1.416 0 0 1-.145.9 1.37 1.37 0 0 1-.71.61 1.473 1.473 0 0 1-.92.024 1.48 1.48 0 0 1-.742-.5l-.387-.605-1.21-2.094-1.395-2.432-.524-.944-.202.08-2.868 1.62-1.798 1.025-.944.517-.58.218a1.44 1.44 0 0 1-.944-.04 1.378 1.378 0 0 1-.694-.613 1.35 1.35 0 0 1-.153-.903c.064-.33.234-.613.484-.814z" fill="#D97757"/>
  </svg>
);

const AllModelsLogo: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="5" cy="8" r="3.5" fill="#10a37f" opacity="0.9"/>
    <circle cx="8" cy="8" r="3.5" fill="#4285F4" opacity="0.85"/>
    <circle cx="11" cy="8" r="3.5" fill="#D97757" opacity="0.85"/>
  </svg>
);

const MODEL_OPTIONS = [
  { id: 'all',                  label: 'All Models',         models: ['chatgpt', 'google_ai_overview', 'claude'], Logo: AllModelsLogo },
  { id: 'chatgpt',              label: 'ChatGPT',            models: ['chatgpt'],                                 Logo: OpenAILogo    },
  { id: 'google_ai_overview',   label: 'Google AI Overview', models: ['google_ai_overview'],                      Logo: GoogleAILogo  },
  { id: 'claude',               label: 'Claude',             models: ['claude'],                                  Logo: ClaudeLogo    },
];

const formatDateLabel = (iso: string) => {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  timeRange,
  setTimeRange,
  onCustomRange,
  isScrolled,
  selectedModels = ['chatgpt', 'google_ai_overview'],
  onModelsChange,
}) => {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customFromInput, setCustomFromInput] = useState('');
  const [customToInput, setCustomToInput] = useState('');
  const customPickerRef = useRef<HTMLDivElement>(null);

  const [showModelPicker, setShowModelPicker] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (customPickerRef.current && !customPickerRef.current.contains(e.target as Node)) {
        setShowCustomPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentModelOption = MODEL_OPTIONS.find(o =>
    o.models.length === selectedModels.length && o.models.every(m => selectedModels.includes(m))
  ) || MODEL_OPTIONS[0];

  const handleApplyCustom = () => {
    if (customFromInput && customToInput && customFromInput <= customToInput) {
      setTimeRange(TimeRange.CUSTOM);
      onCustomRange?.(customFromInput, customToInput);
      setShowCustomPicker(false);
    }
  };

  const customButtonLabel = () => {
    if (timeRange === TimeRange.CUSTOM && customFromInput && customToInput) {
      return `${formatDateLabel(customFromInput)} – ${formatDateLabel(customToInput)}`;
    }
    return 'Custom';
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <header
      className={`px-5 h-[62px] flex items-center justify-between shrink-0 absolute top-0 w-full z-20 transition-all duration-300 ${
        isScrolled
          ? 'bg-white/85 backdrop-blur-xl border-b shadow-sm'
          : 'bg-white border-b'
      }`}
      style={{ borderColor: '#e8edf4' }}
    >
      {/* Page title */}
      <span className="text-sm font-semibold text-slate-700 tracking-tight">{activeTab}</span>

      {/* Right controls */}
      <div className="flex items-center gap-2.5">
        {/* Time range pills */}
        <div className="pill-nav">
          {[TimeRange.SEVEN_DAYS, TimeRange.THIRTY_DAYS, TimeRange.NINETY_DAYS].map((range) => (
            <button
              key={range}
              onClick={() => { setTimeRange(range); setShowCustomPicker(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth ${
                timeRange === range
                  ? 'bg-brand-brown text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {range}
            </button>
          ))}
          {/* Custom range */}
          <div className="relative" ref={customPickerRef}>
            <button
              onClick={() => setShowCustomPicker(!showCustomPicker)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth flex items-center gap-1 ${
                timeRange === TimeRange.CUSTOM
                  ? 'bg-brand-brown text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {customButtonLabel()}
              <ChevronDown size={10} className={`transition-transform ${showCustomPicker ? 'rotate-180' : ''}`} />
            </button>

            {showCustomPicker && (
              <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl border shadow-elevated p-4 z-50 w-[240px]" style={{ borderColor: '#e8edf4' }}>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Custom range</p>
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">From</label>
                    <input
                      type="date"
                      value={customFromInput}
                      max={customToInput || today}
                      onChange={(e) => setCustomFromInput(e.target.value)}
                      className="w-full text-xs border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-brown/20 focus:border-brand-brown transition-smooth"
                      style={{ borderColor: '#e8edf4' }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">To</label>
                    <input
                      type="date"
                      value={customToInput}
                      min={customFromInput}
                      max={today}
                      onChange={(e) => setCustomToInput(e.target.value)}
                      className="w-full text-xs border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-brown/20 focus:border-brand-brown transition-smooth"
                      style={{ borderColor: '#e8edf4' }}
                    />
                  </div>
                </div>
                <button
                  onClick={handleApplyCustom}
                  disabled={!customFromInput || !customToInput || customFromInput > customToInput}
                  className="mt-3 w-full py-2 bg-brand-brown text-white text-xs font-semibold rounded-xl disabled:opacity-40 hover:bg-brand-brown/90 transition-smooth"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Model selector */}
        <div className="relative" ref={modelPickerRef}>
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border rounded-xl text-xs font-semibold text-slate-700 hover:border-brand-brown/30 hover:bg-slate-50 transition-smooth"
            style={{ borderColor: '#e8edf4' }}
          >
            <currentModelOption.Logo size={14} />
            {currentModelOption.label}
            <ChevronDown size={11} className={`text-slate-400 transition-transform ${showModelPicker ? 'rotate-180' : ''}`} />
          </button>
          {showModelPicker && (
            <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl border shadow-elevated z-50 py-1.5 min-w-[200px]" style={{ borderColor: '#e8edf4' }}>
              <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Source Model</p>
              {MODEL_OPTIONS.map(opt => {
                const isActive = opt.models.length === selectedModels.length && opt.models.every(m => selectedModels.includes(m));
                return (
                  <button
                    key={opt.id}
                    onClick={() => { onModelsChange?.(opt.models); setShowModelPicker(false); }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium transition-smooth ${isActive ? 'bg-indigo-50 text-brand-brown' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    <opt.Logo size={14} />
                    {opt.label}
                    {isActive && <span className="ml-auto text-brand-indigo font-bold text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </header>
  );
};

const IconBtn: React.FC<{ icon: React.ReactNode }> = ({ icon }) => (
  <button className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand-brown transition-smooth">
    {icon}
  </button>
);
