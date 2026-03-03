import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface PartialReportBannerProps {
  brandId: string;
  onWave2Complete?: () => void;
}

const POLL_MS = 5 * 60 * 1000; // 5 minutes

export const PartialReportBanner: React.FC<PartialReportBannerProps> = ({
  brandId,
  onWave2Complete,
}) => {
  const [visible, setVisible] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    const { data } = await supabase
      .from('brands')
      .select('first_report_status')
      .eq('id', brandId)
      .single();

    if (!data) return;

    if (data.first_report_status === 'succeeded') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setVisible(false);
      onWave2Complete?.();
    }
  }, [brandId, onWave2Complete]);

  useEffect(() => {
    intervalRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  if (!visible) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
      <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0 mt-1.5" />
      <div>
        <p className="text-sm text-amber-900 font-medium">Your initial report is ready — more data incoming</p>
        <p className="text-xs text-amber-700 mt-0.5">
          We're still running the remaining 24 AI queries in the background. Your dashboard will refresh automatically when complete.
        </p>
      </div>
    </div>
  );
};
