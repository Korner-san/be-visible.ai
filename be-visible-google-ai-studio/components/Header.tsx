import React, { useState, useRef, useEffect } from 'react';
import { Calendar, Globe, Maximize2, RefreshCw, Monitor, ChevronDown } from 'lucide-react';
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

const MODEL_OPTIONS = [
  { id: 'all',                  label: 'All Models',         models: ['chatgpt', 'google_ai_overview'], dot: 'bg-gradient-to-r from-emerald-500 to-blue-500' },
  { id: 'chatgpt',              label: 'ChatGPT',            models: ['chatgpt'],                       dot: 'bg-emerald-500' },
  { id: 'google_ai_overview',   label: 'Google AI Overview', models: ['google_ai_overview'],            dot: 'bg-blue-500' },
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
  const tabs = ['Visibility', 'Competitors', 'Citations', 'Prompts', 'Improve'];

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

  const currentModelOption = MODEL_OPTIONS.find(o =>
    o.models.length === selectedModels.length && o.models.every(m => selectedModels.includes(m))
  ) || MODEL_OPTIONS[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (customPickerRef.current && !customPickerRef.current.contains(e.target as Node)) {
        setShowCustomPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
                onClick={() => {
                  setTimeRange(range);
                  setShowCustomPicker(false);
                }}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  timeRange === range
                    ? 'bg-brand-brown text-white shadow-sm'
                    : 'text-gray-500 hover:text-brand-brown hover:bg-gray-200'
                }`}
              >
                {range}
              </button>
            ))}

            {/* Custom date picker — following GlobalDateFilter pattern */}
            <div className="relative" ref={customPickerRef}>
              <button
                onClick={() => setShowCustomPicker(!showCustomPicker)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                  timeRange === TimeRange.CUSTOM
                    ? 'bg-brand-brown text-white shadow-sm'
                    : 'text-gray-500 hover:text-brand-brown hover:bg-gray-200'
                }`}
              >
                {customButtonLabel()}
                <ChevronDown size={10} className={`transition-transform ${showCustomPicker ? 'rotate-180' : ''}`} />
              </button>

              {showCustomPicker && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-xl border border-gray-200 shadow-xl p-4 z-50 w-[240px]">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Custom range</p>
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 block mb-1">From</label>
                      <input
                        type="date"
                        value={customFromInput}
                        max={customToInput || today}
                        onChange={(e) => setCustomFromInput(e.target.value)}
                        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-brown/20 focus:border-brand-brown transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 block mb-1">To</label>
                      <input
                        type="date"
                        value={customToInput}
                        min={customFromInput}
                        max={today}
                        onChange={(e) => setCustomToInput(e.target.value)}
                        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-brown/20 focus:border-brand-brown transition-colors"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleApplyCustom}
                    disabled={!customFromInput || !customToInput || customFromInput > customToInput}
                    className="mt-3 w-full py-2 bg-brand-brown text-white text-xs font-black rounded-lg disabled:opacity-40 hover:bg-brand-brown/90 transition-colors"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Model selector */}
        <div className="relative" ref={modelPickerRef}>
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-slate-700 hover:border-gray-300 hover:bg-gray-100 transition-all"
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${currentModelOption.dot}`} />
            {currentModelOption.label}
            <ChevronDown size={11} className={`text-gray-400 transition-transform ${showModelPicker ? 'rotate-180' : ''}`} />
          </button>
          {showModelPicker && (
            <div className="absolute right-0 top-full mt-2 bg-white rounded-xl border border-gray-200 shadow-xl z-50 py-1 min-w-[180px]">
              <p className="px-3 pt-2 pb-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">Source Model</p>
              {MODEL_OPTIONS.map(opt => {
                const isActive = opt.models.length === selectedModels.length && opt.models.every(m => selectedModels.includes(m));
                return (
                  <button
                    key={opt.id}
                    onClick={() => { onModelsChange?.(opt.models); setShowModelPicker(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold transition-colors ${isActive ? 'bg-brand-brown/5 text-brand-brown' : 'text-slate-600 hover:bg-gray-50'}`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />
                    {opt.label}
                    {isActive && <span className="ml-auto text-brand-brown">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
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
