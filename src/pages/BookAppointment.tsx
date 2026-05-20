import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, onSnapshot, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { format, addDays, startOfToday } from 'date-fns';
import { ja } from 'date-fns/locale';
import { CheckCircle } from 'lucide-react';
import { useSettings, ExceptionalDate } from '../hooks/useSettings';

interface TimeSlot {
  start: string;
  end: string;
}

interface WeeklyAvailability {
  dayOfWeek: number;
  timeSlots: TimeSlot[];
}

interface Counselor {
  id: string;
  name: string;
  type: 'counselor' | 'social_worker';
  description?: string;
  isActive: boolean;
  weeklyAvailability?: WeeklyAvailability[];
  exceptionalDates?: ExceptionalDate[];
}

export const BookAppointment = () => {
  const { settings, loading: settingsLoading } = useSettings();
  
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [selectedCounselor, setSelectedCounselor] = useState<string>('');
  const [parentName, setParentName] = useState('');
  const [studentName, setStudentName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [date, setDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);

  const [viewMode, setViewMode] = useState<'book' | 'check'>('book');
  const [searchPhone, setSearchPhone] = useState('');
  const [myAppointments, setMyAppointments] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'counselors'), where('isActive', '==', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Counselor[];
      setCounselors(docs);
      if (docs.length > 0) setSelectedCounselor(docs[0].id);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'counselors');
    });
    return () => unsubscribe();
  }, []);

  // Fetch booked slots to prevent overlapping
  useEffect(() => {
    if (!selectedCounselor || !date || settings.allowOverlapping) {
      setBookedSlots([]);
      return;
    }
    const q = query(collection(db, 'appointments'), 
      where('counselorId', '==', selectedCounselor),
      where('date', '==', date),
      where('status', 'in', ['pending', 'confirmed'])
    );
    const unsub = onSnapshot(q, snap => {
      setBookedSlots(snap.docs.map(d => `${d.data().startTime}-${d.data().endTime}`));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'appointments');
    });
    return () => unsub();
  }, [selectedCounselor, date, settings.allowOverlapping]);

  if (settingsLoading) {
    return <div className="text-center py-12 text-gray-500">読み込み中...</div>;
  }

  const selectedCounselorData = counselors.find(c => c.id === selectedCounselor);
  const hasCounselorAvailability = Boolean(selectedCounselorData?.weeklyAvailability?.length);
  const parseTimeSlots = (timeSlotsStr: string): TimeSlot[] =>
    timeSlotsStr.split(',').map(s => {
      const [start, end] = s.trim().split('-');
      return { start, end };
    }).filter(t => t.start && t.end);

  const getTimeSlotsForDate = (dateStr: string): TimeSlot[] => {
    if (!dateStr) return [];

    const targetDate = new Date(dateStr);
    const counselorException = selectedCounselorData?.exceptionalDates?.find(ex => ex.date === dateStr);
    const schoolException = settings.exceptionalDates?.find(ex => ex.date === dateStr);
    const exception = counselorException || schoolException;

    if (exception?.type === 'closed') return [];
    if (exception?.type === 'open' && exception.timeSlotsStr) {
      return parseTimeSlots(exception.timeSlotsStr);
    }

    if (hasCounselorAvailability) {
      return selectedCounselorData?.weeklyAvailability?.find(day => day.dayOfWeek === targetDate.getDay())?.timeSlots || [];
    }

    return settings.allowedDaysOfWeek.includes(targetDate.getDay()) ? settings.timeSlots : [];
  };

  // Generate available dates
  const today = startOfToday();
  const availableDates: string[] = [];
  for (let i = settings.bookingMinDaysAhead; i <= settings.bookingMaxDaysAhead; i++) {
    const d = addDays(today, i);
    const dateStr = format(d, 'yyyy-MM-dd');
    if (getTimeSlotsForDate(dateStr).length > 0) {
      availableDates.push(dateStr);
    }
  }

  // Get time slots for selected date
  const activeTimeSlots = getTimeSlotsForDate(date);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCounselor || !date || !timeSlot || !studentName || !parentName || !phoneNumber) return;

    setLoading(true);
    try {
      const [startTime, endTime] = timeSlot.split('-');
      
      const newAppointment = {
        counselorId: selectedCounselor,
        parentId: 'anonymous',
        parentName,
        studentName,
        phoneNumber,
        date,
        startTime,
        endTime,
        status: 'pending',
        notes,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'appointments'), newAppointment);
      
      setIsSubmitted(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'appointments');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchPhone) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'appointments'), where('phoneNumber', '==', searchPhone));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a: any, b: any) => b.date.localeCompare(a.date));
      setMyAppointments(docs);
      setHasSearched(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'appointments');
    } finally {
      setLoading(false);
    }
  };

  const confirmCancel = async (id: string) => {
    try {
      await updateDoc(doc(db, 'appointments', id), { status: 'cancelled' });
      
      setMyAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'cancelled' } : a));
      setCancelConfirmId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `appointments/${id}`);
    }
  };

  if (isSubmitted) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">予約リクエストを送信しました</h2>
        <p className="text-gray-600 mb-8">
          担当者が内容を確認し、日程があわない場合のみ連絡致します。<br />
          ご不明な点がある場合は、学校までお問い合わせください。
        </p>
        <button
          onClick={() => {
            setIsSubmitted(false);
            setParentName('');
            setStudentName('');
            setPhoneNumber('');
            setDate('');
            setTimeSlot('');
            setNotes('');
          }}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          続けて予約する
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="grid grid-cols-2 gap-2 mb-8 border-b border-gray-200 pb-4 sm:flex sm:space-x-4 sm:gap-0">
        <button
          onClick={() => setViewMode('book')}
          className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors sm:px-4 ${viewMode === 'book' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'}`}
        >
          新規予約
        </button>
        <button
          onClick={() => setViewMode('check')}
          className={`px-3 py-2 rounded-lg font-medium text-sm leading-snug transition-colors sm:px-4 ${viewMode === 'check' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'}`}
        >
          予約の確認・キャンセル
        </button>
      </div>

      {viewMode === 'check' ? (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">予約の確認・キャンセル</h2>
          <form onSubmit={handleSearch} className="flex flex-col gap-3 mb-6 sm:flex-row">
            <input
              type="tel"
              required
              value={searchPhone}
              onChange={e => setSearchPhone(e.target.value)}
              placeholder="予約時の電話番号 (例: 09012345678)"
              className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:flex-1 sm:text-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 sm:w-auto"
            >
              {loading ? '検索中...' : '検索'}
            </button>
          </form>

          {hasSearched && (
            <div className="space-y-4">
              {myAppointments.length === 0 ? (
                <p className="text-gray-500 text-center py-4">予約が見つかりませんでした。</p>
              ) : (
                myAppointments.map(apt => (
                  <div key={apt.id} className="border border-gray-200 rounded-lg p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="w-full font-medium text-gray-900 sm:w-auto">{format(new Date(apt.date), 'yyyy年MM月dd日 (E)', { locale: ja })}</span>
                        <span className="text-sm text-gray-600 sm:text-base">{apt.startTime} - {apt.endTime}</span>
                        {apt.status === 'pending' && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">承認待ち</span>}
                        {apt.status === 'confirmed' && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">予約確定</span>}
                        {apt.status === 'cancelled' && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">キャンセル済</span>}
                      </div>
                      <p className="text-sm text-gray-500">対象: {apt.studentName} / 担当: {counselors.find(c => c.id === apt.counselorId)?.name || '不明'}</p>
                    </div>
                    <div className="w-full sm:w-auto">
                      {apt.status !== 'cancelled' && (
                        cancelConfirmId === apt.id ? (
                          <div className="grid grid-cols-2 gap-2 bg-red-50 p-2 rounded-lg border border-red-100 sm:flex sm:items-center">
                            <span className="col-span-2 text-xs text-red-600 font-bold sm:col-auto">キャンセルしますか？</span>
                            <button onClick={() => confirmCancel(apt.id)} className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded transition">はい</button>
                            <button onClick={() => setCancelConfirmId(null)} className="text-xs bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded transition">戻る</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setCancelConfirmId(apt.id)}
                            className="w-full text-sm text-red-600 hover:text-red-800 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg transition sm:w-auto sm:py-1.5"
                          >
                            キャンセル
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">新規予約</h1>
            {settings.siteDescription && (
              <p className="text-gray-600 whitespace-pre-wrap">{settings.siteDescription}</p>
            )}
          </div>
          
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-6">
              
              <div>
                <label className="block text-sm font-medium text-gray-700">面談担当者</label>
                <select
                  required
                  value={selectedCounselor}
                  onChange={(e) => {
                    setSelectedCounselor(e.target.value);
                    setDate('');
                    setTimeSlot('');
                  }}
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                >
                  <option value="" disabled>選択してください</option>
                  {counselors.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type === 'counselor' ? 'スクールカウンセラー' : 'スクールソーシャルワーカー'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">保護者氏名</label>
                  <input
                    type="text"
                    required
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="山田 花子"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">対象児童・生徒氏名</label>
                  <input
                    type="text"
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="山田 太郎"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">電話番号</label>
                <input
                  type="tel"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="例: 09012345678 (ハイフン不要)"
                />
              </div>

              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">希望日</label>
                  <select
                    required
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setTimeSlot(''); // Reset time slot when date changes
                    }}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                  >
                    <option value="" disabled>選択してください</option>
                    {availableDates.length === 0 && <option disabled>予約可能な日がありません</option>}
                    {availableDates.map(d => (
                      <option key={d} value={d}>
                        {format(new Date(d), 'yyyy年MM月dd日 (E)', { locale: ja })}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">希望時間</label>
                  <select
                    required
                    value={timeSlot}
                    onChange={(e) => setTimeSlot(e.target.value)}
                    disabled={!date}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="" disabled>選択してください</option>
                    {activeTimeSlots.map(t => {
                      const slotStr = `${t.start}-${t.end}`;
                      const isBooked = !settings.allowOverlapping && bookedSlots.includes(slotStr);
                      return (
                        <option key={slotStr} value={slotStr} disabled={isBooked}>
                          {t.start} - {t.end} {isBooked ? '(予約済)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">相談内容・備考 (任意)</label>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="事前に伝えておきたいことがあればご記入ください"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setParentName('');
                    setStudentName('');
                    setPhoneNumber('');
                    setDate('');
                    setTimeSlot('');
                    setNotes('');
                  }}
                  className="bg-white py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 mr-3"
                >
                  クリア
                </button>
                <button
                  type="submit"
                  disabled={loading || !date || !timeSlot}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {loading ? '予約中...' : '予約を申し込む'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
