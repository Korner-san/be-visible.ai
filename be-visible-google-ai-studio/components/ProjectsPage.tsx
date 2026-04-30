import React, { useState, useEffect } from 'react'
import { Building2, MapPin, TrendingUp, BarChart2, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface ProjectMention {
  project_name: string
  city?: string
  mention_count: number
  mention_rate: number
  by_provider?: {
    chatgpt?: { mention_count: number; mention_rate: number }
    claude?: { mention_count: number; mention_rate: number }
    google_ai_overview?: { mention_count: number; mention_rate: number }
  }
}

interface ProjectMentionData {
  projects: ProjectMention[]
  total_responses: number
  calculated_at: string
}

interface DailyReportRow {
  report_date: string
  project_mention_data: ProjectMentionData | null
}

interface ProjectsPageProps {
  brandId: string | null
}

const PROVIDER_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  google_ai_overview: 'Google AI',
}

const PROVIDER_COLORS: Record<string, string> = {
  chatgpt: '#10a37f',
  claude: '#c4621f',
  google_ai_overview: '#4285f4',
}

function MentionBar({ rate, color }: { rate: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, rate)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-bold text-slate-600 w-10 text-right">{rate.toFixed(0)}%</span>
    </div>
  )
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({ brandId }) => {
  const [latestData, setLatestData] = useState<ProjectMentionData | null>(null)
  const [history, setHistory] = useState<DailyReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [lastDate, setLastDate] = useState<string | null>(null)

  useEffect(() => {
    if (!brandId) return
    setLoading(true)

    supabase
      .from('daily_reports')
      .select('report_date, project_mention_data')
      .eq('brand_id', brandId)
      .not('project_mention_data', 'is', null)
      .order('report_date', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        const rows = (data || []) as DailyReportRow[]
        setHistory(rows)
        if (rows.length > 0 && rows[0].project_mention_data) {
          setLatestData(rows[0].project_mention_data)
          setLastDate(rows[0].report_date)
        }
        setLoading(false)
      })
  }, [brandId])

  if (loading) {
    return (
      <div className="py-32 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-brand-brown/40" />
      </div>
    )
  }

  if (!latestData || latestData.projects.length === 0) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-center space-y-4">
        <div className="p-5 rounded-full bg-gray-100 text-gray-300">
          <Building2 size={40} />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-700">No project data yet</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-sm">
            Project mention data is computed after your first daily report completes. Check back after tonight's report runs.
          </p>
        </div>
      </div>
    )
  }

  const projects = latestData.projects
  const maxMentionRate = Math.max(...projects.map(p => p.mention_rate), 1)

  return (
    <div className="space-y-6 animate-fadeIn pb-24">

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Building2 size={16} className="text-brand-brown" />
            <h2 className="text-lg font-black text-slate-900 tracking-tight">Project Visibility</h2>
          </div>
          <p className="text-xs text-slate-400">
            {lastDate ? `Last updated: ${lastDate}` : ''} · {latestData.total_responses} AI responses analyzed
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <RefreshCw size={13} />
          Updated nightly
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1">Projects Tracked</p>
          <p className="text-3xl font-black text-slate-900">{projects.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1">Mentioned</p>
          <p className="text-3xl font-black text-slate-900">{projects.filter(p => p.mention_count > 0).length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1">Avg Mention Rate</p>
          <p className="text-3xl font-black text-slate-900">
            {(projects.reduce((s, p) => s + p.mention_rate, 0) / Math.max(projects.length, 1)).toFixed(0)}%
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1">Top Project</p>
          <p className="text-base font-black text-slate-900 truncate">
            {projects.sort((a, b) => b.mention_rate - a.mention_rate)[0]?.project_name || '—'}
          </p>
        </div>
      </div>

      {/* Projects Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <BarChart2 size={15} className="text-slate-400" />
          <h3 className="text-sm font-black text-slate-700 tracking-tight">Mention Rate by Project</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {[...projects]
            .sort((a, b) => b.mention_rate - a.mention_rate)
            .map((project, idx) => (
              <div key={project.project_name} className="px-6 py-5 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-slate-300 w-5">#{idx + 1}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900">{project.project_name}</span>
                        {project.mention_count > 0 && (
                          <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                            {project.mention_count}x mentioned
                          </span>
                        )}
                      </div>
                      {project.city && (
                        <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                          <MapPin size={10} />
                          {project.city}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-slate-900">{project.mention_rate.toFixed(0)}%</span>
                    <p className="text-[10px] text-slate-400">mention rate</p>
                  </div>
                </div>

                {/* Overall bar */}
                <div className="mb-3">
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-brown transition-all duration-700"
                      style={{ width: `${(project.mention_rate / maxMentionRate) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Per-provider breakdown */}
                {project.by_provider && (
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    {(['chatgpt', 'claude', 'google_ai_overview'] as const).map(provider => {
                      const pd = project.by_provider?.[provider]
                      const rate = pd?.mention_rate ?? 0
                      return (
                        <div key={provider} className="bg-gray-50 rounded-xl p-3">
                          <p className="text-[10px] font-black tracking-wider text-slate-400 mb-1.5">
                            {PROVIDER_LABELS[provider]}
                          </p>
                          <MentionBar rate={rate} color={PROVIDER_COLORS[provider]} />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* 7-day trend (if history available) */}
      {history.length > 1 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={15} className="text-slate-400" />
            <h3 className="text-sm font-black text-slate-700 tracking-tight">Trend — Last {history.length} Reports</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-[10px] font-black text-slate-400 tracking-widest">PROJECT</th>
                  {history.slice(0, 7).map(r => (
                    <th key={r.report_date} className="text-right pb-2 text-[10px] font-black text-slate-400 tracking-widest px-2">
                      {r.report_date.slice(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {projects.slice(0, 8).map(p => (
                  <tr key={p.project_name} className="hover:bg-gray-50/50">
                    <td className="py-2.5 pr-4 font-bold text-slate-700 truncate max-w-[160px]">{p.project_name}</td>
                    {history.slice(0, 7).map(r => {
                      const hp = r.project_mention_data?.projects.find(x => x.project_name === p.project_name)
                      const rate = hp?.mention_rate ?? null
                      return (
                        <td key={r.report_date} className="text-right py-2.5 px-2">
                          {rate !== null ? (
                            <span className={`font-bold ${rate > 20 ? 'text-green-600' : rate > 0 ? 'text-slate-600' : 'text-slate-300'}`}>
                              {rate.toFixed(0)}%
                            </span>
                          ) : (
                            <span className="text-slate-200">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
