'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, Target, TrendingUp, Lightbulb, CheckSquare, Rocket } from "lucide-react"

interface ScopeSlidesProps {
  domain: string
}

// Mock scope data for different domains
const getScopeData = (domain: string) => {
  const brandName = "Incredibuild" // In a real app, this would come from context

  if (domain === 'reddit.com') {
    return {
      slides: [
        {
          icon: Target,
          title: "Reddit Visibility Scope – Incredibuild",
          subtitle: "Close the AI visibility gap on Reddit by targeting the communities and discussions that influence AI answers.",
          content: null
        },
        {
          icon: TrendingUp,
          title: "Influence Snapshot",
          subtitle: "Understanding where Reddit discussions are driving AI citations",
          content: (
            <div className="space-y-4">
              <div className="bg-slate-100 rounded-lg p-6 text-center">
                <div className="text-sm text-slate-600 mb-2">Citation Distribution by Theme</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Tools & Workflow</span>
                    <Badge variant="secondary">35%</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Build Optimization</span>
                    <Badge variant="secondary">28%</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs">CI/CD</span>
                    <Badge variant="secondary">18%</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Hardware/PC Building</span>
                    <Badge variant="secondary">12%</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Other</span>
                    <Badge variant="secondary">7%</Badge>
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-600 italic">
                Reddit threads driving AI answers cluster around: Tools & Workflow, Build Optimization, CI/CD, Hardware/PC Building, and Other.
              </p>
            </div>
          )
        },
        {
          icon: Lightbulb,
          title: "Key Themes & Gaps",
          subtitle: "Where developers are asking questions that Incredibuild can answer",
          content: (
            <div className="space-y-3">
              <div className="border-l-4 border-blue-600 pl-4 py-2">
                <div className="font-medium text-sm">Tools & Workflow</div>
                <p className="text-sm text-slate-600">Developers ask for tools that automate or speed up work</p>
              </div>
              <div className="border-l-4 border-green-600 pl-4 py-2">
                <div className="font-medium text-sm">Build Optimization</div>
                <p className="text-sm text-slate-600">Reducing long compile/build times</p>
              </div>
              <div className="border-l-4 border-purple-600 pl-4 py-2">
                <div className="font-medium text-sm">CI/CD Platforms</div>
                <p className="text-sm text-slate-600">Scalable pipelines for large teams</p>
              </div>
              <div className="border-l-4 border-orange-600 pl-4 py-2">
                <div className="font-medium text-sm">Hardware/PC Building</div>
                <p className="text-sm text-slate-600">Motherboard/future-proofing discussions</p>
              </div>
              <div className="border-l-4 border-slate-400 pl-4 py-2">
                <div className="font-medium text-sm">Other</div>
                <p className="text-sm text-slate-600">Invoicing, data-viz, productivity</p>
              </div>
            </div>
          )
        },
        {
          icon: CheckSquare,
          title: "Action Plan",
          subtitle: "4-step roadmap to improve your Reddit visibility",
          content: (
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <div className="font-medium text-sm">Establish presence</div>
                  <p className="text-sm text-slate-600">Official account + karma</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  2
                </div>
                <div>
                  <div className="font-medium text-sm">Prioritize communities</div>
                  <p className="text-sm text-slate-600">r/cpp, r/programming, r/devops, r/embedded, r/gamedev, r/buildapc, r/pcmasterrace, r/smallbusiness, r/crm</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  3
                </div>
                <div>
                  <div className="font-medium text-sm">Engage & share value</div>
                  <p className="text-sm text-slate-600">3 meaningful interactions/week (answers, case studies, tutorials)</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  4
                </div>
                <div>
                  <div className="font-medium text-sm">Monitor & refine</div>
                  <p className="text-sm text-slate-600">Track mentions + AI citation impact, adjust focus</p>
                </div>
              </div>
            </div>
          )
        },
        {
          icon: Rocket,
          title: "Execution Options & Next Steps",
          subtitle: "Choose your path forward",
          content: (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
                  <div className="font-semibold text-blue-900 mb-2">DIY Approach</div>
                  <p className="text-sm text-blue-800">
                    Use BeVisible insights; follow the checklist; monitor impact weekly.
                  </p>
                </div>
                <div className="border rounded-lg p-4 bg-purple-50 border-purple-200">
                  <div className="font-semibold text-purple-900 mb-2">Agency Partner</div>
                  <p className="text-sm text-purple-800">
                    Work with a BeVisible-certified partner who executes the scope monthly.
                  </p>
                </div>
              </div>
              <div className="border-t pt-4">
                <div className="font-medium text-sm mb-2">Next Steps</div>
                <p className="text-sm text-slate-600">
                  Run a 3-month pilot. Track mentions, karma, and AI model coverage.
                </p>
              </div>
            </div>
          )
        }
      ]
    }
  }

  // Generic scope for YouTube and Medium
  const platformName = domain === 'youtube.com' ? 'YouTube' : 'Medium'

  return {
    slides: [
      {
        icon: Target,
        title: `${platformName} Visibility Scope – ${brandName}`,
        subtitle: `Close the AI visibility gap on ${platformName} by creating content that influences AI answers.`,
        content: null
      },
      {
        icon: TrendingUp,
        title: "Influence Snapshot",
        subtitle: `Understanding where ${platformName} content is driving AI citations`,
        content: (
          <div className="space-y-4">
            <div className="bg-slate-100 rounded-lg p-6 text-center">
              <div className="text-sm text-slate-600 mb-2">Content being cited by AI models</div>
              <p className="text-xs text-slate-500 italic">
                Placeholder: Chart showing which topics and content types from {platformName} are being referenced
              </p>
            </div>
          </div>
        )
      },
      {
        icon: Lightbulb,
        title: "Key Themes & Gaps",
        subtitle: "Content opportunities to improve AI visibility",
        content: (
          <div className="space-y-3">
            <div className="border-l-4 border-blue-600 pl-4 py-2">
              <div className="font-medium text-sm">Topic Area 1</div>
              <p className="text-sm text-slate-600">Description of content gap opportunity</p>
            </div>
            <div className="border-l-4 border-green-600 pl-4 py-2">
              <div className="font-medium text-sm">Topic Area 2</div>
              <p className="text-sm text-slate-600">Description of content gap opportunity</p>
            </div>
            <div className="border-l-4 border-purple-600 pl-4 py-2">
              <div className="font-medium text-sm">Topic Area 3</div>
              <p className="text-sm text-slate-600">Description of content gap opportunity</p>
            </div>
          </div>
        )
      },
      {
        icon: CheckSquare,
        title: "Action Plan",
        subtitle: `Strategic roadmap for ${platformName}`,
        content: (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                1
              </div>
              <div>
                <div className="font-medium text-sm">Content audit</div>
                <p className="text-sm text-slate-600">Review current presence and performance</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                2
              </div>
              <div>
                <div className="font-medium text-sm">Create strategic content</div>
                <p className="text-sm text-slate-600">Develop content targeting identified gaps</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                3
              </div>
              <div>
                <div className="font-medium text-sm">Optimize for AI discovery</div>
                <p className="text-sm text-slate-600">Structure content for maximum AI visibility</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                4
              </div>
              <div>
                <div className="font-medium text-sm">Monitor & iterate</div>
                <p className="text-sm text-slate-600">Track AI citations and refine approach</p>
              </div>
            </div>
          </div>
        )
      },
      {
        icon: Rocket,
        title: "Execution Options & Next Steps",
        subtitle: "Choose your path forward",
        content: (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
                <div className="font-semibold text-blue-900 mb-2">DIY Approach</div>
                <p className="text-sm text-blue-800">
                  Use BeVisible insights; follow the checklist; monitor impact weekly.
                </p>
              </div>
              <div className="border rounded-lg p-4 bg-purple-50 border-purple-200">
                <div className="font-semibold text-purple-900 mb-2">Agency Partner</div>
                <p className="text-sm text-purple-800">
                  Work with a BeVisible-certified partner who executes the scope monthly.
                </p>
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="font-medium text-sm mb-2">Next Steps</div>
              <p className="text-sm text-slate-600">
                Run a 3-month pilot. Track citations, engagement, and AI model coverage.
              </p>
            </div>
          </div>
        )
      }
    ]
  }
}

