
import React, { useState, useEffect } from 'react';
import { useAuth } from './components/AuthContext';
import { SignInPage } from './components/SignInPage';
import { SignUpPage } from './components/SignUpPage';
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
import { BillingPage } from './components/BillingPage';
import { SupportPage } from './components/SupportPage';
import { UserSettingsPage } from './components/UserSettingsPage';
import { ContentPage } from './components/ContentPage';
import { TimeRange, PromptStats, PromptHistoryPoint, Competitor } from './types';
import { supabase } from './lib/supabase';

const mockHistory: PromptHistoryPoint[] = [
  { date: 'Jan 08', visibility: 82, avgPosition: 2.1, citationShare: 22.1, mentions: 18 },
  { date: 'Jan 09', visibility: 85, avgPosition: 1.9, citationShare: 24.5, mentions: 22 },
  { date: 'Jan 10', visibility: 84, avgPosition: 2.0, citationShare: 23.8, mentions: 20 },
  { date: 'Jan 11', visibility: 88, avgPosition: 1.7, citationShare: 26.2, mentions: 25 },
  { date: 'Jan 12', visibility: 90, avgPosition: 1.5, citationShare: 27.8, mentions: 27 },
  { date: 'Jan 13', visibility: 92, avgPosition: 1.4, citationShare: 28.4, mentions: 28 },
];

const initialPrompts: PromptStats[] = [
  {
    id: 'p1',
    text: "Compare Incredibuild vs. GitLab for C++ build acceleration",
    category: "COMPETITIVE COMPARISON",
    isActive: true,
    visibilityScore: 92, visibilityTrend: 4.2, avgPosition: 1.4, citationShare: 28.4, citations: 28, citationTrend: 1.2,
    lastRun: "JAN 14, 2025 • 14:20", history: mockHistory,
    language: "EN", regions: ["US", "EU"], tags: ["Competitor", "Build"], platforms: ["gpt-4", "gemini", "claude"], lastUpdated: "2h ago"
  },
  {
    id: 'p2',
    text: "How to optimize Unreal Engine 5 compile times with distributed computing?",
    category: "TECHNICAL HOW-TO",
    isActive: true,
    visibilityScore: 88, visibilityTrend: -1.5, avgPosition: 1.2, citationShare: 32.1, citations: 45, citationTrend: -0.5,
    lastRun: "JAN 13, 2025 • 09:45", history: mockHistory.map(h => ({ ...h, visibility: h.visibility - 4, mentions: h.mentions + 10 })),
    language: "EN", regions: ["GLOBAL"], tags: ["Technical", "UE5"], platforms: ["gpt-4", "gemini"], lastUpdated: "5h ago"
  },
  {
    id: 'tpd1',
    text: "What software can accelerate build times for game development?",
    category: "TOOLS & PLATFORMS DISCOVERY",
    isActive: true,
    visibilityScore: 85, visibilityTrend: 2.1, avgPosition: 2.3, citationShare: 18.5, citations: 34, citationTrend: 0.8,
    lastRun: "JAN 14, 2025 • 10:00", history: mockHistory,
    language: "EN", regions: ["US"], tags: ["Discovery"], platforms: ["gpt-4"], lastUpdated: "1d ago"
  },
  {
    id: 'pbs1',
    text: "What are the best solutions for reducing compilation times in Visual Studio?",
    category: "PERFORMANCE & BUILD SPEED",
    isActive: true,
    visibilityScore: 93, visibilityTrend: 6.1, avgPosition: 1.5, citationShare: 31.5, citations: 58, citationTrend: 1.8,
    lastRun: "JAN 14, 2025 • 12:40", history: mockHistory,
    language: "EN", regions: ["US", "UK"], tags: ["VS", "Performance"], platforms: ["gpt-4", "gemini", "claude"], lastUpdated: "4h ago"
  }
];

const initialCompetitors: Competitor[] = [
  { id: 'c1', name: 'GitLab CI', website: 'gitlab.com', color: '#874B34' },
  { id: 'c2', name: 'CircleCI', website: 'circleci.com', color: '#BC633A' },
  { id: 'c3', name: 'Travis CI', website: 'travis-ci.com', color: '#E7B373' },
  { id: 'c4', name: 'Jenkins', website: 'jenkins.io', color: '#963D1F' },
];

interface UserBrand {
  id: string;
  name: string;
}

function AppContent() {
  const { user, loading, signOut } = useAuth();
  const [authView, setAuthView] = useState<'signin' | 'signup'>('signin');
  const [activeTab, setActiveTab] = useState<string>('Visibility');
  const [timeRange, setTimeRange] = useState<TimeRange>(TimeRange.THIRTY_DAYS);
  const [academyArticleId, setAcademyArticleId] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [prompts, setPrompts] = useState<PromptStats[]>(initialPrompts);
  const [competitors, setCompetitors] = useState<Competitor[]>(initialCompetitors);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  const [brands, setBrands] = useState<UserBrand[]>([]);

  // Fetch user's brands after auth
  useEffect(() => {
    if (!user) return;

    const fetchBrands = async () => {
      try {
        const { data, error } = await supabase
          .from('brands')
          .select('id, name')
          .eq('owner_user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching brands:', error);
          return;
        }

        if (data && data.length > 0) {
          setBrands(data);
          setActiveBrandId(data[0].id);
        }
      } catch (err) {
        console.error('Brand fetch error:', err);
      }
    };

    fetchBrands();
  }, [user]);

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 bg-brand-brown rounded-xl flex items-center justify-center mx-auto shadow-sm">
            <span className="text-white font-bold text-xl">B</span>
          </div>
          <div className="w-8 h-8 border-4 border-gray-200 border-t-brand-brown rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  // Show auth pages if not logged in
  if (!user) {
    if (authView === 'signup') {
      return <SignUpPage onSwitchToSignIn={() => setAuthView('signin')} />;
    }
    return <SignInPage onSwitchToSignUp={() => setAuthView('signup')} />;
  }

  // ---- Authenticated: show the dashboard ----

  const handleNavigateToAcademy = (articleId: string) => {
    setActiveTab('Academy');
    setAcademyArticleId(articleId);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab !== 'Academy') {
      setAcademyArticleId(null);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    setIsScrolled(scrollTop > 10);
  };

  // Standalone Manage Prompts View
  if (activeTab === 'Manage Prompts') {
    return (
      <ManagePromptsPage
        prompts={prompts}
        setPrompts={setPrompts}
        onBack={() => setActiveTab('Prompts')}
      />
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'Getting Started':
        return <OverviewPage onNavigate={handleTabChange} />;
      case 'Competitors':
        return <CompetitorsPage brandId={activeBrandId} timeRange={timeRange} />;
      case 'Manage Competitors':
        return <ManageCompetitorsPage competitors={competitors} setCompetitors={setCompetitors} />;
      case 'Citations':
        return <CitationsPage onNavigateToAcademy={handleNavigateToAcademy} />;
      case 'Prompts':
        return <PromptsPage prompts={prompts} onNavigateToManage={() => setActiveTab('Manage Prompts')} />;
      case 'Improve':
        return <ImprovePage />;
      case 'Integrations':
        return <IntegrationsPage />;
      case 'Onboarding':
        return <OnboardingPage onNavigate={handleTabChange} />;
      case 'Academy':
        return <AcademyPage initialArticleId={academyArticleId} />;
      case 'Billing':
        return <BillingPage />;
      case 'Support':
        return <SupportPage />;
      case 'User Settings':
        return <UserSettingsPage />;
      case 'Content':
        return <ContentPage />;
      default:
        return <Dashboard timeRange={timeRange} brandId={activeBrandId} />;
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
