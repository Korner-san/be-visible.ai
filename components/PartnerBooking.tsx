'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar, MapPin, Star, Users, Award, ChevronLeft, ExternalLink, Check } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface PartnerBookingProps {
  domain: string
  onBack: () => void
}

export function PartnerBooking({ domain, onBack }: PartnerBookingProps) {
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [isBooked, setIsBooked] = useState(false)

  // Available time slots
  const timeSlots = [
    '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
    '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'
  ]

  // Get min date (today) and max date (30 days from now)
  const today = new Date().toISOString().split('T')[0]
  const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const handleBookMeeting = () => {
    if (selectedDate && selectedTime) {
      setIsBooked(true)
      // In a real app, this would send the booking data to the backend
      setTimeout(() => {
        alert(`Meeting booked with Reddit Agency on ${new Date(selectedDate).toLocaleDateString()} at ${selectedTime}!`)
      }, 1500)
    }
  }

  if (isBooked) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <div className="text-center">
          <p className="text-xl font-semibold text-slate-900">Meeting Confirmed!</p>
          <p className="text-sm text-slate-600 mt-2">
            You'll receive a calendar invite at your email shortly.
          </p>
          <div className="mt-4 p-4 bg-slate-50 rounded-lg border">
            <p className="text-sm font-medium">Reddit Agency</p>
            <p className="text-sm text-slate-600">
              {new Date(selectedDate).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
            <p className="text-sm text-slate-600">{selectedTime}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="flex items-center gap-1 text-slate-600 hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Scope
      </Button>

      {/* Partner Card */}
      <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white">
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            {/* Logo */}
            <div className="flex-shrink-0">
              <div className="w-24 h-24 rounded-lg bg-white border-2 border-slate-200 flex items-center justify-center shadow-sm">
                {/* Reddit Agency Logo - Using a placeholder with initials */}
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">RA</div>
                  <div className="text-[10px] text-slate-500 mt-1">AGENCY</div>
                </div>
              </div>
            </div>

            {/* Partner Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Reddit Agency</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    BeVisible Certified Partner
                  </p>
                </div>
                <Badge className="bg-blue-600 text-white">
                  <Award className="h-3 w-3 mr-1" />
                  Certified
                </Badge>
              </div>

              {/* Partner stats */}
              <div className="flex items-center gap-4 mt-4">
                <div className="flex items-center gap-1 text-sm text-slate-600">
                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                  <span className="font-medium">4.9</span>
                  <span className="text-slate-400">(47 reviews)</span>
                </div>
                <div className="flex items-center gap-1 text-sm text-slate-600">
                  <Users className="h-4 w-4" />
                  <span>150+ campaigns</span>
                </div>
              </div>

              {/* Specialization */}
              <div className="mt-4">
                <p className="text-sm font-medium text-slate-900 mb-2">Specialization:</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="text-xs">Reddit Marketing</Badge>
                  <Badge variant="secondary" className="text-xs">Community Growth</Badge>
                  <Badge variant="secondary" className="text-xs">AI Visibility</Badge>
                  <Badge variant="secondary" className="text-xs">Content Strategy</Badge>
                </div>
              </div>

              {/* Location */}
              <div className="mt-3 flex items-center gap-1 text-sm text-slate-600">
                <MapPin className="h-4 w-4" />
                <span>San Francisco, CA</span>
              </div>

              {/* Quick description */}
              <p className="text-sm text-slate-600 mt-4 leading-relaxed">
                Expert Reddit marketing agency specializing in building authentic community presence
                and improving AI visibility through strategic content and engagement.
              </p>

              {/* Website link */}
              <a
                href="https://redditagency.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-2"
              >
                Visit website
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Booking Section */}
      <div className="border rounded-lg p-6 bg-white">
        <h4 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          Schedule a Discovery Call
        </h4>
        <p className="text-sm text-slate-600 mb-6">
          Book a 30-minute call to discuss your {domain} visibility goals and how Reddit Agency can help.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Date Picker */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={today}
              max={maxDate}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Time Picker */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select Time (PST)
            </label>
            <select
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              disabled={!selectedDate}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
            >
              <option value="">Choose a time</option>
              {timeSlots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected info preview */}
        {selectedDate && selectedTime && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900">
              Your meeting:
            </p>
            <p className="text-sm text-blue-800 mt-1">
              {new Date(selectedDate).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })} at {selectedTime} (PST)
            </p>
          </div>
        )}

        {/* Book button */}
        <Button
          onClick={handleBookMeeting}
          disabled={!selectedDate || !selectedTime}
          className="w-full mt-6 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300"
        >
          <Calendar className="h-4 w-4 mr-2" />
          Confirm Meeting
        </Button>
      </div>
    </div>
  )
}
