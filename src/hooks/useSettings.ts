import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface ExceptionalDate {
  date: string;
  type: 'closed' | 'open';
  timeSlotsStr?: string; // e.g. "09:00-09:50, 10:00-10:50"
}

export interface SystemSettings {
  siteTitle: string;
  siteDescription: string;
  adminEmails: string[];
  bookingMinDaysAhead: number;
  bookingMaxDaysAhead: number;
  allowedDaysOfWeek: number[]; // 0=Sun, 1=Mon, ... 6=Sat
  timeSlots: { start: string; end: string }[];
  allowOverlapping: boolean;
  exceptionalDates: ExceptionalDate[];
}

export const defaultSettings: SystemSettings = {
  siteTitle: 'School Care Connect',
  siteDescription: '保護者様向けの面談予約システムです',
  adminEmails: ['yishigeict@gmail.com'],
  bookingMinDaysAhead: 1,
  bookingMaxDaysAhead: 14,
  allowedDaysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
  timeSlots: [
    { start: '09:00', end: '09:50' },
    { start: '10:00', end: '10:50' },
    { start: '11:00', end: '11:50' },
    { start: '13:00', end: '13:50' },
    { start: '14:00', end: '14:50' },
    { start: '15:00', end: '15:50' },
  ],
  allowOverlapping: false,
  exceptionalDates: [],
};

export const useSettings = () => {
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const docRef = doc(db, 'settings', 'general');
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        setSettings({ ...defaultSettings, ...snapshot.data() } as SystemSettings);
      } else {
        // Initialize if not exists
        setDoc(docRef, defaultSettings).catch(console.error);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return { settings, loading };
};
