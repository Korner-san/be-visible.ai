
import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Loader2, Clock, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface WaitingScreenProps {
  brandId: string;
  brandName: string;
  onReportReady: () => void;
}

const POLL_INTERVAL_MS = 15_000;       // poll every 15 seconds
const TIMEOUT_MS = 45 * 60 * 1_000;   // give up after 45 minutes

export const WaitingScreen: React.FC<WaitingScreenProps> = ({ brandId, brandName, onReportReady }) => {
  const [status, setStatus] = useState<'waiting' | 'timeout'>('waiting');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [dotsCount, setDotsCount] = useState(1);

  // Animated dots
  useEffect(() => {
    const t = setInterval(() => setDotsCount(d => (d % 3) + 1), 700);
    return () => clearInterval(t);
  }, []);

  // Elapsed time counter
  useEffect(() => {
    const t = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll for first_report_status
  const poll = useCallback(async () => {
    if (!brandId) return;
    const { data } = await supabase
      .from('brands')
      .select('first_report_status')
      .eq('id', brandId)
      .single();

    if (data?.first_report_status === 'succeeded') {
      onReportReady();
    }
  }, [brandId, onReportReady]);

  useEffect(() => {
    // Poll immediately then on interval
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    // Timeout
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setStatus('timeout');
    }, TIMEOUT_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [poll]);

  const formatElapsed = () => {
    const m = Math.floor(elapsedSeconds / 60);
    const s = elapsedSeconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const steps = [
    { label: 'Onboarding completed', done: true },
    { label: 'Prompts generated and saved', done: true },
    { label: 'Running your first visibility scan', done: false },
  ];

  if (status === 'timeout') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 w-full max-w-md text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center">
            <Clock size={28} className="text-amber-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-gray-900">This is taking longer than expected</h2>
            <p className="text-sm text-gray-500">
              Your first report is being generated in the background. It will be ready soon — check back in a few minutes.
            </p>
          </div>
          <button
            onClick={onReportReady}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-brand-brown text-white rounded-xl font-semibold text-sm hover:brightness-110 transition-all">
            Go to dashboard <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-brand-brown/10 rounded-full flex items-center justify-center mx-auto">
            <span className="text-brand-brown font-bold text-2xl">B</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            We're preparing your first report…
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            We're running your 30 visibility prompts through AI right now.
            This takes a few minutes. Your dashboard will load automatically when it's ready.
          </p>
        </div>

        {/* Progress steps */}
        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              {s.done ? (
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <CheckCircle size={14} className="text-emerald-600" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  <Loader2 size={14} className="text-blue-500 animate-spin" />
                </div>
              )}
              <span className={`text-sm ${s.done ? 'text-slate-600' : 'text-slate-800 font-medium'}`}>
                {s.label}{!s.done ? '.'.repeat(dotsCount) : ''}
              </span>
            </div>
          ))}
        </div>

        {/* Pulse progress bar */}
        <div className="space-y-2">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand-brown rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Elapsed: {formatElapsed()}</span>
            <span>Checking every 15s</span>
          </div>
        </div>

        {/* Footnote */}
        <p className="text-xs text-gray-400 text-center pt-2 border-t border-gray-100">
          Brand: <strong className="text-gray-600">{brandName}</strong> — your prompts are running through ChatGPT and being analyzed.
        </p>
      </div>
    </div>
  );
};
