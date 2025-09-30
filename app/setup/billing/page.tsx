import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Download, CreditCard } from "lucide-react"

export default function SetupBilling() {
  return (
    <div className="p-8">
      {/* Breadcrumbs */}
      <div className="mb-6">
        <nav className="text-sm text-slate-500">
          <span>Setup</span>
          <span className="mx-2">/</span>
          <span className="text-slate-900 font-medium">Billing</span>
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Current Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Current Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-xl font-bold">Professional</div>
              <div className="text-sm text-slate-500">$99/month</div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Prompts Used</span>
                <span className="font-medium">5 / 15</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Monthly Executions</span>
                <span className="font-medium">2,847 / 10,000</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Data Retention</span>
                <span className="font-medium">12 months</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">Upgrade</Button>
              <Button variant="outline" size="sm">Downgrade</Button>
            </div>
          </CardContent>
        </Card>

        {/* Payment Method */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Payment Method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-slate-400" />
              <div>
                <div className="text-sm font-medium">•••• •••• •••• 4242</div>
                <div className="text-xs text-slate-500">Expires 12/25</div>
              </div>
            </div>
            <Button variant="outline" size="sm">Update Payment Method</Button>
          </CardContent>
        </Card>
      </div>

      {/* Invoices */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Billing History</CardTitle>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Download All
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Dec 1, 2024</TableCell>
                <TableCell>$99.00</TableCell>
                <TableCell>Professional</TableCell>
                <TableCell>
                  <Badge variant="default" className="bg-green-100 text-green-700">Paid</Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Nov 1, 2024</TableCell>
                <TableCell>$99.00</TableCell>
                <TableCell>Professional</TableCell>
                <TableCell>
                  <Badge variant="default" className="bg-green-100 text-green-700">Paid</Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Oct 1, 2024</TableCell>
                <TableCell>$49.00</TableCell>
                <TableCell>Starter</TableCell>
                <TableCell>
                  <Badge variant="default" className="bg-green-100 text-green-700">Paid</Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
} 