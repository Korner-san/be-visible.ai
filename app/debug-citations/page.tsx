'use client'

import { useState, useEffect } from 'react'

export default function DebugCitations() {
  const [domainsData, setDomainsData] = useState<any>(null)
  const [urlsData, setUrlsData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const testAPIs = async () => {
      try {
        setLoading(true)
        setError(null)

        // Test domains API
        console.log('🔍 Testing domains API...')
        const domainsResponse = await fetch('/api/reports/citations/domains?brandId=fbf81956-e312-40e6-8fcf-920185582421&from=2025-10-01&to=2025-10-31&models=perplexity,google_ai_overview')
        const domainsResult = await domainsResponse.json()
        console.log('📊 Domains API result:', domainsResult)
        
        if (!domainsResult.success) {
          throw new Error(`Domains API failed: ${domainsResult.error}`)
        }

        const qoveryDomain = domainsResult.data.domains.find((d: any) => d.domain === 'qovery.com')
        setDomainsData(qoveryDomain)

        // Test URLs API
        console.log('🔍 Testing URLs API...')
        const urlsResponse = await fetch('/api/reports/citations/urls?brandId=fbf81956-e312-40e6-8fcf-920185582421&domain=qovery.com&from=2025-10-01&to=2025-10-31&models=perplexity,google_ai_overview')
        const urlsResult = await urlsResponse.json()
        console.log('📊 URLs API result:', urlsResult)
        
        if (!urlsResult.success) {
          throw new Error(`URLs API failed: ${urlsResult.error}`)
        }

        setUrlsData(urlsResult.data.urls.slice(0, 3)) // First 3 URLs

      } catch (err: any) {
        console.error('❌ API test failed:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    testAPIs()
  }, [])

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Debug Citations APIs</h1>
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Debug Citations APIs</h1>
        <div className="text-red-600 bg-red-50 p-4 rounded">
          <strong>Error:</strong> {error}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Debug Citations APIs</h1>
      
      <div className="grid gap-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">Domain Data (qovery.com)</h2>
          <div className="bg-gray-50 p-4 rounded">
            <pre className="text-sm overflow-auto">
              {JSON.stringify(domainsData, null, 2)}
            </pre>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">URLs Data (first 3)</h2>
          <div className="bg-gray-50 p-4 rounded">
            <pre className="text-sm overflow-auto">
              {JSON.stringify(urlsData, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
