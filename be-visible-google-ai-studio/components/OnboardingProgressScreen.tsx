import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Loader2, Zap, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface OnboardingProgressScreenProps {
  brandId: string;
  brandName: string;
  initialCount?: number;
  onComplete: () => void;
}

const TOTAL = 30;
const POLL_MS = 5_000;
const TIMEOUT_MS = 60 * 60 * 1_000; // 1 hour max

export const OnboardingProgressScreen: React.FC<OnboardingProgressScreenProps> = ({
  brandId,
  brandName,
  initialCount = 0,
  onComplete,
}) => {
  const [sent, setSent] = useState(initialCount);
  const [phase, setPhase] = useState<'running' | 'complete' | 'timeout'>('running');

  const poll = useCallback(async () => {
    const { data } = await supabase
      .from('brands')
      .select('onboarding_prompts_sent, first_report_status')
      .eq('id', brandId)
      .single();

    if (!data) return;

    const count = data.onboarding_prompts_sent ?? 0;
    setSent(count);

    if (data.first_report_status === 'succeeded' || count >= TOTAL) {
      setPhase('complete');
      setTimeout(onComplete, 2500);
    }
  }, [brandId, onComplete]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_MS);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setPhase('timeout');
    }, TIMEOUT_MS);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [poll]);

  const milestones = [10, 20, 30];
  const pct = Math.min((sent / TOTAL) * 100, 100);

  if (phase === 'complete') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 w-full max-w-md text-center space-y-6">
          <div className="mx-auto w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center">
            <CheckCircle size={36} className="text-emerald-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">Your report is ready!</h2>
            <p className="text-sm text-gray-500">All 30 prompts have been processed. Taking you to your dashboard…</p>
          </div>
          <div className="w-8 h-8 border-4 border-gray-200 border-t-brand-brown rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (phase === 'timeout') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 w-full max-w-md text-center space-y-6">
          <p className="text-sm text-gray-500">
            This is taking longer than expected. Your report will be ready soon — check back in a few minutes.
          </p>
          <button
            onClick={onComplete}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-brand-brown text-white rounded-xl font-semibold text-sm hover:brightness-110 transition-all"
          >
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
            <Zap size={28} className="text-brand-brown" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Running your visibility scan</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            We're sending your 30 prompts through AI and extracting visibility data in real time.
          </p>
        </div>

        {/* Live counter */}
        <div className="text-center">
          <span className="text-5xl font-black text-brand-brown tabular-nums">{sent}</span>
          <span className="text-2xl font-bold text-gray-300"> / {TOTAL}</span>
          <p className="text-xs text-gray-400 mt-1">prompts extracted</p>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-brown rounded-full transition-all duration-1000"
              style={{ width: `${pct}%` }}
            />
          </div>
          {/* Milestones */}
          <div className="flex justify-between text-xs text-gray-400 px-0.5">
            {milestones.map(m => (
              <div key={m} className="flex items-center gap-1">
                {sent >= m
                  ? <CheckCircle size={11} className="text-emerald-500" />
                  : <div className="w-2.5 h-2.5 rounded-full border border-gray-300" />
                }
                <span className={sent >= m ? 'text-emerald-600 font-semibold' : ''}>{m}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Status rows */}
        <div className="space-y-3">
          {[
            { label: 'Onboarding completed', done: true },
            { label: 'Prompts generated and saved', done: true },
            { label: `Visibility scan running (${sent}/${TOTAL})`, done: false },
          ].map((s, i) => (
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
              <span className={`text-sm ${s.done ? 'text-slate-500' : 'text-slate-800 font-medium'}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 text-center pt-2 border-t border-gray-100">
          Brand: <strong className="text-gray-600">{brandName}</strong> — updating every 5s
        </p>
      </div>
    </div>
  );
};
