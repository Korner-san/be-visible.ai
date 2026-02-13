import React, { useState, useEffect } from 'react';
import { 
  X, Target, BarChart2, Lightbulb, CheckSquare, ArrowRight, ArrowLeft, 
  Rocket, Search, CheckCircle2, Star, MapPin, Calendar, Users, ShieldCheck 
} from 'lucide-react';

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  domain: string;
  onNavigateToAcademy?: (articleId: string) => void;
}

type ViewMode = 'slides' | 'searching' | 'partner';

export const ActionModal: React.FC<ActionModalProps> = ({ isOpen, onClose, domain, onNavigateToAcademy }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('slides');
  const [searchStep, setSearchStep] = useState(0);
  const totalSlides = 5;

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setCurrentSlide(0);
      setViewMode('slides');
      setSearchStep(0);
    }
  }, [isOpen]);

  // Handle auto-progression for search simulation
  useEffect(() => {
    if (viewMode === 'searching') {
      const timers = [
        setTimeout(() => setSearchStep(1), 800),
        setTimeout(() => setSearchStep(2), 1600),
        setTimeout(() => setViewMode('partner'), 2500),
      ];
      return () => timers.forEach(clearTimeout);
    }
  }, [viewMode]);

  if (!isOpen) return null;

  const nextSlide = () => {
    if (currentSlide < totalSlides - 1) setCurrentSlide(currentSlide + 1);
  };

  const prevSlide = () => {
    if (currentSlide > 0) setCurrentSlide(currentSlide - 1);
  };

  const startPartnerSearch = () => {
    setViewMode('searching');
  };

  const handleDIYClick = () => {
    if (onNavigateToAcademy) {
      let guideId = 'generic-visibility-guide';
      const lowerDomain = domain.toLowerCase();
      
      if (lowerDomain.includes('reddit')) {
        guideId = 'reddit-visibility-guide';
      } else if (lowerDomain.includes('stackoverflow')) {
        guideId = 'stackoverflow-authority';
      } else if (lowerDomain.includes('github')) {
        guideId = 'github-readme-seo';
      }
      // Add more specific mappings here as needed.
      // If no match, it defaults to 'generic-visibility-guide'
      
      onNavigateToAcademy(guideId);
    }
    onClose();
  };

  const renderSlideContent = () => {
    switch (currentSlide) {
      case 0:
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <Target className="w-6 h-6 text-blue-600" />
              </div>
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-slate-900">{domain} Visibility Scope – Incredibuild</h3>
                <p className="text-slate-600 leading-relaxed">
                  Close the AI visibility gap on {domain} by targeting the communities and discussions that influence AI answers.
                </p>
              </div>
            </div>
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-100">
               <div className="h-32 flex items-center justify-center text-slate-400 text-sm italic border-2 border-dashed border-slate-200 rounded-lg">
                 Dynamic Scope Preview Visualization for {domain}
               </div>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <BarChart2 className="w-6 h-6 text-blue-600" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-900">Influence Snapshot</h3>
                <p className="text-sm text-slate-500">Understanding where {domain} discussions are driving AI citations</p>
              </div>
            </div>
            
            <div className="bg-slate-50 rounded-xl p-6">
              <h4 className="text-sm font-medium text-slate-500 mb-4 text-center">Citation Distribution by Theme</h4>
              <div className="space-y-3">
                {[
                  { name: 'Tools & Workflow', val: '35%' },
                  { name: 'Build Optimization', val: '28%' },
                  { name: 'CI/CD', val: '18%' },
                  { name: 'Hardware/PC Building', val: '12%' },
                  { name: 'Other', val: '7%' },
                ].map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 font-medium">{item.name}</span>
                    <span className="text-slate-900 font-bold">{item.val}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500 italic px-2">
              {domain} threads driving AI answers cluster around: Tools & Workflow, Build Optimization, CI/CD, Hardware/PC Building, and Other.
            </p>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <Lightbulb className="w-6 h-6 text-blue-600" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-900">Key Themes & Gaps</h3>
                <p className="text-sm text-slate-500">Where developers are asking questions that Incredibuild can answer</p>
              </div>
            </div>

            <div className="space-y-4 pl-2">
              {[
                { color: 'bg-blue-500', title: 'Tools & Workflow', desc: 'Developers ask for tools that automate or speed up work' },
                { color: 'bg-green-500', title: 'Build Optimization', desc: 'Reducing long compile/build times' },
                { color: 'bg-purple-500', title: 'CI/CD Platforms', desc: 'Scalable pipelines for large teams' },
                { color: 'bg-orange-500', title: 'Hardware/PC Building', desc: 'Motherboard/future-proofing discussions' },
                { color: 'bg-slate-400', title: 'Other', desc: 'Invoicing, data-viz, productivity' },
              ].map((item) => (
                <div key={item.title} className="flex gap-4">
                   <div className={`w-1 rounded-full shrink-0 ${item.color}`} />
                   <div>
                     <h4 className="text-sm font-bold text-slate-800">{item.title}</h4>
                     <p className="text-xs text-slate-500">{item.desc}</p>
                   </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-start gap-4">
               <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <CheckSquare className="w-6 h-6 text-blue-600" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-900">Action Plan</h3>
                <p className="text-sm text-slate-500">4-step roadmap to improve your {domain} visibility</p>
              </div>
            </div>

            <div className="space-y-5">
              {[
                { id: 1, title: 'Establish presence', desc: 'Official account + karma / authority' },
                { id: 2, title: 'Prioritize communities/topics', desc: 'Identify high-impact discussions and keywords' },
                { id: 3, title: 'Engage & share value', desc: 'Meaningful interactions (answers, case studies, tutorials)' },
                { id: 4, title: 'Monitor & refine', desc: 'Track mentions + AI citation impact, adjust focus' },
              ].map((step) => (
                <div key={step.id} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-sm shrink-0">
                    {step.id}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">{step.title}</h4>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <Rocket className="w-6 h-6 text-blue-600" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-900">Execution Options & Next Steps</h3>
                <p className="text-sm text-slate-500">Choose your path forward</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                className="text-left p-5 rounded-xl border border-blue-100 bg-blue-50/30 hover:bg-blue-50 hover:shadow-md transition-all group"
                onClick={handleDIYClick}
              >
                <h4 className="text-blue-700 font-bold mb-2">DIY Approach</h4>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Use BeVisible insights; follow the guide for {domain}; monitor impact.
                </p>
              </button>

              <button 
                className="text-left p-5 rounded-xl border border-purple-100 bg-purple-50/30 hover:bg-purple-50 hover:shadow-md transition-all group"
                onClick={startPartnerSearch}
              >
                <h4 className="text-purple-700 font-bold mb-2">Agency Partner</h4>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Work with a BeVisible-certified partner who executes the scope monthly.
                </p>
              </button>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <h4 className="text-sm font-bold text-slate-900 mb-2">Next Steps</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Run a 3-month pilot. Track mentions, karma, and AI model coverage.
              </p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderSearchingView = () => (
    <div className="flex flex-col items-center justify-center h-full text-center space-y-8 animate-fadeIn py-12">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Search className="w-6 h-6 text-blue-600" />
        </div>
      </div>
      
      <div className="space-y-2">
        <h3 className="text-xl font-bold text-slate-900">Searching for BeVisible Certified partner...</h3>
        <p className="text-slate-500">Matching you with {domain} specialists</p>
      </div>

      <div className="w-full max-w-xs space-y-3 text-sm text-left pl-8">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${searchStep >= 0 ? 'bg-blue-500 animate-pulse' : 'bg-gray-200'}`}></div>
          <span className={searchStep >= 0 ? 'text-slate-700 font-medium' : 'text-gray-400'}>Scanning partner network</span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${searchStep >= 1 ? 'bg-blue-500 animate-pulse' : 'bg-gray-200'}`}></div>
          <span className={searchStep >= 1 ? 'text-slate-700 font-medium' : 'text-gray-400'}>Checking expertise & availability</span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${searchStep >= 2 ? 'bg-blue-500 animate-pulse' : 'bg-gray-200'}`}></div>
          <span className={searchStep >= 2 ? 'text-slate-700 font-medium' : 'text-gray-400'}>Finding best match</span>
        </div>
      </div>
    </div>
  );

  const renderPartnerView = () => (
    <div className="space-y-6 animate-fadeIn pb-4">
      <div className="flex items-center gap-2 text-green-600 font-bold text-lg mb-2">
        <CheckCircle2 className="w-6 h-6" />
        Match Found!
      </div>
      
      <button 
        onClick={() => setViewMode('slides')}
        className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1 mb-4"
      >
        <ArrowLeft size={14} /> Back to Scope
      </button>

      {/* Partner Card */}
      <div className="border border-blue-100 rounded-xl p-5 shadow-sm bg-white relative overflow-hidden">
        <div className="flex items-start justify-between">
          <div className="flex gap-4">
            <div className="w-16 h-16 bg-orange-100 rounded-lg flex flex-col items-center justify-center text-orange-600 font-bold shrink-0">
              <span className="text-xl">RA</span>
              <span className="text-[10px] uppercase mt-1">Agency</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-bold text-slate-900">Digital Growth Agency</h3>
                <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ShieldCheck size={10} /> Certified
                </span>
              </div>
              <p className="text-sm text-slate-500 mb-2">BeVisible Certified Partner</p>
              
              <div className="flex items-center gap-4 text-sm text-slate-600 mb-3">
                <div className="flex items-center gap-1 text-orange-500 font-bold">
                  <Star size={14} fill="currentColor" /> 4.9 <span className="text-slate-400 font-normal">(47 reviews)</span>
                </div>
                <div className="flex items-center gap-1 text-slate-500">
                  <Users size={14} /> 150+ campaigns
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {['Growth Marketing', 'Community Management', 'AI Visibility', 'Content Strategy'].map(tag => (
                  <span key={tag} className="px-2 py-1 bg-gray-100 text-slate-600 text-xs font-medium rounded">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-1 text-xs text-slate-500 mb-4">
                <MapPin size={12} /> San Francisco, CA
              </div>
              
              <p className="text-sm text-slate-600 leading-relaxed mb-3">
                Expert marketing agency specializing in building authentic community presence and improving AI visibility on {domain} through strategic content and engagement.
              </p>
              
              <a href="#" className="text-sm font-medium text-blue-600 hover:underline inline-flex items-center gap-1">
                Visit website <ExternalLinkIcon size={12} />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Scheduler */}
      <div className="border border-gray-100 rounded-xl p-5 bg-white shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <Calendar className="w-5 h-5 text-blue-600" />
          <h4 className="font-bold text-slate-900">Schedule a Discovery Call</h4>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Book a 30-minute call to discuss your {domain} visibility goals and how this partner can help.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
           <div>
             <label className="block text-xs font-bold text-slate-700 mb-1.5">Select Date</label>
             <div className="relative">
                <input type="date" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
             </div>
           </div>
           <div>
             <label className="block text-xs font-bold text-slate-700 mb-1.5">Select Time (PST)</label>
             <select className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white">
                <option>Choose a time</option>
                <option>9:00 AM</option>
                <option>10:00 AM</option>
                <option>1:30 PM</option>
                <option>3:00 PM</option>
             </select>
           </div>
        </div>

        <button className="w-full bg-slate-100 hover:bg-slate-200 text-slate-400 font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm cursor-not-allowed">
           <Calendar size={16} /> Confirm Meeting
        </button>
      </div>
    </div>
  );

  // Helper icon since it's used inside a link
  const ExternalLinkIcon = ({ size }: { size: number }) => (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] transition-all duration-300">
        
        {/* Header - Hides on search/partner view except closing */}
        {viewMode === 'slides' ? (
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-blue-700 font-medium">
              <Target className="w-4 h-4" />
              <span>Improve {domain} visibility</span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
              <X size={20} />
            </button>
          </div>
        ) : (
          <div className="px-6 py-4 flex justify-between items-center shrink-0">
             <div className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                {viewMode === 'searching' && <Search className="w-5 h-5 text-blue-600" />}
                {viewMode === 'searching' ? 'Finding Your Partner' : ''}
             </div>
             <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
              <X size={20} />
            </button>
          </div>
        )}

        {/* Progress Bar (Only for slides) */}
        {viewMode === 'slides' && (
          <>
            <div className="flex justify-center py-4 shrink-0">
              <div className="flex gap-2">
                {Array.from({ length: totalSlides }).map((_, idx) => (
                  <div 
                    key={idx} 
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      idx === currentSlide ? 'bg-blue-600 w-6' : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="text-center text-xs text-gray-400 font-medium mb-2">
              Slide {currentSlide + 1} of {totalSlides}
            </div>
          </>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto px-8 py-2 custom-scrollbar">
          {viewMode === 'slides' && (
             <div className="border border-blue-50 rounded-xl p-1 shadow-sm h-full mb-4">
               <div className="bg-white rounded-lg p-4 h-full">
                  {renderSlideContent()}
               </div>
             </div>
          )}
          {viewMode === 'searching' && renderSearchingView()}
          {viewMode === 'partner' && renderPartnerView()}
        </div>

        {/* Footer (Only for slides) */}
        {viewMode === 'slides' && (
          <div className="p-6 mt-2 border-t border-gray-100 flex items-center justify-between shrink-0 bg-gray-50/50 rounded-b-2xl">
            {currentSlide > 0 ? (
              <button 
                onClick={prevSlide}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white hover:shadow-sm rounded-lg transition-all"
              >
                <ArrowLeft size={16} />
                Previous
              </button>
            ) : <div />}

            {currentSlide < totalSlides - 1 ? (
              <button 
                onClick={nextSlide}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white hover:shadow-sm rounded-lg transition-all"
              >
                Next
                <ArrowRight size={16} />
              </button>
            ) : (
               // Final slide doesn't need a specific next button in footer as the cards act as triggers, 
               // but we can keep a "Next" that does nothing or is hidden
               <div />
            )}
          </div>
        )}
      </div>
    </div>
  );
};