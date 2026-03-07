import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, LogOut, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface OnboardingProgressScreenProps {
  brandId: string;
  brandName: string;
  initialCount?: number;
  onComplete: () => void;
}

const POLL_MS = 10_000;
const TIMEOUT_MS = 25 * 60 * 1_000;

type Status = 'working' | 'almost' | 'redirecting' | 'timeout';

const STEPS = [
  {
    short: 'Connecting',
    full: 'Connecting to premium AI models...',
  },
  {
    short: 'Deploying',
    full: 'Deploying AI agents to run your prompts.',
  },
  {
    short: 'Extracting',
    full: 'Mapping high-impact citations and ranking-critical URL content.',
  },
  {
    short: 'Generating',
    full: 'Generating your Visibility Intelligence dashboard to show: How your brand is perceived across the AI landscape.',
  },
];

// Returns 1–4 based on real backend signals
function getCurrentStep(elapsedSeconds: number, sent: number, eodElapsed: number): number {
  if (elapsedSeconds < 10) return 1;  // first 10s: connecting
  if (sent < 6)            return 2;  // agents deployed, prompts running
  if (eodElapsed < 90)     return 3;  // EOD started: citation extraction
  return 4;                           // citations done: dashboard generation
}

export const OnboardingProgressScreen: React.FC<OnboardingProgressScreenProps> = ({
  brandId,
  brandName,
  onComplete,
}) => {
  const { signOut } = useAuth();
  const [status, setStatus] = useState<Status>('working');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [eodElapsed, setEodElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirectedRef = useRef(false);
  const eodStartRef = useRef<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => {
      setElapsedSeconds(s => s + 1);
      if (eodStartRef.current !== null) {
        setEodElapsed(Math.floor((Date.now() - eodStartRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const poll = useCallback(async () => {
    if (Date.now() - startRef.current > TIMEOUT_MS) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setStatus('timeout');
      return;
    }

    const { data } = await supabase
      .from('brands')
      .select('first_report_status, onboarding_prompts_sent')
      .eq('id', brandId)
      .single();

    if (!data) return;

    const s = data.first_report_status;
    const sent = data.onboarding_prompts_sent ?? 0;

    if (!redirectedRef.current && (s === 'phase1_complete' || s === 'succeeded')) {
      redirectedRef.current = true;
      setStatus('redirecting');
      if (intervalRef.current) clearInterval(intervalRef.current);
      setTimeout(onComplete, 1500);
      return;
    }

    setSentCount(sent);
    if (sent >= 6 && eodStartRef.current === null) {
      eodStartRef.current = Date.now();
    }
    setStatus(sent >= 6 ? 'almost' : 'working');
  }, [brandId, onComplete]);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, POLL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [poll]);

  const handleRetry = () => {
    setStatus('working');
    startRef.current = Date.now();
    redirectedRef.current = false;
    intervalRef.current = setInterval(poll, POLL_MS);
    poll();
  };

  const currentStep = getCurrentStep(elapsedSeconds, sentCount, eodElapsed);

  // ── Timeout screen ────────────────────────────────────────────────────────
  if (status === 'timeout') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="text-center max-w-sm space-y-6">
          <div className="mx-auto w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center">
            <AlertCircle size={28} className="text-amber-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-gray-900">Still working on it</h1>
            <p className="text-gray-500 text-sm">
              This is taking a bit longer than usual. Your report is still being prepared — click below to keep waiting.
            </p>
          </div>
          <button
            onClick={handleRetry}
            className="w-full py-3 px-6 bg-brand-brown text-white rounded-xl font-semibold text-sm hover:brightness-110 transition-all"
          >
            Keep waiting
          </button>
          <button onClick={signOut} className="flex items-center justify-center gap-1.5 w-full text-xs text-gray-400 hover:text-gray-600 transition-colors">
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>
    );
  }

  // ── Redirecting screen ────────────────────────────────────────────────────
  if (status === 'redirecting') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="text-center max-w-sm space-y-6">
          <div className="mx-auto w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Your report is ready!</h1>
            <p className="text-gray-500 text-sm mt-2">Taking you to your dashboard…</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Main working screen — Stepper ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-10">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-brand-brown rounded-xl flex items-center justify-center mx-auto shadow-sm mb-4">
            <span className="text-white font-bold text-xl">B</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            {status === 'almost'
              ? 'Finalizing your report'
              : 'Building your Visibility Intelligence report'}
          </h1>
          <p className="text-sm text-gray-400">
            for <span className="font-medium text-gray-600">{brandName}</span>
          </p>
        </div>

        {/* Stepper */}
        <div className="w-full">
          {/* Circles + connector lines */}
          <div className="flex items-start">
            {STEPS.map((step, idx) => {
              const stepNum = idx + 1;
              const isCompleted = currentStep > stepNum;
              const isActive = currentStep === stepNum;

              return (
                <React.Fragment key={idx}>
                  {/* Step node */}
                  <div className="flex flex-col items-center gap-2" style={{ minWidth: 0, flex: '0 0 auto' }}>
                    {/* Circle */}
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-500 ${
                        isCompleted
                          ? 'bg-brand-brown text-white'
                          : isActive
                          ? 'bg-brand-brown text-white ring-4 ring-brand-brown/20'
                          : 'bg-white border-2 border-gray-200 text-gray-400'
                      }`}
                    >
                      {isCompleted ? <Check size={16} /> : stepNum}
                    </div>
                    {/* Short label */}
                    <span
                      className={`text-[10px] font-semibold text-center leading-tight transition-colors duration-300 ${
                        isActive ? 'text-brand-brown' : isCompleted ? 'text-gray-400' : 'text-gray-300'
                      }`}
                      style={{ width: '64px' }}
                    >
                      {step.short}
                    </span>
                  </div>

                  {/* Connector line */}
                  {idx < STEPS.length - 1 && (
                    <div className="flex-1 mx-1" style={{ paddingBottom: '28px', paddingTop: '20px' }}>
                      <div className="h-0.5 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-brown rounded-full transition-all duration-700"
                          style={{ width: currentStep > idx + 1 ? '100%' : '0%' }}
                        />
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Current step description card */}
          <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100 min-h-[64px] flex items-center justify-center">
            <p className="text-sm text-gray-700 leading-relaxed text-center font-medium">
              {STEPS[currentStep - 1].full}
            </p>
          </div>
        </div>

        {/* Pulsing dots */}
        <div className="flex justify-center gap-1.5">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-brand-brown/40 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>

        {/* Sign out */}
        <button
          onClick={signOut}
          className="flex items-center justify-center gap-1.5 w-full text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <LogOut size={13} /> Sign out
        </button>

      </div>
    </div>
  );
};
