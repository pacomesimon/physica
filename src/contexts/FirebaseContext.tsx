import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  isSigningIn: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  clearAuthError: () => void;
}

const FirebaseContext = createContext<FirebaseContextValue | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: unknown) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';
      // Closing the popup is a deliberate cancel, not an actionable error
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        const message =
          error instanceof Error ? error.message : 'Unable to sign in with Google right now.';
        setAuthError(message);
      }
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    try {
      await signOut(auth);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to sign out right now.';
      setAuthError(message);
    }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <FirebaseContext.Provider
      value={{
        user,
        authReady,
        isSigningIn,
        authError,
        signInWithGoogle,
        signOutUser,
        clearAuthError,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export function useFirebaseAuth(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebaseAuth must be used within a FirebaseProvider');
  }
  return ctx;
}
