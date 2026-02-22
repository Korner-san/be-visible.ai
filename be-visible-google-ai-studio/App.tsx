
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './components/AuthContext';
import { SignInPage } from './components/SignInPage';
import { SignUpPage } from './components/SignUpPage';
import { AuthCallbackPage } from './components/AuthCallbackPage';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { CitationsPage } from './components/CitationsPage';
import { AcademyPage } from './components/AcademyPage';
import { OverviewPage } from './components/OverviewPage';
import { ImprovePage } from './components/ImprovePage';
import { CompetitorsPage } from './components/CompetitorsPage';
import { PromptsPage } from './components/PromptsPage';
import { ManagePromptsPage } from './components/ManagePromptsPage';
import { ManageCompetitorsPage } from './components/ManageCompetitorsPage';
import { IntegrationsPage } from './components/IntegrationsPage';
import { OnboardingPage } from './components/OnboardingPage';
import { OnboardingEditPromptsPage } from './components/OnboardingEditPromptsPage';
import { WaitingScreen } from './components/WaitingScreen';
import { BillingPage } from './components/BillingPage';
import { SupportPage } from './components/SupportPage';
import { UserSettingsPage } from './components/UserSettingsPage';
import { ContentPage } from './components/ContentPage';
import { TimeRange, PromptStats, Competitor } from './types';
import { supabase } from './lib/supabase';

// ─── 5-State App View Machine ───────────────────────────────────────────────
type AppView =
  | 'AUTH_LOADING'           // Determining auth + brand state
  | 'AUTH_CALLBACK'          // Handling email confirmation redirect
  | 'NOT_AUTHENTICATED'      // No session → show sign in / sign up
  | 'AUTHENTICATED_NO_BRAND' // Logged in, no brand → onboarding
  | 'AUTHENTICATED_ONBOARDING_IN_PROGRESS' // Has incomplete brand → onboarding
  | 'AUTHENTICATED_ONBOARDING_DONE_NO_REPORT' // Complete but report not ready → waiting
  | 'AUTHENTICATED_READY';   // Fully set up → dashboard

interface UserBrand {
  id: string;
  name: string;
  domain?: string;
  onboarding_completed: boolean;
  first_report_status: string | null;
}

const initialCompetitors: Competitor[] = [
  { id: 'c1', name: 'GitLab CI', website: 'gitlab.com', color: '#874B34' },
  { id: 'c2', name: 'CircleCI', website: 'circleci.com', color: '#BC633A' },
  { id: 'c3', name: 'Travis CI', website: 'travis-ci.com', color: '#E7B373' },
  { id: 'c4', name: 'Jenkins', website: 'jenkins.io', color: '#963D1F' },
];

