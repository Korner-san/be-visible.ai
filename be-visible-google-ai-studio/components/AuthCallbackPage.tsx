import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface AuthCallbackPageProps {
  onSuccess: () => void;
}

/**
 * Handles email confirmation redirects from Supabase.
 * Supabase appends #access_token=... to the URL after email confirmation.
 * This component reads the session from the URL hash, signs the user in,
 * then calls onSuccess so the routing state machine takes over.
 */
export const AuthCallbackPage: React.FC<AuthCallbackPageProps> = ({ onSuccess }) => {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Supabase reads access_token from the URL hash automatically
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error('[AuthCallback] Session error:', error);
          setErrorMessage(error.message);
          setStatus('error');
          return;
        }

        if (data.session) {
          setStatus('success');
          setTimeout(onSuccess, 800);
          return;
        }

        // If no session yet, try to exchange the token in the hash
        const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error: setError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (setError) {
            console.error('[AuthCallback] Set session error:', setError);
            setErrorMessage(setError.message);
            setStatus('error');
            return;
          }

          setStatus('success');
          setTimeout(onSuccess, 800);
        } else {
          // No token in hash — might be a plain redirect, proceed anyway
          setStatus('success');
          setTimeout(onSuccess, 400);
        }
      } catch (err) {
        console.error('[AuthCallback] Unexpected error:', err);
        setErrorMessage('An unexpected error occurred. Please try signing in manually.');
        setStatus('error');
      }
    };

    handleCallback();
  }, [onSuccess]);

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 w-full max-w-sm text-center space-y-4">
          <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mx-auto">
            <span className="text-red-600 text-xl font-bold">!</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Confirmation Failed</h2>
          <p className="text-sm text-gray-500">{errorMessage || 'The confirmation link may have expired.'}</p>
          <button
            onClick={() => {
              window.history.replaceState(null, '', window.location.pathname);
              onSuccess();
            }}
            className="w-full py-2.5 px-4 bg-brand-brown text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 bg-brand-brown rounded-xl flex items-center justify-center mx-auto shadow-sm">
          <span className="text-white font-bold text-xl">B</span>
        </div>
        {status === 'success' ? (
          <>
            <div className="w-8 h-8 border-4 border-gray-200 border-t-green-500 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-500">Email confirmed! Loading your account…</p>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-4 border-gray-200 border-t-brand-brown rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-500">Confirming your email…</p>
          </>
        )}
      </div>
    </div>
  );
};
