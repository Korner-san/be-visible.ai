import { UserProfile } from '@/components/UserProfile'

export default function ProfilePage() {
  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Account Settings</h1>
        <p className="text-slate-600 mt-2">
          Manage your account information and preferences
        </p>
      </div>
      
      <UserProfile />
    </div>
  )
}
