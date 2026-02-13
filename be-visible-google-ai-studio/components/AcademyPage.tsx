import React, { useState, useEffect } from 'react';
import { Search, ArrowRight, Video, FileText, Globe } from 'lucide-react';

interface AcademyPageProps {
  initialArticleId?: string | null;
}

interface ArticleSection {
  title: string;
  content: React.ReactNode;
  callout?: string;
}

interface Article {
  id: string;
  title: string;
  category: string;
  readTime: string;
  type: string;
  description: string;
  sections: ArticleSection[];
}

const articles: Article[] = [
  {
    id: 'reddit-visibility-guide',
    title: 'Mastering Reddit Visibility for AI',
    category: 'Community Strategy',
    readTime: '10 min read',
    type: 'Guide',
    description: 'A comprehensive guide to building authentic presence and influencing AI citations through Reddit communities.',
    sections: [
      {
        title: '1. Introduction',
        content: 'In the age of AI-driven search, community platforms like Reddit have become critical data sources for Large Language Models (LLMs). Unlike traditional SEO, which focuses on keywords, optimizing for LLMs on Reddit requires building semantic authority and authentic engagement.',
        callout: 'AI models prioritize highly upvoted, detailed, and recent discussions from credible subreddits.'
      },
      {
        title: '2. Identifying Key Communities',
        content: 'Start by mapping the subreddits where your target audience hangs out. For developer tools, this includes r/programming, r/devops, and specific language communities like r/cpp or r/python.'
      },
      {
        title: '3. The "Helpful Expert" Persona',
        content: 'Avoid direct marketing. Instead, focus on answering complex questions where your product is a natural part of the solution. Structure your answers with clear headings, code snippets, and pros/cons lists to make them easy for AI to parse.'
      }
    ]
  },
  {
    id: 'generic-visibility-guide',
    title: 'Universal Strategies for Online Visibility',
    category: 'General Strategy',
    readTime: '7 min read',
    type: 'Guide',
    description: 'Not all sources have direct DIY optimization paths. Learn how to improve your overall digital footprint through link building, agencies, and platform diversity.',
    sections: [
      {
        title: '1. The Challenge of Broad Visibility',
        content: 'While some platforms allow for direct contribution (like Reddit or GitHub), many citation sources are editorial or algorithmic in nature. Improving visibility here requires a broader approach to digital authority.'
      },
      {
        title: '2. Strategic Link Building',
        content: 'Backlinks remain a strong signal for both search engines and AI models. Focus on high-quality guest posting, digital PR, and partnerships to get your domain referenced by authoritative sites in your niche. When AI models see your brand associated with trusted domains, your "Knowledge Graph" reliability score increases.',
        callout: 'Quality over quantity: One link from a major industry publication is worth 100 low-tier directory links.'
      },
      {
        title: '3. Leveraging Specialized Agencies',
        content: 'For platforms like TikTok, Instagram, and even broad PR, specialized agencies are often the most effective route. They have established networks and content formulas that are difficult to replicate in-house without a dedicated team.'
      },
      {
        title: '4. Key Platforms for a Holistic Footprint',
        content: (
          <div className="space-y-4">
            <p>Ensure your brand has a consistent and optimized presence across these pillars:</p>
            <ul className="list-disc pl-5 space-y-2 text-slate-700">
              <li><strong>Technical Communities:</strong> GitHub, Stack Overflow. Essential for dev-tools.</li>
              <li><strong>Video & Visual:</strong> YouTube, Instagram, TikTok. Video transcripts are increasingly indexed by multimodal AI models.</li>
              <li><strong>Social & Real-time:</strong> X (Twitter), Threads, LinkedIn. Great for real-time relevance and news signals.</li>
              <li><strong>Long-form Content:</strong> Medium, Substack, and your own blog. Provides deep context for RAG (Retrieval-Augmented Generation) systems.</li>
            </ul>
          </div>
        )
      }
    ]
  },
  {
    id: 'optimize-documentation',
    title: 'Optimizing Documentation for LLMs',
    category: 'Technical SEO',
    readTime: '15 min read',
    type: 'Article',
    description: 'Structure your technical docs to be easily parsed and cited by major Large Language Models.',
    sections: [
        {
            title: '1. Semantic Structure',
            content: 'Use clear H1, H2, and H3 tags. LLMs rely on hierarchy to understand context.'
        }
    ]
  },
  {
    id: 'stackoverflow-authority',
    title: 'Building Authority on Stack Overflow',
    category: 'Community Strategy',
    readTime: '8 min read',
    type: 'Guide',
    description: 'Strategies to answer key questions and become the go-to reference for developers in your niche.',
    sections: [
        {
            title: '1. Finding the Right Questions',
            content: 'Target questions with high views but outdated answers.'
        }
    ]
  },
  {
    id: 'github-readme-seo',
    title: 'GitHub README SEO for AI Discovery',
    category: 'Technical SEO',
    readTime: '5 min read',
    type: 'Video',
    description: 'Video tutorial on structuring your READMEs to maximize visibility in AI code generation tools.',
    sections: []
  }
];

