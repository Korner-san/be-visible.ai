"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, Copy, CheckCircle, XCircle, Sparkles } from "lucide-react"
import { useBrandsStore } from "@/store/brands"

export default function SetupIntegrations() {
  const { brands, activeBrandId } = useBrandsStore()
  const activeBrand = brands.find(brand => brand.id === activeBrandId)
  const isDemoMode = activeBrand?.isDemo || false
  return (
    <div className="p-8">
      {/* Breadcrumbs */}
      <div className="mb-6">
        <nav className="text-sm text-slate-500">
          <span>Setup</span>
          <span className="mx-2">/</span>
          <span className="text-slate-900 font-medium">Integrations</span>
        </nav>
      </div>

      {/* Demo Brand Alert */}
      {isDemoMode && (
        <Alert className="mb-6 border-amber-200 bg-amber-50">
          <Sparkles className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>Demo Brand:</strong> Viewing integrations for {activeBrand?.name}. 
            Switch to your brand to manage your actual integrations.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        {/* API Key Management */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">API Key Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <div className="flex gap-2">
                <Input 
                  id="api-key" 
                  type="password"
                  value="sk-proj-••••••••••••••••••••••••••••••••••••••••"
                  readOnly
                />
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate-500">Keep your API key secure and never share it publicly</p>
          </CardContent>
        </Card>

        {/* Tracking Snippet */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Website Tracking Snippet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <code className="text-sm font-mono">
{`<script>
  (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://api.be-visible.ai/track.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','BV-XXXX-XXXX');
</script>`}
              </code>
            </div>
            <Button variant="outline" size="sm">
              <Copy className="h-4 w-4 mr-2" />
              Copy Snippet
            </Button>
            <p className="text-xs text-slate-500">Add this snippet to your website's &lt;head&gt; section</p>
          </CardContent>
        </Card>

        {/* Connection Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Connection Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Website Tracking</span>
                <Badge variant="default" className="bg-green-100 text-green-700">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">AI Model Monitoring</span>
                <Badge variant="default" className="bg-green-100 text-green-700">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Data Collection</span>
                <Badge variant="secondary">
                  <XCircle className="h-3 w-3 mr-1" />
                  Pending
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 