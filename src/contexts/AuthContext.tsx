import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';

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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          // Check settings for admin emails
          const settingsDoc = await getDoc(doc(db, 'settings', 'general'));
          const adminEmails = settingsDoc.exists() ? settingsDoc.data().adminEmails || ['yishigeict@gmail.com'] : ['yishigeict@gmail.com'];
          const isAdmin = adminEmails.includes(firebaseUser.email);

          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            // Update role if admin status changed
            if (isAdmin && data.role !== 'admin') {
              await setDoc(userDocRef, { ...data, role: 'admin' }, { merge: true });
              setProfile({ ...data, role: 'admin' });
            } else {
              setProfile(data);
            }
          } else {
            // Create new user profile
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              role: isAdmin ? 'admin' : 'parent',
              displayName: firebaseUser.displayName || '名無し',
            };
            await setDoc(userDocRef, newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