export const AcademyPage: React.FC<AcademyPageProps> = ({ initialArticleId }) => {
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);

  useEffect(() => {
    if (initialArticleId) {
      setSelectedArticle(initialArticleId);
    } else {
      setSelectedArticle(null);
    }
  }, [initialArticleId]);

  if (selectedArticle) {
    const article = articles.find(a => a.id === selectedArticle);
    if (!article) return <div>Article not found</div>;
    
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-fadeIn">
        <div className="p-8 max-w-4xl mx-auto">
          <button 
            onClick={() => setSelectedArticle(null)}
            className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1 mb-6"
          >
            ← Back to Academy
          </button>
          
          <div className="flex items-center gap-3 mb-6">
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                article.category === 'General Strategy' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {article.type}
            </span>
            <span className="text-slate-500 text-sm flex items-center gap-1">
              <span className="w-1 h-1 bg-slate-400 rounded-full"></span>
              {article.readTime}
            </span>
            <span className="text-slate-500 text-sm flex items-center gap-1">
               <span className="w-1 h-1 bg-slate-400 rounded-full"></span>
               {article.category}
            </span>
          </div>

          <h1 className="text-3xl font-bold text-slate-900 mb-6">{article.title}</h1>
          
          <div className="prose prose-slate max-w-none">
            <p className="text-lg text-slate-600 leading-relaxed mb-8">{article.description}</p>
            
            <div className="space-y-8">
              {article.sections.map((section, idx) => (
                <div key={idx}>
                  <h3 className="text-xl font-bold text-slate-800 mb-3">{section.title}</h3>
                  <div className="text-slate-600 leading-relaxed">
                    {section.content}
                  </div>
                  {section.callout && (
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 my-6 rounded-r-lg">
                      <p className="text-blue-800 font-medium">
                        <strong>Key Insight:</strong> {section.callout}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">BeVisible Academy</h2>
          <p className="text-slate-500 mt-1">Expert guides, tutorials, and strategies to master AI visibility.</p>
        </div>
        <div className="relative w-64">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
           <input 
             type="text" 
             placeholder="Search guides..." 
             className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
           />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {articles.map((article) => (
          <div 
            key={article.id}
            onClick={() => setSelectedArticle(article.id)}
            className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-all cursor-pointer group flex flex-col h-full"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                article.type === 'Video' ? 'bg-purple-100 text-purple-600' : 
                article.category === 'General Strategy' ? 'bg-orange-100 text-orange-600' :
                'bg-blue-100 text-blue-600'
              }`}>
                {article.type === 'Video' ? <Video size={20} /> : 
                 article.category === 'General Strategy' ? <Globe size={20} /> : <FileText size={20} />}
              </div>
              <span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded">
                {article.readTime}
              </span>
            </div>
            
            <h3 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">
              {article.title}
            </h3>
            <p className="text-sm text-slate-500 mb-4 line-clamp-2 flex-1">
              {article.description}
            </p>
            
            <div className="flex items-center gap-2 text-sm font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0 transition-transform">
              Read Guide <ArrowRight size={14} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};