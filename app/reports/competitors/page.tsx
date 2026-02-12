"use client"

export default function CompetitorsPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center max-w-md w-full animate-fadeIn">
        <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">&#x1F50D;</span>
        </div>
        <h1 className="text-2xl font-bold text-brand-brown mb-3">Competitors</h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          Competitive analysis and benchmarking is coming soon. Track how your brand compares across AI models.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-brand-50 rounded-full">
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          <span className="text-xs font-semibold text-brand-600">Coming Soon</span>
        </div>
      </div>
    </div>
  )
}
