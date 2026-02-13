import React from 'react';
import { 
  CreditCard, 
  Download, 
  CheckCircle2, 
  FileText, 
  ShieldCheck,
} from 'lucide-react';

export const BillingPage: React.FC = () => {
  const invoices = [
    { date: 'Dec 1, 2024', amount: '$99.00', plan: 'Professional', status: 'Paid' },
    { date: 'Nov 1, 2024', amount: '$99.00', plan: 'Professional', status: 'Paid' },
    { date: 'Oct 1, 2024', amount: '$49.00', plan: 'Starter', status: 'Paid' },
  ];

  return (
    <div className="space-y-6 pb-20 animate-fadeIn">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan Overview */}
        <div className="bg-white rounded-[32px] border border-gray-200 shadow-sm p-8 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Plan</span>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-tight">Professional</h2>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">Active</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-brand-brown tracking-tight">$99<span className="text-sm font-bold text-slate-400 ml-1">/mo</span></div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Next bill: Jan 1, 2025</p>
            </div>
          </div>

          <button className="w-full mt-10 bg-brand-brown text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-brand-brown/20 hover:scale-[1.01] transition-all">
            Manage Plan
          </button>
        </div>

        {/* Payment Method */}
        <div className="bg-white rounded-[32px] border border-gray-200 shadow-sm p-8 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment Method</span>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Stored Card</h3>
            </div>

            <div className="bg-slate-50 rounded-2xl p-6 border border-gray-100 flex items-center justify-between group cursor-default">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-400 group-hover:text-brand-brown transition-colors border border-gray-100">
                  <CreditCard size={24} />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-700">•••• •••• •••• 4242</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Expires 12/25</div>
                </div>
              </div>
              <ShieldCheck className="text-emerald-500" size={20} />
            </div>

            <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100/50 flex items-start gap-3">
               <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
               <p className="text-[11px] text-emerald-800 font-medium leading-relaxed">
                 Your subscription is secure and set for automatic renewal.
               </p>
            </div>
          </div>

          <button className="w-full mt-6 flex items-center justify-center gap-2 py-3.5 border-2 border-brand-brown text-brand-brown rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-brown hover:text-white transition-all">
            Update Payment Method
          </button>
        </div>
      </div>

      {/* Billing History */}
      <div className="bg-white rounded-[32px] border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none">Billing History</h3>
            <p className="text-xs text-slate-500 font-medium mt-1">Download and review your past invoices.</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-slate-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all border border-gray-200">
            <Download size={14} /> Download All
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
              <tr>
                <th className="px-8 py-5">Invoice Date</th>
                <th className="px-8 py-5">Amount</th>
                <th className="px-8 py-5">Plan</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoices.map((inv, idx) => (
                <tr key={idx} className="group hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <FileText size={16} className="text-slate-300" />
                      <span className="text-sm font-bold text-slate-700">{inv.date}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-sm font-black text-slate-900">{inv.amount}</td>
                  <td className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">{inv.plan}</td>
                  <td className="px-8 py-5">
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest rounded">
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button className="p-2 text-slate-300 hover:text-brand-brown hover:bg-white hover:shadow-sm rounded-lg transition-all">
                      <Download size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};