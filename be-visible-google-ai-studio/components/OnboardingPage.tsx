
import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Target,
  Search,
  BrainCircuit,
  Globe,
  ArrowRight,
  ArrowLeft,
  Zap,
  BarChart3,
  ChevronDown,
  Edit3,
  X,
  Plus,
  Languages,
  MapPin,
  GripVertical,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { OnboardingEditPromptsPage } from './OnboardingEditPromptsPage';

interface OnboardingData {
  brandName: string;
  website: string;
  language: string;
  region: string;
  industry: string;
  productCategory: string;
  problemSolved: string;
  tasksHelped: string[];
  goalFacilitated: string;
  keyFeatures: string[];
  useCases: string[];
  competitors: string[];
  uniqueSellingProps: string[];
}

interface GeneratedPrompt {
  id: string;   // actual brand_prompts.id from DB
  text: string; // improved_prompt || raw_prompt
  category: string;
}

interface OnboardingPageProps {
  existingBrandId?: string | null;
  onComplete: () => void;
  onNavigate?: (tab: string) => void;
}

// Empty initial data — no hardcoded sample content
const emptyData: OnboardingData = {
  brandName: '',
  website: '',
  language: 'English',
  region: 'Global',
  industry: '',
  productCategory: '',
  problemSolved: '',
  tasksHelped: ['', '', '', '', ''],
  goalFacilitated: '',
  keyFeatures: ['', '', '', ''],
  useCases: ['', '', '', ''],
  competitors: ['', '', '', ''],
  uniqueSellingProps: ['', '', '', ''],
};

const languages = [
  'English', 'Spanish', 'French', 'German', 'Arabic', 'Hebrew', 'Chinese', 'Japanese', 'Portuguese', 'Italian'
];

const regions = [
  'Global', 'United States', 'Europe', 'Middle East', 'Asia Pacific', 'South America', 'Africa', 'Israel', 'United Kingdom'
];

// ─── Icons ────────────────────────────────────────────────────────────────────

const BeeIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M2 12h2"/><path d="m4.93 19.07 1.41-1.41"/><path d="M12 22v-2"/><path d="m19.07 19.07-1.41-1.41"/><path d="M22 12h-2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z"/>
  </svg>
);

const HexagonIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 115" className={className} xmlns="http://www.w3.org/2000/svg">
    <path
      d="M50 5 L93.3 30 L93.3 80 L50 105 L6.7 80 L6.7 30 Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinejoin="round"
      className="drop-shadow-sm"
    />
  </svg>
);