export function ScopeSlides({ domain }: ScopeSlidesProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const scopeData = getScopeData(domain)
  const { slides } = scopeData

  const nextSlide = () => {
    setCurrentSlide((prev) => Math.min(slides.length - 1, prev + 1))
  }

  const prevSlide = () => {
    setCurrentSlide((prev) => Math.max(0, prev - 1))
  }

  const goToSlide = (index: number) => {
    setCurrentSlide(index)
  }

  const IconComponent = slides[currentSlide].icon

  return (
    <div className="space-y-6">
      {/* Slide progress indicator */}
      <div className="flex items-center justify-center gap-2">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`h-2 rounded-full transition-all ${
              index === currentSlide
                ? 'w-8 bg-blue-600'
                : 'w-2 bg-slate-300 hover:bg-slate-400'
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* Slide counter */}
      <div className="text-center text-sm text-slate-500">
        Slide {currentSlide + 1} of {slides.length}
      </div>

      {/* Slide content */}
      <div className="min-h-[400px] bg-white rounded-lg border p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0">
            <IconComponent className="h-8 w-8 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900">
              {slides[currentSlide].title}
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              {slides[currentSlide].subtitle}
            </p>
          </div>
        </div>

        {slides[currentSlide].content && (
          <div className="mt-6">
            {slides[currentSlide].content}
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={prevSlide}
          disabled={currentSlide === 0}
          className="flex items-center gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          onClick={nextSlide}
          disabled={currentSlide === slides.length - 1}
          className="flex items-center gap-2"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
