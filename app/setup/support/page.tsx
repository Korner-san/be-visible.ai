import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Mail, MessageSquare } from "lucide-react"

export default function SetupSupport() {
  return (
    <div className="p-8">
      {/* Breadcrumbs */}
      <div className="mb-6">
        <nav className="text-sm text-slate-500">
          <span>Setup</span>
          <span className="mx-2">/</span>
          <span className="text-slate-900 font-medium">Support</span>
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Book Walkthrough */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Book a Private Walkthrough</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              Schedule a personalized demo and setup session with our team
            </p>
            <Button className="w-full">
              <Calendar className="h-4 w-4 mr-2" />
              Schedule Walkthrough
            </Button>
            <p className="text-xs text-slate-500">
              Calendly integration will open here to book your session
            </p>
          </CardContent>
        </Card>

        {/* Support Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Support Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-slate-400" />
                <div>
                  <div className="text-sm font-medium">Email Support</div>
                  <div className="text-sm text-blue-600">support@be-visible.ai</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MessageSquare className="h-4 w-4 text-slate-400" />
                <div>
                  <div className="text-sm font-medium">Live Chat</div>
                  <div className="text-sm text-slate-500">Available 9 AM - 6 PM PST</div>
                </div>
              </div>
            </div>
            <Button variant="outline" className="w-full">
              Contact Support
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Help Resources */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Help Resources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4">
              <div className="text-sm font-medium mb-2">Documentation</div>
              <Button variant="outline" size="sm">View Docs</Button>
            </div>
            <div className="text-center p-4">
              <div className="text-sm font-medium mb-2">Video Tutorials</div>
              <Button variant="outline" size="sm">Watch Videos</Button>
            </div>
            <div className="text-center p-4">
              <div className="text-sm font-medium mb-2">FAQ</div>
              <Button variant="outline" size="sm">Browse FAQ</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 