const CompetitorLogo = ({ name }: { name: string }) => {
  const [error, setError] = useState(false);
  const isDomain = name.includes('.') && !name.includes(' ');
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${isDomain ? name : name.toLowerCase().replace(/\s/g, '') + '.com'}&sz=64`;

  if (error || !name) {
    return (
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs uppercase">
        {name ? name.charAt(0) : '?'}
      </div>
    );
  }

  return (
    <img
      src={faviconUrl}
      alt={`${name} logo`}
      className="w-8 h-8 object-contain rounded-lg bg-white p-1 border border-slate-100 shadow-sm"
      onError={() => setError(true)}
    />
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const OnboardingPage: React.FC<OnboardingPageProps> = ({ existingBrandId, onComplete, onNavigate }) => {
  const { user } = useAuth();

  // ── Step / form state ──────────────────────────────────────────────────────
  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(emptyData);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [scanningIndex, setScanningIndex] = useState(0);
  const [websiteAnalysisError, setWebsiteAnalysisError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false); // whether scan succeeded

  // ── Brand / DB state ───────────────────────────────────────────────────────
  const [brandId, setBrandId] = useState<string | null>(existingBrandId || null);
  const [isSaving, setIsSaving] = useState(false);

  // ── Generation state ───────────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [generationPhase, setGenerationPhase] = useState<'analyzing' | 'completed'>('analyzing');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedPrompts, setGeneratedPrompts] = useState<GeneratedPrompt[]>([]);

  // ── Finish state ───────────────────────────────────────────────────────────
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  // ── View: 'onboarding' | 'edit-prompts' ───────────────────────────────────
  const [view, setView] = useState<'onboarding' | 'edit-prompts'>('onboarding');

  const totalSteps = 13;
  const progressPercentage = Math.round((step / totalSteps) * 100);

  // ── Load existing brand data if resuming ────────────────────────────────────
  useEffect(() => {
    if (!existingBrandId) return;
    const loadExisting = async () => {
      const { data: brand } = await supabase
        .from('brands')
        .select('id, onboarding_answers')
        .eq('id', existingBrandId)
        .single();

      if (brand?.onboarding_answers) {
        const a = brand.onboarding_answers as Partial<OnboardingData>;
        setData(prev => ({
          ...prev,
          ...a,
          tasksHelped: a.tasksHelped?.length ? a.tasksHelped : prev.tasksHelped,
          keyFeatures: a.keyFeatures?.length ? a.keyFeatures : prev.keyFeatures,
          useCases: a.useCases?.length ? a.useCases : prev.useCases,
          competitors: a.competitors?.length ? a.competitors : prev.competitors,
          uniqueSellingProps: a.uniqueSellingProps?.length ? a.uniqueSellingProps : prev.uniqueSellingProps,
        }));
        if (a.industry) setPrefilled(true);
      }

      // If brand already has generated prompts, jump straight to Step 14 (preview)
      const { data: existingPrompts } = await supabase
        .from('brand_prompts')
        .select('id, improved_prompt, raw_prompt, category')
        .eq('brand_id', existingBrandId)
        .in('status', ['improved', 'selected', 'inactive'])
        .order('created_at');

      if (existingPrompts && existingPrompts.length > 0) {
        setGeneratedPrompts(existingPrompts.map(p => ({
          id: p.id,
          text: p.improved_prompt || p.raw_prompt,
          category: p.category || 'General',
        })));
        setGenerationPhase('completed');
        setStep(14);
      }
    };
    loadExisting();
  }, [existingBrandId]);

  // ── Create or fetch brand after Step 1 ──────────────────────────────────────
  const ensureBrand = async (brandName: string, website: string): Promise<string | null> => {
    // Reuse existing if already set (just update name/domain)
    if (brandId) {
      await supabase
        .from('brands')
        .update({ name: brandName, domain: website })
        .eq('id', brandId);
      return brandId;
    }

    // Get JWT for the serverless function
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      console.error('[OnboardingPage] No session token — cannot create brand');
      return null;
    }

    // Call serverless function (uses service role to bypass RLS)
    try {
      const res = await fetch('/api/onboarding/create-brand', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ brandName, website }),
      });

      const result = await res.json();
      if (!result.success || !result.brandId) {
        console.error('[OnboardingPage] create-brand API error:', result.error);
        return null;
      }

      setBrandId(result.brandId);
      return result.brandId;
    } catch (err) {
      console.error('[OnboardingPage] create-brand fetch error:', err);
      return null;
    }
  };

  // ── Save current answers to Supabase ────────────────────────────────────────
  const saveAnswers = async (currentBrandId: string, currentData: OnboardingData) => {
    await supabase
      .from('brands')
      .update({ onboarding_answers: currentData })
      .eq('id', currentBrandId);
  };

  // ── Step 3: website analysis ─────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 3) return;

    const runAnalysis = async () => {
      setScanningIndex(0);
      setWebsiteAnalysisError(null);

      // Cycle scan messages while waiting
      const msgInterval = setInterval(() => {
        setScanningIndex(prev => Math.min(prev + 1, 3));
      }, 1800);

      try {
        const response = await fetch('/api/onboarding/analyze-website', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: data.website, language: data.language }),
        });

        const result = await response.json();
        clearInterval(msgInterval);

        if (result.success && result.brandData) {
          const bd = result.brandData;
          setData(prev => ({
            ...prev,
            industry: bd.industry || prev.industry,
            productCategory: bd.productCategory || prev.productCategory,
            problemSolved: bd.problemSolved || prev.problemSolved,
            tasksHelped: bd.tasksHelped?.length ? bd.tasksHelped.slice(0, 5) : prev.tasksHelped,
            goalFacilitated: bd.goalFacilitated || prev.goalFacilitated,
            keyFeatures: bd.keyFeatures?.length ? bd.keyFeatures.slice(0, 4) : prev.keyFeatures,
            useCases: bd.useCases?.length ? bd.useCases.slice(0, 4) : prev.useCases,
            competitors: bd.competitors?.length ? bd.competitors.slice(0, 4) : prev.competitors,
            uniqueSellingProps: bd.uniqueSellingProps?.length ? bd.uniqueSellingProps.slice(0, 4) : prev.uniqueSellingProps,
          }));
          setPrefilled(true);
        } else {
          setWebsiteAnalysisError('Could not auto-fill from website. Fill in the fields manually.');
        }
      } catch (err) {
        clearInterval(msgInterval);
        setWebsiteAnalysisError('Website analysis failed. Fill in the fields manually.');
      } finally {
        clearInterval(msgInterval);
        setTimeout(() => setStep(4), 600);
      }
    };

    runAnalysis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Navigation ───────────────────────────────────────────────────────────────
  const nextStep = async () => {
    if (step === 1) {
      // Create brand after step 1
      setIsSaving(true);
      await ensureBrand(data.brandName, data.website);
      setIsSaving(false);
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3); // Triggers website analysis
      return;
    }
    if (step === 4 && !isConfirmed) return;

    if (step === 4 && brandId) {
      setIsSaving(true);
      await saveAnswers(brandId, data);
      setIsSaving(false);
    }

    if (step === 13) {
      handleGenerate();
      return;
    }

    setStep(s => Math.min(totalSteps + 1, s + 1));
  };

  const prevStep = () => {
    if (step === 4) setStep(2);
    else setStep(s => Math.max(1, s - 1));
  };

  const handleInputChange = (field: keyof OnboardingData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const handleArrayChange = (field: keyof OnboardingData, index: number, value: string) => {
    setData(prev => {
      const arr = [...(prev[field] as string[])];
      arr[index] = value;
      return { ...prev, [field]: arr };
    });
  };

  // Auto-save on step change (steps 5–12)
  useEffect(() => {
    if (step >= 5 && step <= 12 && brandId) {
      saveAnswers(brandId, data);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Generate Prompts ─────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationPhase('analyzing');
    setGenerationStep(0);
    setGenerationError(null);

    // Ensure brand exists — create on-demand if step 1 creation somehow failed
    let currentBrandId = brandId;
    if (!currentBrandId) {
      currentBrandId = await ensureBrand(data.brandName || 'My Brand', data.website || '');
      if (!currentBrandId) {
        setGenerationError('Could not initialize brand profile. Please go back to step 1 and try again.');
        setIsGenerating(false);
        return;
      }
    }

    // Save final answers before generating
    await saveAnswers(currentBrandId, data);

    // Animate message steps while API calls run
    const t1 = setTimeout(() => setGenerationStep(1), 2000);
    const t2 = setTimeout(() => setGenerationStep(2), 5000);

    try {
      // Step 1: Generate 30 prompts
      const genRes = await fetch('/api/onboarding/generate-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: currentBrandId,
          language: data.language,
          industry: data.industry,
          productCategory: data.productCategory,
          problemSolved: data.problemSolved,
          tasksHelped: data.tasksHelped.filter(Boolean),
          goalFacilitated: data.goalFacilitated,
          keyFeatures: data.keyFeatures.filter(Boolean),
          useCases: data.useCases.filter(Boolean),
          uniqueSellingProps: data.uniqueSellingProps.filter(Boolean),
        }),
      });

      const genResult = await genRes.json();
      if (!genResult.success) throw new Error(genResult.error || 'Prompt generation failed');

      setGenerationStep(3);

      // Step 2: Improve all 30 prompts
      const improveRes = await fetch('/api/onboarding/improve-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: currentBrandId, language: data.language }),
      });

      const improveResult = await improveRes.json();

      // Use improved prompts if available, fallback to raw
      const promptsToShow: GeneratedPrompt[] = (
        improveResult.success && improveResult.prompts?.length
          ? improveResult.prompts
          : genResult.prompts || []
      ).map((p: any) => ({
        id: p.id,
        text: p.improved_prompt || p.raw_prompt,
        category: p.category || 'Discovery',
      }));

      clearTimeout(t1);
      clearTimeout(t2);
      setGeneratedPrompts(promptsToShow);
      setGenerationPhase('completed');
    } catch (err) {
      clearTimeout(t1);
      clearTimeout(t2);
      console.error('[OnboardingPage] Generation error:', err);
      setGenerationError(err instanceof Error ? err.message : 'Failed to generate prompts. Please try again.');
      setIsGenerating(false);
    }
  };

  // ── Finish Onboarding ────────────────────────────────────────────────────────
  const handleFinish = async (promptIds?: string[]) => {
    if (!brandId) return;
    setIsFinishing(true);
    setFinishError(null);

    try {
      const selectedIds = promptIds || generatedPrompts.map(p => p.id).filter(Boolean);

      const res = await fetch('/api/onboarding/complete-final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, selectedPromptIds: selectedIds }),
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to complete onboarding');

      // Trigger Hetzner webhook (non-blocking)
      const webhookUrl = import.meta.env.VITE_HETZNER_WEBHOOK_URL;
      const webhookSecret = import.meta.env.VITE_WEBHOOK_SECRET;
      if (webhookUrl) {
        fetch(`${webhookUrl}/run-onboarding-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, secret: webhookSecret }),
        }).catch(err => console.warn('[OnboardingPage] Webhook trigger failed:', err.message));
      }

      // Transition app to waiting screen
      onComplete();
    } catch (err) {
      console.error('[OnboardingPage] Finish error:', err);
      setFinishError(err instanceof Error ? err.message : 'Failed to finish. Please try again.');
      setIsFinishing(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  // Show edit prompts page
  if (view === 'edit-prompts') {
    return (
      <OnboardingEditPromptsPage
        initialPrompts={generatedPrompts}
        brandId={brandId!}
        language={data.language}
        onBack={() => setView('onboarding')}
        onFinish={handleFinish}
      />
    );
  }

  const inputClass = "w-full px-4 py-3 border border-[#E2E8F0] rounded-lg focus:ring-1 focus:ring-brand-brown/50 focus:border-brand-brown/50 outline-none font-normal text-[#020817] transition-all bg-white text-[15px]";
  const selectClass = "w-full px-4 py-3 border border-[#E2E8F0] rounded-lg focus:ring-1 focus:ring-brand-brown/50 focus:border-brand-brown/50 outline-none font-normal text-[#020817] transition-all bg-white text-[15px] appearance-none cursor-pointer pr-10";
  const textareaClass = "w-full px-4 py-3 border border-[#E2E8F0] rounded-lg focus:ring-1 focus:ring-brand-brown/50 focus:border-brand-brown/50 outline-none font-normal text-[#020817] transition-all bg-white text-[16px] min-h-[100px] resize-none";
  const questionClass = "text-xl font-semibold text-[#020817] mb-2 leading-tight";
  const subtextClass = "text-[13px] text-[#64748B] mb-3 font-normal leading-relaxed";

  const beVisibleBadge = prefilled ? (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 text-[9px] font-black uppercase tracking-widest mb-4 animate-fadeIn">
      <BeeIcon className="w-2.5 h-2.5 text-emerald-600 fill-emerald-600/20" />
      Be-Visible Pre-Filled
    </div>
  ) : null;

  const renderStepContent = () => {
    // ── Generating animation ───────────────────────────────────────────────
    if (isGenerating) {
      const genMessages = [
        'Analyzing your brand profile and market position...',
        'Synthesizing industry-specific visibility queries...',
        'Organizing prompts into strategic performance categories...',
        'Improving prompt quality with AI...',
      ];

      if (generationPhase === 'completed') {
        return (
          <div className="min-h-[400px] flex flex-col items-center justify-center text-center animate-fadeIn space-y-8">
            <div className="animate-fadeIn space-y-8 flex flex-col items-center">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100 shadow-sm text-emerald-600">
                <CheckCircle2 size={40} />
              </div>
              <div className="space-y-4">
                <h3 className="text-3xl font-black text-[#020817] tracking-tight">
                  We've completed generating your Be-visible prompts
                </h3>
                <p className="text-slate-500 font-medium max-w-md mx-auto leading-relaxed text-lg">
                  Review and edit them if needed to ensure your dashboard reflects your strategic goals.
                </p>
              </div>
              <div className="pt-4">
                <button
                  onClick={() => { setIsGenerating(false); setStep(14); }}
                  className="flex items-center gap-3 px-12 py-4 bg-brand-brown text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:brightness-110 transition-all shadow-2xl shadow-brand-brown/30 active:scale-95"
                >
                  Review prompts <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center text-center animate-fadeIn space-y-8">
          {generationError ? (
            <div className="space-y-4">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              <p className="text-red-600 font-medium">{generationError}</p>
              <button
                onClick={() => { setIsGenerating(false); setGenerationError(null); }}
                className="px-6 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-medium text-sm hover:bg-slate-50"
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <div className="w-20 h-20 border-4 border-slate-100 border-t-brand-brown rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <BrainCircuit size={32} className="text-brand-brown" />
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-2xl font-bold text-[#020817] tracking-tight">Generating your AI visibility strategy</h3>
                <p className="text-slate-500 font-medium max-w-xs mx-auto leading-relaxed">
                  We're using your onboarding information to create and categorize 30 prompts that determine your dashboard insights.
                </p>
                <div className="pt-4 h-6">
                  <p className="text-sm font-black text-brand-brown uppercase tracking-widest animate-pulse">
                    {genMessages[generationStep]}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      );
    }

    // ── Steps ──────────────────────────────────────────────────────────────
    switch (step) {
      case 1:
        return (
          <div className="animate-fadeIn space-y-10">
            <div><h2 className="text-2xl font-bold text-[#020817] mb-8 tracking-tight">Basic Brand Information</h2></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div>
                <h2 className={questionClass}>Brand name</h2>
                <p className={subtextClass}>What is your company or brand name?</p>
                <input type="text" autoFocus value={data.brandName}
                  onChange={(e) => handleInputChange('brandName', e.target.value)}
                  className={inputClass} placeholder="e.g. Acme Corp" />
              </div>
              <div>
                <h2 className={questionClass}>Website URL</h2>
                <p className={subtextClass}>Your primary digital property</p>
                <div className="relative">
                  <Globe size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input type="text" value={data.website}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                    className={`${inputClass} pl-10`} placeholder="https://example.com" />
                </div>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="animate-fadeIn space-y-10">
            <div><h2 className="text-2xl font-bold text-[#020817] mb-8 tracking-tight">Localization Settings</h2></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div>
                <h2 className={questionClass}>Language</h2>
                <p className={subtextClass}>Primary monitoring language — prompts will be generated in this language</p>
                <div className="relative">
                  <Languages size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                  <select value={data.language} onChange={(e) => handleInputChange('language', e.target.value)}
                    className={`${selectClass} pl-10`}>
                    {languages.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <h2 className={questionClass}>Region</h2>
                <p className={subtextClass}>Target market for AI visibility</p>
                <div className="relative">
                  <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                  <select value={data.region} onChange={(e) => handleInputChange('region', e.target.value)}
                    className={`${selectClass} pl-10`}>
                    {regions.map(region => <option key={region} value={region}>{region}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        );

      case 3: {
        const scanMessages = [
          'Creating queries your ideal customers are likely to ask',
          'Identifying your products, features, and use cases',
          'Mapping your brand\'s AI visibility landscape',
          'Preparing answers that will shape your dashboard insights',
        ];
        return (
          <div className="min-h-[300px] flex flex-col items-center justify-center text-center animate-fadeIn space-y-8">
            <div className="relative group">
              <HexagonIcon className="w-24 h-24 text-brand-brown opacity-80 animate-[spin_10s_linear_infinite]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 bg-brand-brown/5 rounded-full animate-ping opacity-20" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Search size={32} className="text-brand-brown animate-pulse" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-[#020817] tracking-tight">Analyzing your website</h3>
              <div className="h-4 flex items-center justify-center">
                <p key={scanningIndex} className="text-sm font-medium text-slate-500 animate-fadeInOut">
                  {scanMessages[scanningIndex]}
                </p>
              </div>
            </div>
          </div>
        );
      }

      case 4:
        return (
          <div className="animate-fadeIn space-y-8">
            {websiteAnalysisError ? (
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-3">
                <AlertCircle size={16} className="text-amber-500 shrink-0" />
                <p className="text-sm text-amber-700">{websiteAnalysisError}</p>
              </div>
            ) : (
              <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
                    <CheckCircle2 size={20} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-emerald-900 leading-tight">
                      Scan complete — we've pre-filled answers based on your website
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold text-[#020817] tracking-tight">Review pre-filled answers</h2>
              <p className="text-[15px] text-[#64748B] leading-relaxed font-normal">
                We scanned your website and pre-filled the upcoming onboarding questions. In the next steps, you'll review each answer and edit anything that isn't accurate.
              </p>
            </div>
            <div className="border border-slate-200 rounded-2xl p-8 bg-white space-y-8">
              <div>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                  <BarChart3 size={14} className="text-brand-brown opacity-80" /> Why this matters
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed font-normal">
                  Your confirmed answers are used to generate the prompts we ask AI models every day. These prompts determine what we measure, compare, and track in your dashboard.
                </p>
              </div>
              <div>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                  <Target size={14} className="text-brand-brown opacity-80" /> How your answers shape results
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed font-normal italic">
                  "For example, if you list competitors, your dashboard will include visibility insights and comparisons for those specific brands."
                </p>
              </div>
            </div>
            <div className="pt-6 border-t border-slate-100">
              <label className="flex items-start gap-4 cursor-pointer group">
                <div className="relative flex items-center mt-1">
                  <input type="checkbox" checked={isConfirmed}
                    onChange={(e) => setIsConfirmed(e.target.checked)}
                    className="appearance-none w-5 h-5 rounded border border-slate-300 checked:bg-[#0f172a] checked:border-[#0f172a] transition-all cursor-pointer" />
                  {isConfirmed && <CheckCircle2 size={12} className="absolute inset-0 m-auto text-white pointer-events-none" />}
                </div>
                <span className="text-[14px] text-[#020817] leading-relaxed font-medium select-none">
                  I understand that my confirmed answers will shape the prompts we generate and the visibility reports I see. I can edit them later.
                </span>
              </label>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="animate-fadeIn">
            {beVisibleBadge}
            <h2 className="text-2xl font-semibold text-[#020817] mb-2 leading-tight">Which industry are you in?</h2>
            <p className="text-[15px] text-[#64748B] mb-8 font-normal leading-relaxed">e.g. Software Development, Fintech, Automotive</p>
            <input type="text" autoFocus value={data.industry}
              onChange={(e) => handleInputChange('industry', e.target.value)} className={inputClass} />
          </div>
        );

      case 6:
        return (
          <div className="animate-fadeIn">
            {beVisibleBadge}
            <h2 className="text-2xl font-semibold text-[#020817] mb-2 leading-tight">What type of product/service do you offer?</h2>
            <p className="text-[15px] text-[#64748B] mb-8 font-normal leading-relaxed">e.g. Build Acceleration, CRM, Project Management</p>
            <input type="text" autoFocus value={data.productCategory}
              onChange={(e) => handleInputChange('productCategory', e.target.value)} className={inputClass} />
          </div>
        );

      case 7:
        return (
          <div className="animate-fadeIn">
            {beVisibleBadge}
            <h2 className="text-2xl font-semibold text-[#020817] mb-2 leading-tight">What is the core problem you solve?</h2>
            <p className="text-[15px] text-[#64748B] mb-8 font-normal leading-relaxed">Describe the main problem your product addresses</p>
            <textarea autoFocus value={data.problemSolved}
              onChange={(e) => handleInputChange('problemSolved', e.target.value)} className={textareaClass} />
          </div>
        );

      case 8:
        return (
          <div className="animate-fadeIn">
            {beVisibleBadge}
            <h2 className="text-2xl font-semibold text-[#020817] mb-2 leading-tight">What tasks does your product help users complete?</h2>
            <p className="text-[15px] text-[#64748B] mb-8 font-normal leading-relaxed">List the main tasks your product assists with</p>
            <div className="grid grid-cols-1 gap-3 max-h-[220px] overflow-y-auto custom-scrollbar pr-2">
              {(data.tasksHelped as string[]).map((task, i) => (
                <input key={i} type="text" value={task}
                  onChange={(e) => handleArrayChange('tasksHelped', i, e.target.value)}
                  placeholder={`Task ${i + 1}`}
                  className="w-full px-4 py-2 border border-[#E2E8F0] rounded-lg focus:ring-1 focus:ring-brand-brown/50 outline-none font-normal text-[#020817] transition-all bg-white text-sm" />
              ))}
            </div>
          </div>
        );

      case 9:
        return (
          <div className="animate-fadeIn">
            {beVisibleBadge}
            <h2 className="text-2xl font-semibold text-[#020817] mb-2 leading-tight">What goals can users achieve using your product?</h2>
            <p className="text-[15px] text-[#64748B] mb-8 font-normal leading-relaxed">e.g. Increase developer team productivity by 50%</p>
            <input type="text" autoFocus value={data.goalFacilitated}
              onChange={(e) => handleInputChange('goalFacilitated', e.target.value)} className={inputClass} />
          </div>
        );

      case 10:
        return (
          <div className="animate-fadeIn">
            {beVisibleBadge}
            <h2 className="text-2xl font-semibold text-[#020817] mb-2 leading-tight">Key features your product offers</h2>
            <p className="text-[15px] text-[#64748B] mb-8 font-normal leading-relaxed">List your most important product features</p>
            <div className="grid grid-cols-2 gap-4">
              {(data.keyFeatures as string[]).map((feat, i) => (
                <input key={i} type="text" value={feat}
                  onChange={(e) => handleArrayChange('keyFeatures', i, e.target.value)}
                  placeholder={`Feature ${i + 1}`}
                  className="w-full px-4 py-2.5 border border-[#E2E8F0] rounded-lg focus:ring-1 focus:ring-brand-brown/50 outline-none font-normal text-[#020817] text-sm" />
              ))}
            </div>
          </div>
        );

      case 11:
        return (
          <div className="animate-fadeIn">
            {beVisibleBadge}
            <h2 className="text-2xl font-semibold text-[#020817] mb-2 leading-tight">List up to 4 use cases your product supports:</h2>
            <p className="text-[15px] text-[#64748B] mb-8 font-normal leading-relaxed">List the main use cases for your product</p>
            <div className="grid grid-cols-1 gap-3">
              {(data.useCases as string[]).map((useCase, i) => (
                <input key={i} type="text" value={useCase}
                  onChange={(e) => handleArrayChange('useCases', i, e.target.value)}
                  placeholder={`Use Case #${i + 1}`}
                  className="w-full px-4 py-2.5 border border-[#E2E8F0] rounded-lg focus:ring-1 focus:ring-brand-brown/50 outline-none font-normal text-[#020817] text-sm" />
              ))}
            </div>
          </div>
        );

      case 12:
        return (
          <div className="animate-fadeIn">
            {beVisibleBadge}
            <h2 className="text-2xl font-semibold text-[#020817] mb-2 leading-tight">Who are your top competitors?</h2>
            <p className="text-[15px] text-[#64748B] mb-8 font-normal leading-relaxed">Provide up to 4 brands you compete with for visibility</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(data.competitors as string[]).map((comp, i) => (
                <div key={i} className="flex items-center gap-3">
                  <CompetitorLogo name={comp} />
                  <input type="text" value={comp}
                    onChange={(e) => handleArrayChange('competitors', i, e.target.value)}
                    placeholder="Brand name"
                    className="w-full px-4 py-2.5 border border-[#E2E8F0] rounded-lg focus:ring-1 focus:ring-brand-brown/50 outline-none font-normal text-[#020817] text-sm" />
                </div>
              ))}
            </div>
          </div>
        );

      case 13:
        return (
          <div className="animate-fadeIn">
            {beVisibleBadge}
            <h2 className="text-2xl font-semibold text-[#020817] mb-2 leading-tight">What makes your product better than competitors?</h2>
            <p className="text-[15px] text-[#64748B] mb-8 font-normal leading-relaxed">List your unique selling propositions</p>
            <div className="grid grid-cols-1 gap-3">
              {(data.uniqueSellingProps as string[]).slice(0, 4).map((usp, i) => (
                <input key={i} type="text" value={usp}
                  onChange={(e) => handleArrayChange('uniqueSellingProps', i, e.target.value)}
                  placeholder={`USP #${i + 1}`}
                  className="w-full px-4 py-2.5 border border-[#E2E8F0] rounded-lg focus:ring-1 focus:ring-brand-brown/50 outline-none font-normal text-[#020817] text-sm" />
              ))}
            </div>
          </div>
        );

      case 14: {
        // Group prompts by category
        const groupedMap = generatedPrompts.reduce((acc, p) => {
          if (!acc[p.category]) acc[p.category] = [];
          acc[p.category].push(p);
          return acc;
        }, {} as Record<string, GeneratedPrompt[]>);

        const entries = Object.entries(groupedMap);
        const leftCol = entries.filter((_, i) => i % 2 === 0);
        const rightCol = entries.filter((_, i) => i % 2 !== 0);

        const renderCategoryBox = (category: string, prompts: GeneratedPrompt[]) => (
          <div key={category}
            className="bg-slate-50 border border-slate-200 rounded-[32px] p-6 space-y-4 h-fit transition-all hover:border-slate-300 relative">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-2">
              <span className="text-[11px] font-black text-brand-brown uppercase tracking-widest px-3 py-1 bg-brand-brown/5 rounded-lg border border-brand-brown/10">
                {category}
              </span>
              <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[10px] uppercase tracking-tighter">
                <Zap size={12} className="text-brand-brown" />
                {prompts.length} Queries
              </div>
            </div>
            <div className="space-y-2.5">
              {prompts.map((p, idx) => (
                <div key={p.id || idx}
                  className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[9px] font-black text-slate-400 group-hover:text-brand-brown transition-colors">{idx + 1}</span>
                    </div>
                    <p className="text-[13px] font-bold text-slate-600 leading-relaxed group-hover:text-slate-900 transition-colors">
                      {p.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

        return (
          <div className="animate-fadeIn space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black text-[#020817] tracking-tight">Prompts Preview</h2>
              <p className="text-slate-500 font-medium">
                Review your {generatedPrompts.length} AI visibility prompts organized by category.
              </p>
            </div>
            <div className="flex flex-col md:flex-row gap-6 max-h-[500px] overflow-y-auto custom-scrollbar pr-4 content-start">
              <div className="flex-1 flex flex-col gap-6">
                {leftCol.map(([category, prompts]) => renderCategoryBox(category, prompts))}
              </div>
              <div className="flex-1 flex flex-col gap-6">
                {rightCol.map(([category, prompts]) => renderCategoryBox(category, prompts))}
              </div>
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center py-8 px-4">
      <div className="w-full max-w-4xl onboarding-container">
        <div className="bg-white rounded-[32px] border border-[#E2E8F0] shadow-2xl overflow-visible flex flex-col min-h-[600px]">
          <div className="p-12">
            {/* Header */}
            <div className="pb-6 flex items-start justify-between">
              <div className="space-y-1">
                <h1 className="text-3xl font-semibold text-[#020817] tracking-tight">Brand Onboarding</h1>
                {step <= totalSteps && step !== 3 && !isGenerating && (
                  <p className="text-[13px] font-medium text-[#64748B]">
                    Step {step === 4 ? 'Review' : step > 4 ? step - 2 : step} of {totalSteps - 2}
                  </p>
                )}
                {step === 3 && !isGenerating && (
                  <p className="text-[13px] font-semibold text-brand-brown flex items-center gap-2">
                    <RefreshCw size={14} className="animate-spin" /> Deep-scanning your domain...
                  </p>
                )}
                {isGenerating && (
                  <p className="text-[13px] font-semibold text-brand-brown flex items-center gap-2">
                    <RefreshCw size={14} className="animate-spin" /> Synthesizing visibility scope...
                  </p>
                )}
              </div>
              <div className="flex items-center gap-8">
                <span className="text-[13px] font-bold text-[#64748B] tabular-nums">
                  {step > totalSteps ? '100' : progressPercentage}% Complete
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-10">
              <div className="h-[6px] w-full bg-[#F1F5F9] rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-brown transition-all duration-1000 ease-out"
                  style={{ width: `${step > totalSteps ? 100 : progressPercentage}%` }}
                />
              </div>
            </div>

            {/* Step content */}
            <div className="mb-12">{renderStepContent()}</div>

            {/* Navigation footer */}
            <div className={`flex items-center justify-between pt-10 border-t border-slate-50 ${isGenerating ? 'opacity-0 pointer-events-none' : ''}`}>
              <div className="flex-1">
                {(step > 1 && step <= totalSteps && step !== 3) ? (
                  <button onClick={prevStep}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-[#E2E8F0] text-[#475569] font-bold hover:bg-white hover:shadow-sm transition-all text-[14px]">
                    <ArrowLeft size={16} /> Previous
                  </button>
                ) : <div />}
              </div>

              <div className="flex-1 flex justify-end gap-4">
                {/* Steps 1–12: Next */}
                {step < totalSteps && step !== 3 && (
                  <button onClick={nextStep}
                    disabled={step === 4 && !isConfirmed || isSaving}
                    className={`flex items-center gap-2 px-10 py-3 bg-[#020817] text-white rounded-xl font-semibold hover:brightness-125 transition-all text-[15px] group shadow-lg shadow-slate-900/10 ${
                      (step === 4 && !isConfirmed) || isSaving ? 'opacity-40 cursor-not-allowed' : ''
                    }`}>
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                    {step === 4 ? 'Start reviewing answers' : 'Next'} <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                )}

                {/* Step 13: Generate */}
                {step === totalSteps && (
                  <button onClick={handleGenerate}
                    className="flex items-center gap-2 px-10 py-3 bg-brand-brown text-white rounded-xl font-semibold hover:brightness-110 transition-all text-[15px] group shadow-xl shadow-brand-brown/20">
                    Generate prompts <Sparkles size={16} />
                  </button>
                )}

                {/* Step 14 (Prompt Preview): Edit | Finish */}
                {step > totalSteps && (
                  <>
                    <button
                      onClick={() => setView('edit-prompts')}
                      className="flex items-center gap-2 px-6 py-3 border-2 border-brand-brown text-brand-brown rounded-xl font-semibold hover:bg-brand-brown hover:text-white transition-all text-[14px]">
                      <Edit3 size={16} /> Edit prompts
                    </button>

                    <button
                      onClick={() => handleFinish()}
                      disabled={isFinishing}
                      className="flex items-center gap-2 px-6 py-3 bg-[#020817] text-white rounded-xl font-semibold hover:brightness-125 transition-all text-[14px] shadow-lg shadow-slate-900/10 disabled:opacity-60">
                      {isFinishing ? <Loader2 size={16} className="animate-spin" /> : null}
                      Finish <ArrowRight size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Generation error (shown when not in generating animation) */}
            {generationError && !isGenerating && (
              <p className="mt-4 text-sm text-red-600 text-center">{generationError}</p>
            )}

            {/* Finish error */}
            {finishError && (
              <p className="mt-4 text-sm text-red-600 text-center">{finishError}</p>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .onboarding-container {
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(5px); }
          10% { opacity: 1; transform: translateY(0); }
          90% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-5px); }
        }
        .animate-fadeInOut { animation: fadeInOut 1.5s ease-in-out forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
      `}</style>
    </div>
  );
};
