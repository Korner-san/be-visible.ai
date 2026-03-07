import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface OnboardingProgressScreenProps {
  brandId: string;
  brandName: string;
  initialCount?: number;
  onComplete: () => void;
}

const POLL_MS = 10_000;
const TIMEOUT_MS = 25 * 60 * 1_000; // 25 min

type Status = 'working' | 'almost' | 'redirecting' | 'timeout';

const PHASE_TEXTS = [
  'Connecting to premium AI models...',
  'Deploying AI agents to run your prompts.',
  'Mapping high-impact citations and ranking-critical URL content.',
  'Generating your Visibility Intelligence dashboard to show: How your brand is perceived across the AI landscape.',
];

// eodElapsed = seconds since the 6th prompt was sent (EOD processor started)
function getPhaseText(elapsedSeconds: number, sent: number, eodElapsed: number): string {
  if (elapsedSeconds < 10) return PHASE_TEXTS[0];  // first 10s: still connecting
  if (sent < 6)            return PHASE_TEXTS[1];  // prompts still running
  if (eodElapsed < 90)     return PHASE_TEXTS[2];  // EOD started: citation extraction first
  return PHASE_TEXTS[3];                           // citations done: dashboard generation
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

  // ── Content per status ────────────────────────────────────────────────────
  const content: Record<Exclude<Status, 'timeout'>, { heading: string; sub: string }> = {
    working: {
      heading: `Building your Visibility Intelligence report`,
      sub: getPhaseText(elapsedSeconds, sentCount, eodElapsed),
    },
    almost: {
      heading: `Finalizing your report`,
      sub: getPhaseText(elapsedSeconds, sentCount, eodElapsed),
    },
    redirecting: {
      heading: `Your report is ready!`,
      sub: `Taking you to your dashboard…`,
    },
  };

  const { heading, sub } = content[status];

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="text-center max-w-sm space-y-8">

        {/* Animated loader */}
        <div className="flex justify-center">
          {status === 'redirecting' ? (
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="#e5e7eb" strokeWidth="4" />
                <circle
                  cx="32" cy="32" r="28"
                  fill="none"
                  stroke={status === 'almost' ? '#f59e0b' : '#2C1308'}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray="175.9"
                  strokeDashoffset={status === 'almost' ? '44' : '110'}
                  style={{ transition: 'all 0.7s ease' }}
                />
              </svg>
            </div>
          )}
        </div>

        {/* Text */}
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">{heading}</h1>
          <p className="text-gray-500 text-sm leading-relaxed">{sub}</p>
          {status !== 'redirecting' && (
            <p className="text-xs text-gray-400 pt-1">
              for <span className="font-medium text-gray-500">{brandName}</span>
            </p>
          )}
        </div>

        {/* Pulsing dots */}
        {(status === 'working' || status === 'almost') && (
          <div className="flex justify-center gap-1.5">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-gray-300 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}

        {/* Sign out */}
        {status !== 'redirecting' && (
          <button onClick={signOut} className="flex items-center justify-center gap-1.5 w-full text-xs text-gray-400 hover:text-gray-600 transition-colors pt-2">
            <LogOut size={13} /> Sign out
          </button>
        )}

      </div>
    </div>
  );
};