function AppContent() {
  const { user, loading: authLoading, signOut } = useAuth();

  // ── App-level routing state ──────────────────────────────────────────────
  const [appView, setAppView] = useState<AppView>('AUTH_LOADING');
  const [authSubView, setAuthSubView] = useState<'signin' | 'signup'>('signin');
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  const [activeBrand, setActiveBrand] = useState<UserBrand | null>(null);
  const [brands, setBrands] = useState<UserBrand[]>([]);

  // ── Dashboard state ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<string>('Visibility');
  const [timeRange, setTimeRange] = useState<TimeRange>(TimeRange.THIRTY_DAYS);
  const [academyArticleId, setAcademyArticleId] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [prompts, setPrompts] = useState<PromptStats[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>(initialCompetitors);

  // ── Detect auth callback (email confirmation) ────────────────────────────
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    if (
      hash.includes('access_token') ||
      hash.includes('type=recovery') ||
      params.get('type') === 'signup' ||
      params.get('type') === 'magiclink'
    ) {
      setAppView('AUTH_CALLBACK');
    }
  }, []);

  // ── Check for forceOnboarding dev override ───────────────────────────────
  const forceOnboarding = new URLSearchParams(window.location.search).get('forceOnboarding') === '1';

  // ── Core routing decision (runs whenever auth state or brands change) ────
  const determineAppView = useCallback(async () => {
    // Auth callback is handled separately — don't override
    if (appView === 'AUTH_CALLBACK') return;

    if (authLoading) {
      setAppView('AUTH_LOADING');
      return;
    }

    if (!user) {
      setAppView('NOT_AUTHENTICATED');
      return;
    }

    // Authenticated — fetch brands to determine state
    try {
      const { data: brandsData, error } = await supabase
        .from('brands')
        .select('id, name, domain, onboarding_completed, first_report_status')
        .eq('owner_user_id', user.id)
        .eq('is_demo', false)
        .order('created_at', { ascending: false });

      if (error || !brandsData || brandsData.length === 0) {
        setBrands([]);
        setActiveBrandId(null);
        setActiveBrand(null);
        setAppView('AUTHENTICATED_NO_BRAND');
        return;
      }

      setBrands(brandsData);

      // Admin/dev override
      if (forceOnboarding) {
        setAppView('AUTHENTICATED_NO_BRAND');
        return;
      }

      // Priority: completed brand wins over any pending brand
      const completedBrands = brandsData.filter(b => b.onboarding_completed);
      const incompleteBrands = brandsData.filter(b => !b.onboarding_completed);

      if (completedBrands.length > 0) {
        const primary = completedBrands[0];
        setActiveBrandId(primary.id);
        setActiveBrand(primary);

        // Only hold on WaitingScreen if report is actively queued/running.
        // null (old brands) and 'succeeded'/'failed' all go straight to dashboard.
        const waitingStatuses = ['queued', 'running'];
        if (waitingStatuses.includes(primary.first_report_status ?? '')) {
          // Fallback: even if status says running/queued, check if this brand
          // already has completed daily_reports (old brands, stale status).
          const { data: existingReports } = await supabase
            .from('daily_reports')
            .select('id')
            .eq('brand_id', primary.id)
            .eq('status', 'completed')
            .limit(1);

          if (existingReports && existingReports.length > 0) {
            // Brand already has a completed report — go straight to dashboard
            setAppView('AUTHENTICATED_READY');
          } else {
            setAppView('AUTHENTICATED_ONBOARDING_DONE_NO_REPORT');
          }
        } else {
          setAppView('AUTHENTICATED_READY');
        }
      } else if (incompleteBrands.length > 0) {
        const pending = incompleteBrands[0];
        setActiveBrandId(pending.id);
        setActiveBrand(pending);
        setAppView('AUTHENTICATED_ONBOARDING_IN_PROGRESS');
      } else {
        setAppView('AUTHENTICATED_NO_BRAND');
      }
    } catch (err) {
      console.error('Error determining app view:', err);
      setAppView('AUTHENTICATED_NO_BRAND');
    }
  }, [user, authLoading, forceOnboarding, appView]);

  useEffect(() => {
    determineAppView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // ── Fetch real prompts once brand is known ───────────────────────────────
  useEffect(() => {
    if (!activeBrandId || appView !== 'AUTHENTICATED_READY') return;

    const fetchPrompts = async () => {
      const { data, error } = await supabase
        .from('brand_prompts')
        .select('id, raw_prompt, improved_prompt, category, status, created_at')
        .eq('brand_id', activeBrandId)
        .neq('status', 'inactive')
        .order('category')
        .order('created_at');

      if (error || !data) return;

      // Transform brand_prompts rows into PromptStats shape
      const transformed: PromptStats[] = data.map((p, i) => ({
        id: p.id,
        text: p.improved_prompt || p.raw_prompt,
        category: (p.category || 'General').toUpperCase(),
        isActive: p.status === 'selected' || p.status === 'active',
        visibilityScore: 0,
        visibilityTrend: 0,
        avgPosition: 0,
        citationShare: 0,
        citations: 0,
        citationTrend: 0,
        lastRun: '',
        history: [],
        language: 'EN',
        regions: [],
        tags: [],
        platforms: [],
        lastUpdated: p.created_at,
      }));

      setPrompts(transformed);
    };

    fetchPrompts();
  }, [activeBrandId, appView]);

  // ── Callback: onboarding completed → re-run routing ─────────────────────
  const handleOnboardingComplete = useCallback(() => {
    // Re-determine view after onboarding finishes (will land on DONE_NO_REPORT)
    determineAppView();
  }, [determineAppView]);

  // ── Callback: report ready → move to dashboard ───────────────────────────
  const handleReportReady = useCallback(() => {
    if (activeBrand) {
      setActiveBrand(prev => prev ? { ...prev, first_report_status: 'succeeded' } : prev);
    }
    setAppView('AUTHENTICATED_READY');
  }, [activeBrand]);

  // ────────────────────────────────────────────────────────────────────────
  // RENDER TREE
  // ────────────────────────────────────────────────────────────────────────

  // 1. Auth callback (email confirmation link)
  if (appView === 'AUTH_CALLBACK') {
    return (
      <AuthCallbackPage
        onSuccess={() => {
          // Clear hash/params then re-run routing
          window.history.replaceState(null, '', window.location.pathname);
          setAppView('AUTH_LOADING');
          // Small delay so supabase session propagates
          setTimeout(() => determineAppView(), 500);
        }}
      />
    );
  }

  // 2. Loading while checking auth / brands
  if (appView === 'AUTH_LOADING') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 bg-brand-brown rounded-xl flex items-center justify-center mx-auto shadow-sm">
            <span className="text-white font-bold text-xl">B</span>
          </div>
          <div className="w-8 h-8 border-4 border-gray-200 border-t-brand-brown rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500">Loading your account…</p>
        </div>
      </div>
    );
  }

  // 3. Not authenticated
  if (appView === 'NOT_AUTHENTICATED') {
    if (authSubView === 'signup') {
      return <SignUpPage onSwitchToSignIn={() => setAuthSubView('signin')} />;
    }
    return <SignInPage onSwitchToSignUp={() => setAuthSubView('signup')} />;
  }

  // 4. Onboarding — full screen, no sidebar/header
  if (
    appView === 'AUTHENTICATED_NO_BRAND' ||
    appView === 'AUTHENTICATED_ONBOARDING_IN_PROGRESS'
  ) {
    return (
      <OnboardingPage
        existingBrandId={appView === 'AUTHENTICATED_ONBOARDING_IN_PROGRESS' ? activeBrandId : null}
        onComplete={handleOnboardingComplete}
        onNavigate={(tab) => {
          // Allow navigating away to dashboard tabs from inside onboarding if needed
          setAppView('AUTHENTICATED_READY');
          setActiveTab(tab);
        }}
      />
    );
  }

  // 5. Waiting for first report (post-onboarding)
  if (appView === 'AUTHENTICATED_ONBOARDING_DONE_NO_REPORT') {
    return (
      <WaitingScreen
        brandId={activeBrandId!}
        brandName={activeBrand?.name || ''}
        onReportReady={handleReportReady}
      />
    );
  }

  // 6. Fully authenticated + ready — render dashboard
  // ── Standalone full-page views ───────────────────────────────────────────
  if (activeTab === 'Manage Prompts') {
    return (
      <ManagePromptsPage
        prompts={prompts}
        setPrompts={setPrompts}
        onBack={() => setActiveTab('Prompts')}
      />
    );
  }

  const handleNavigateToAcademy = (articleId: string) => {
    setActiveTab('Academy');
    setAcademyArticleId(articleId);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab !== 'Academy') setAcademyArticleId(null);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setIsScrolled(e.currentTarget.scrollTop > 10);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Getting Started':
        return <OverviewPage onNavigate={handleTabChange} />;
      case 'Competitors':
        return <CompetitorsPage brandId={activeBrandId} timeRange={timeRange} />;
      case 'Manage Competitors':
        return <ManageCompetitorsPage competitors={competitors} setCompetitors={setCompetitors} />;
      case 'Citations':
        return <CitationsPage onNavigateToAcademy={handleNavigateToAcademy} brandId={activeBrandId} timeRange={timeRange} />;
      case 'Prompts':
        return <PromptsPage prompts={prompts} onNavigateToManage={() => setActiveTab('Manage Prompts')} />;
      case 'Improve':
        return <ImprovePage />;
      case 'Integrations':
        return <IntegrationsPage />;
      case 'Academy':
        return <AcademyPage initialArticleId={academyArticleId} />;
      case 'Billing':
        return <BillingPage />;
      case 'Support':
        return <SupportPage />;
      case 'User Settings':
        return <UserSettingsPage />;
      case 'Content':
        return <ContentPage brandId={activeBrandId} timeRange={timeRange} />;
      default:
        return <Dashboard timeRange={timeRange} brandId={activeBrandId} onNavigateToPrompts={() => setActiveTab('Prompts')} />;
    }
  };

  return (
    <div className="flex h-screen w-full bg-gray-50">
      <Sidebar activeTab={activeTab} setActiveTab={handleTabChange} onSignOut={signOut} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Header
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          isScrolled={isScrolled}
        />
        <main
          className="flex-1 overflow-y-auto px-4 md:px-6 py-4 pt-20 scroll-smooth"
          onScroll={handleScroll}
        >
          <div className="max-w-[1280px] mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return <AppContent />;
}
