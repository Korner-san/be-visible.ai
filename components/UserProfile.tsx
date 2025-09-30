'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import { Loader2, User, Mail, Building, Calendar, Shield, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

const profileSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  companyName: z.string().optional(),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

type ProfileFormData = z.infer<typeof profileSchema>
type PasswordFormData = z.infer<typeof passwordSchema>

export const UserProfile = () => {
  const { user, signIn, updatePassword, signOut } = useAuth()
  const router = useRouter()
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.user_metadata?.first_name || '',
      lastName: user?.user_metadata?.last_name || '',
      companyName: user?.user_metadata?.company_name || '',
    },
  })

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  })

  const handleUpdateProfile = async (data: ProfileFormData) => {
    setIsUpdatingProfile(true)
    setProfileError(null)
    setProfileSuccess(null)

    try {
      // Note: In a real app, you'd update the user profile through Supabase
      // For now, we'll simulate the update
      console.log('Updating profile:', data)
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      setProfileSuccess('Profile updated successfully!')
    } catch (error) {
      setProfileError('Failed to update profile. Please try again.')
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  const handleUpdatePassword = async (data: PasswordFormData) => {
    setIsUpdatingPassword(true)
    setPasswordError(null)
    setPasswordSuccess(null)

    try {
      // Verify current password by attempting to sign in
      const { error: signInError } = await signIn(user?.email || '', data.currentPassword)
      
      if (signInError) {
        setPasswordError('Current password is incorrect')
        return
      }

      // Update password
      const { error: updateError } = await updatePassword(data.newPassword)
      
      if (updateError) {
        setPasswordError(updateError.message)
      } else {
        setPasswordSuccess('Password updated successfully!')
        passwordForm.reset()
      }
    } catch (error) {
      setPasswordError('An unexpected error occurred. Please try again.')
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true)
    setDeleteError(null)

    try {
      const supabase = createClient()
      
      if (!user?.id) {
        setDeleteError('User not found. Please try signing in again.')
        return
      }

      // Call the database function to delete the current user
      const { error } = await supabase.rpc('delete_current_user')

      if (error) {
        console.error('Delete account error:', error)
        setDeleteError(`Failed to delete account: ${error.message}`)
        return
      }

      // Sign out and redirect to home
      await signOut()
      router.push('/auth/signin?message=Your account has been successfully deleted.')
      
    } catch (error) {
      console.error('Delete account error:', error)
      setDeleteError('Failed to delete account. Please try again.')
    } finally {
      setIsDeletingAccount(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Information
          </CardTitle>
          <CardDescription>
            Update your personal information and account details
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={profileForm.handleSubmit(handleUpdateProfile)}>
          <CardContent className="space-y-4">
            {profileSuccess && (
              <Alert>
                <AlertDescription>{profileSuccess}</AlertDescription>
              </Alert>
            )}
            
            {profileError && (
              <Alert variant="destructive">
                <AlertDescription>{profileError}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  {...profileForm.register('firstName')}
                />
                {profileForm.formState.errors.firstName && (
                  <p className="text-sm text-red-600">{profileForm.formState.errors.firstName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  {...profileForm.register('lastName')}
                />
                {profileForm.formState.errors.lastName && (
                  <p className="text-sm text-red-600">{profileForm.formState.errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name (Optional)</Label>
              <Input
                id="companyName"
                {...profileForm.register('companyName')}
              />
            </div>

            <Separator />

            {/* Account Information (Read-only) */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-slate-900">Account Information</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-600">Email:</span>
                  <span className="font-medium">{user.email}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-600">Member since:</span>
                  <span className="font-medium">{formatDate(user.created_at)}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-600">Plan:</span>
                  <span className="font-medium capitalize">Basic</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-600">User ID:</span>
                  <span className="font-mono text-xs">{user.id.slice(0, 8)}...</span>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter>
            <Button
              type="submit"
              disabled={isUpdatingProfile}
            >
              {isUpdatingProfile ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Profile'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Password Update */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={passwordForm.handleSubmit(handleUpdatePassword)}>
          <CardContent className="space-y-4">
            {passwordSuccess && (
              <Alert>
                <AlertDescription>{passwordSuccess}</AlertDescription>
              </Alert>
            )}
            
            {passwordError && (
              <Alert variant="destructive">
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                {...passwordForm.register('currentPassword')}
              />
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-sm text-red-600">{passwordForm.formState.errors.currentPassword.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                {...passwordForm.register('newPassword')}
              />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-sm text-red-600">{passwordForm.formState.errors.newPassword.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                {...passwordForm.register('confirmPassword')}
              />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-sm text-red-600">{passwordForm.formState.errors.confirmPassword.message}</p>
              )}
            </div>
          </CardContent>

          <CardFooter>
            <Button
              type="submit"
              disabled={isUpdatingPassword}
              variant="outline"
            >
              {isUpdatingPassword ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Password'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Delete Account */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-5 w-5" />
            Delete Account
          </CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data. This action cannot be undone.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {deleteError && (
            <Alert variant="destructive">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              When you delete your account:
            </p>
            <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
              <li>All your brands and reports will be permanently deleted</li>
              <li>Your subscription will be cancelled</li>
              <li>You will lose access to all data immediately</li>
              <li>This action cannot be reversed</li>
            </ul>
          </div>
        </CardContent>

        <CardFooter>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="destructive" 
                disabled={isDeletingAccount}
                className="w-full sm:w-auto"
              >
                {isDeletingAccount ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting Account...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Account
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your account
                  and remove all your data from our servers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Yes, delete my account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    </div>
  )
}
