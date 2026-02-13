import React, { useState } from 'react';
import { HelpCircle, CheckCircle2, Send, MessageSquare, User, Tag, RefreshCw, AtSign } from 'lucide-react';

export const SupportPage: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
      setFormData({ name: '', email: '', subject: '', message: '' });
      setTimeout(() => setSubmitted(false), 5000);
    }, 1500);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="max-w-3xl mx-auto pb-20 animate-fadeIn flex flex-col items-center">
      {/* Centered Message Form Card */}
      <div className="w-full bg-white rounded-[40px] border border-gray-200 shadow-xl shadow-brand-brown/5 p-10 md:p-14 relative overflow-hidden">
        {/* Background Decorative Element */}
        <div className="absolute -top-12 -right-12 opacity-[0.03] pointer-events-none">
           <HelpCircle size={240} className="text-brand-brown" />
        </div>

        <div className="relative z-10">
          <div className="space-y-2 mb-10 text-center">
            <h3 className="text-3xl font-black text-slate-900 tracking-tight">How can we help?</h3>
            <p className="text-base text-slate-500 font-medium">Send our support team a message and we'll get back to you within 24 hours.</p>
          </div>

          {submitted ? (
            <div className="py-16 flex flex-col items-center text-center space-y-5 animate-fadeIn">
              <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center border border-emerald-100 animate-bounce">
                <CheckCircle2 size={48} />
              </div>
              <div className="space-y-2">
                <h4 className="text-2xl font-black text-slate-900">Message Sent!</h4>
                <p className="text-base text-slate-500 max-w-sm mx-auto">
                  Thank you for reaching out. We've received your inquiry and our team will contact you shortly at your provided email.
                </p>
              </div>
              <button 
                onClick={() => setSubmitted(false)}
                className="text-xs font-black text-brand-brown uppercase tracking-[0.2em] hover:underline pt-4"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-2">
                    <User size={12} /> Full Name
                  </label>
                  <input 
                    type="text" 
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g. Tomer S."
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-brand-brown/5 focus:border-brand-brown outline-none font-bold text-slate-700 text-sm transition-all shadow-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-2">
                    <AtSign size={12} /> Email Address
                  </label>
                  <input 
                    type="email" 
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="name@company.com"
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-brand-brown/5 focus:border-brand-brown outline-none font-bold text-slate-700 text-sm transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-2">
                  <Tag size={12} /> Subject
                </label>
                <input 
                  type="text" 
                  name="subject"
                  required
                  value={formData.subject}
                  onChange={handleInputChange}
                  placeholder="What is your request about?"
                  className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-brand-brown/5 focus:border-brand-brown outline-none font-bold text-slate-700 text-sm transition-all shadow-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-2">
                  <MessageSquare size={12} /> Your Message
                </label>
                <textarea 
                  name="message"
                  required
                  value={formData.message}
                  onChange={handleInputChange}
                  placeholder="How can we assist you today? Please provide as much detail as possible."
                  className="w-full px-6 py-5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-brand-brown/5 focus:border-brand-brown outline-none font-bold text-slate-700 text-sm min-h-[180px] resize-none transition-all shadow-sm"
                />
              </div>

              <div className="pt-6">
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full py-5 bg-brand-brown text-white font-black uppercase tracking-[0.25em] rounded-2xl shadow-2xl shadow-brand-brown/20 hover:scale-[1.01] active:scale-95 transition-all text-xs flex items-center justify-center gap-3 ${isSubmitting ? 'opacity-80 cursor-not-allowed' : ''}`}
                >
                  {isSubmitting ? (
                    <RefreshCw size={20} className="animate-spin" />
                  ) : (
                    <>
                      <Send size={20} /> Submit Support Request
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="mt-10 flex items-center gap-6 opacity-40 grayscale group hover:grayscale-0 hover:opacity-100 transition-all">
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-900 mb-1">Avg response</span>
          <span className="text-xs font-bold text-slate-500">&lt; 24 Hours</span>
        </div>
        <div className="w-px h-8 bg-gray-300"></div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-900 mb-1">Coverage</span>
          <span className="text-xs font-bold text-slate-500">Global / 24/7</span>
        </div>
      </div>
    </div>
  );
};