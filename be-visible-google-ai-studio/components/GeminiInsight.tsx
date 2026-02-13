import React, { useEffect, useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { TimeRange } from '../types';

interface GeminiInsightProps {
  timeRange: TimeRange;
}

export const GeminiInsight: React.FC<GeminiInsightProps> = ({ timeRange }) => {
  const [insight, setInsight] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsight = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        throw new Error("API Key missing");
      }

      const ai = new GoogleGenAI({ apiKey });
      const model = 'gemini-3-flash-preview';
      
      const prompt = `
        You are an elite Brand Strategy Consultant for a SaaS company named "Incredibuild".
        Analyze the following visibility data for the time range: ${timeRange}.
        
        Data Context:
        - Current Visibility Score: 94/100 (+12.4% growth)
        - Share of Voice: 45% (Dominant against Competitor A at 25%)
        - Weakest Category: "DevOps" (Rank #4.2)
        - Strongest Category: "AI Tools" (Rank #1.2)
        - Mention Rate: 78% positive sentiment.

        Task:
        Provide a concise, high-impact strategic recommendation (approx 40-50 words). 
        Use professional, executive language. 
        Focus on how to leverage the "AI Tools" authority to boost the "DevOps" category.
        Do not use markdown. Just plain text.
      `;

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      setInsight(response.text || "No insight generated.");
    } catch (err) {
      console.error(err);
      setInsight("Unable to generate insight at this time. Please check your API configuration.");
      setError("Failed to connect to AI service.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-900 text-white shadow-xl transition-all hover:shadow-2xl ring-1 ring-white/10">
      {/* Abstract Background Shapes */}
      <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-blue-500 rounded-full blur-3xl opacity-10 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-80 h-80 bg-emerald-500 rounded-full blur-3xl opacity-10 pointer-events-none"></div>

      <div className="relative p-6 md:p-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-lg backdrop-blur-sm border border-emerald-500/30">
              <Sparkles className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold tracking-wide">Gemini AI Strategic Insight</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
              Live Now
            </span>
          </div>
          <button 
            onClick={fetchInsight}
            disabled={loading}
            className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
            title="Refresh Insight"
          >
            <RefreshCw size={18} className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="min-h-[80px]">
          {loading ? (
             <div className="space-y-2 animate-pulse">
               <div className="h-4 bg-white/10 rounded w-3/4"></div>
               <div className="h-4 bg-white/10 rounded w-full"></div>
               <div className="h-4 bg-white/10 rounded w-5/6"></div>
             </div>
          ) : (
            <p className="text-slate-300 leading-relaxed font-light text-lg">
              {insight}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};