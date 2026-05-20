import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export interface UserProfile {
  uid: string;
  email: string;
  role: 'parent' | 'admin';
  displayName: string;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  authError: null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          setAuthError(null);
          // Check settings for admin emails
          const settingsDoc = await getDoc(doc(db, 'settings', 'general'));
          const adminEmails = settingsDoc.exists()
            ? settingsDoc.data().adminEmails || ['yishigeict@gmail.com']
            : ['yishigeict@gmail.com'];
          const normalizedUserEmail = firebaseUser.email?.toLowerCase() || '';
          const isAdmin = adminEmails
            .map((email: string) => email.toLowerCase())
            .includes(normalizedUserEmail);

          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          const currentRole = isAdmin ? 'admin' : 'parent';
          
          if (userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            const updatedProfile = { ...data, role: currentRole };
            setProfile(updatedProfile);

            if (data.role !== currentRole) {
              setDoc(userDocRef, { role: currentRole }, { merge: true }).catch((error) => {
                console.warn('Failed to sync user role:', error);
              });
            }
          } else {
            // Create new user profile
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              role: currentRole,
              displayName: firebaseUser.displayName || '名無し',
            };
            await setDoc(userDocRef, newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          console.error('Failed to load user profile:', error);
          setProfile(null);
          setAuthError(
            'ログインは完了しましたが、ユーザー情報を読み込めませんでした。Firestoreの権限設定または管理者メール設定を確認してください。',
          );
        }
      } else {
        setProfile(null);
        setAuthError(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, authError }}>
      {children}
    </AuthContext.Provider>
  );
};
