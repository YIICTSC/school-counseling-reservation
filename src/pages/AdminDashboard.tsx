import React, { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, addDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Bell, Calendar, Users, CheckCircle, XCircle, Trash2, Plus, Settings, Save, X } from 'lucide-react';
import { useSettings, SystemSettings, ExceptionalDate } from '../hooks/useSettings';

interface Appointment {
  id: string;
  counselorId: string;
  parentId: string;
  parentName: string;
  studentName: string;
  parentEmail?: string;
  phoneNumber?: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  notes: string;
  createdAt: string;
}

interface Counselor {
  id: string;
  name: string;
  type: 'counselor' | 'social_worker';
  description?: string;
  isActive: boolean;
}

export const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState<'appointments' | 'counselors' | 'settings'>('appointments');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingCounselorId, setDeletingCounselorId] = useState<string | null>(null);
  const [deletingAppointmentId, setDeletingAppointmentId] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'default' : Notification.permission
  );
  const hasLoadedInitialAppointments = useRef(false);

  // Settings State
  const { settings, loading: settingsLoading } = useSettings();
  const [formData, setFormData] = useState<SystemSettings>(settings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [adminEmailsInput, setAdminEmailsInput] = useState('');

  useEffect(() => {
    if (!settingsLoading) {
      setFormData(settings);
      setAdminEmailsInput(settings.adminEmails.join('\n'));
    }
  }, [settings, settingsLoading]);

  // New Counselor State
  const [newCounselor, setNewCounselor] = useState({
    name: '',
    type: 'counselor' as 'counselor' | 'social_worker',
    description: '',
    isActive: true
  });

  useEffect(() => {
    const qAppointments = query(collection(db, 'appointments'));
    const unsubAppointments = onSnapshot(qAppointments, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Appointment[];
      const addedAppointments = snapshot
        .docChanges()
        .filter(change => change.type === 'added')
        .map(change => ({ id: change.doc.id, ...change.doc.data() }) as Appointment);

      if (hasLoadedInitialAppointments.current) {
        addedAppointments
          .filter(apt => apt.status === 'pending')
          .forEach(showAppointmentNotification);
      } else {
        hasLoadedInitialAppointments.current = true;
      }

      // Sort by date and time
      docs.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.startTime.localeCompare(a.startTime);
      });
      setAppointments(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'appointments');
    });

    const qCounselors = query(collection(db, 'counselors'));
    const unsubCounselors = onSnapshot(qCounselors, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Counselor[];
      setCounselors(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'counselors');
    });

    return () => {
      unsubAppointments();
      unsubCounselors();
    };
  }, []);

  const isNotificationSupported = typeof Notification !== 'undefined';

  const handleEnableNotifications = async () => {
    if (!isNotificationSupported) return;

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  const showAppointmentNotification = (appointment: Appointment) => {
    if (!isNotificationSupported || Notification.permission !== 'granted') return;

    const formattedDate = format(new Date(appointment.date), 'yyyy年MM月dd日 (E)', { locale: ja });
    const notification = new Notification('新しい予約リクエストがあります', {
      body: `${appointment.parentName} / ${appointment.studentName}\n${formattedDate} ${appointment.startTime}-${appointment.endTime}`,
      tag: `appointment-${appointment.id}`,
      requireInteraction: true,
    });

    notification.onclick = () => {
      window.focus();
      setActiveTab('appointments');
      notification.close();
    };
  };

  const sendApprovalEmail = async (appointment: Appointment) => {
    const formattedDate = format(new Date(appointment.date), 'yyyy年MM月dd日 (E)', { locale: ja });
    const counselorName = getCounselorName(appointment.counselorId);
    const subject = `面談予約が承認されました: ${formattedDate} ${appointment.startTime}-${appointment.endTime}`;
    const text = `${appointment.parentName} 様

面談予約が承認されました。

対象児童・生徒: ${appointment.studentName}
担当者: ${counselorName}
日時: ${formattedDate} ${appointment.startTime}-${appointment.endTime}

当日は予約時間にお越しください。
`;

    await addDoc(collection(db, 'mail'), {
      to: [appointment.parentEmail],
      message: {
        subject,
        text,
        html: text.replace(/\n/g, '<br />'),
      },
      appointmentId: appointment.id,
      createdAt: new Date().toISOString(),
    });
  };

  const handleUpdateStatus = async (id: string, newStatus: 'confirmed' | 'cancelled') => {
    try {
      await updateDoc(doc(db, 'appointments', id), { status: newStatus });
      const appointment = appointments.find(apt => apt.id === id);
      if (newStatus === 'confirmed' && appointment?.parentEmail) {
        await sendApprovalEmail(appointment);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `appointments/${id}`);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'appointments', id));
      setDeletingAppointmentId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `appointments/${id}`);
    }
  };

  const handleAddCounselor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'counselors'), newCounselor);
      setNewCounselor({ name: '', type: 'counselor', description: '', isActive: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'counselors');
    }
  };

  const handleDeleteCounselor = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'counselors', id));
      setDeletingCounselorId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `counselors/${id}`);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await setDoc(doc(db, 'settings', 'general'), formData);
      alert('設定を保存しました');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/general');
      alert('設定の保存に失敗しました');
    } finally {
      setSavingSettings(false);
    }
  };

  const getCounselorName = (id: string) => {
    return counselors.find(c => c.id === id)?.name || '不明な担当者';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">承認待ち</span>;
      case 'confirmed':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">予約確定</span>;
      case 'cancelled':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">キャンセル</span>;
      default:
        return null;
    }
  };

  if (loading || settingsLoading) {
    return <div className="flex justify-center items-center h-64 text-gray-500">読み込み中...</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-gray-900">管理者ダッシュボード</h1>
          {isNotificationSupported && notificationPermission !== 'granted' && (
            <button
              onClick={handleEnableNotifications}
              className="inline-flex items-center justify-center px-4 py-2 border border-indigo-200 text-sm font-medium rounded-md text-indigo-700 bg-indigo-50 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Bell className="w-4 h-4 mr-2" />
              新規予約の通知を有効にする
            </button>
          )}
          {isNotificationSupported && notificationPermission === 'denied' && (
            <p className="text-sm text-red-600">
              ブラウザで通知がブロックされています。サイト設定から通知を許可してください。
            </p>
          )}
        </div>
      </div>

      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('appointments')}
            className={`${
              activeTab === 'appointments'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
          >
            <Calendar className="w-4 h-4 mr-2" />
            予約管理
          </button>
          <button
            onClick={() => setActiveTab('counselors')}
            className={`${
              activeTab === 'counselors'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
          >
            <Users className="w-4 h-4 mr-2" />
            担当者管理
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`${
              activeTab === 'settings'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
          >
            <Settings className="w-4 h-4 mr-2" />
            システム設定
          </button>
        </nav>
      </div>

      {activeTab === 'appointments' && (
        <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
          <ul className="divide-y divide-gray-200">
            {appointments.map((apt) => (
              <li key={apt.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-medium text-gray-900">
                          {format(new Date(apt.date), 'yyyy年MM月dd日 (E)', { locale: ja })}
                        </span>
                        <span className="text-sm text-gray-500">
                          {apt.startTime} - {apt.endTime}
                        </span>
                        {getStatusBadge(apt.status)}
                      </div>
                      <div className="text-sm text-gray-500">
                        申込日: {format(new Date(apt.createdAt), 'yyyy/MM/dd HH:mm')}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <p className="text-sm text-gray-500">担当者</p>
                        <p className="text-sm font-medium text-gray-900">{getCounselorName(apt.counselorId)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">保護者氏名 / 対象児童・生徒</p>
                        <p className="text-sm font-medium text-gray-900">{apt.parentName} / {apt.studentName}</p>
                        {apt.parentEmail && <p className="text-sm text-gray-500 mt-1">✉ {apt.parentEmail}</p>}
                        {apt.phoneNumber && <p className="text-sm text-gray-500 mt-1">📞 {apt.phoneNumber}</p>}
                      </div>
                      {apt.notes && (
                        <div className="col-span-2">
                          <p className="text-sm text-gray-500">備考</p>
                          <p className="text-sm text-gray-900 mt-1 bg-gray-50 p-3 rounded-lg">{apt.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="ml-6 flex items-center space-x-3 border-l pl-6 border-gray-200">
                    {deletingAppointmentId === apt.id ? (
                      <div className="flex items-center space-x-2 bg-red-50 p-2 rounded-lg border border-red-100">
                        <span className="text-xs text-red-600 font-bold">本当に削除しますか？</span>
                        <button onClick={() => handleDeleteAppointment(apt.id)} className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded transition">はい</button>
                        <button onClick={() => setDeletingAppointmentId(null)} className="text-xs bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded transition">キャンセル</button>
                      </div>
                    ) : (
                      <>
                        {apt.status === 'pending' && (
                          <button
                            onClick={() => handleUpdateStatus(apt.id, 'confirmed')}
                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            承認
                          </button>
                        )}
                        {apt.status !== 'cancelled' && (
                          <button
                            onClick={() => handleUpdateStatus(apt.id, 'cancelled')}
                            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            却下
                          </button>
                        )}
                        <button
                          onClick={() => setDeletingAppointmentId(apt.id)}
                          className="inline-flex items-center px-3 py-2 border border-red-200 text-sm leading-4 font-medium rounded-md text-red-600 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          削除
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
            {appointments.length === 0 && (
              <li className="p-8 text-center text-gray-500">
                予約リクエストはありません
              </li>
            )}
          </ul>
        </div>
      )}

      {activeTab === 'counselors' && (
        <div className="space-y-8">
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">担当者の追加</h2>
            <form onSubmit={handleAddCounselor} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">氏名</label>
                  <input
                    type="text"
                    required
                    value={newCounselor.name}
                    onChange={(e) => setNewCounselor({ ...newCounselor, name: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">職種</label>
                  <select
                    value={newCounselor.type}
                    onChange={(e) => setNewCounselor({ ...newCounselor, type: e.target.value as 'counselor' | 'social_worker' })}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                  >
                    <option value="counselor">スクールカウンセラー</option>
                    <option value="social_worker">スクールソーシャルワーカー</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">紹介文・備考 (任意)</label>
                <textarea
                  rows={2}
                  value={newCounselor.description}
                  onChange={(e) => setNewCounselor({ ...newCounselor, description: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  追加する
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
            <ul className="divide-y divide-gray-200">
              {counselors.map((counselor) => (
                <li key={counselor.id} className="p-6 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <div className="flex items-center space-x-3">
                      <h3 className="text-sm font-medium text-gray-900">{counselor.name}</h3>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {counselor.type === 'counselor' ? 'スクールカウンセラー' : 'スクールソーシャルワーカー'}
                      </span>
                    </div>
                    {counselor.description && (
                      <p className="mt-2 text-sm text-gray-500">{counselor.description}</p>
                    )}
                  </div>
                  <div className="ml-4">
                    {deletingCounselorId === counselor.id ? (
                      <div className="flex items-center space-x-2 bg-red-50 p-2 rounded-lg border border-red-100">
                        <span className="text-xs text-red-600 font-bold">削除しますか？</span>
                        <button onClick={() => handleDeleteCounselor(counselor.id)} className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded transition">はい</button>
                        <button onClick={() => setDeletingCounselorId(null)} className="text-xs bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded transition">キャンセル</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingCounselorId(counselor.id)}
                        className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-50 transition"
                        title="削除"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
              {counselors.length === 0 && (
                <li className="p-8 text-center text-gray-500">
                  登録されている担当者はいません
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-8">
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-medium text-gray-900">システム設定</h2>
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <Save className="w-4 h-4 mr-2" />
                {savingSettings ? '保存中...' : '設定を保存'}
              </button>
            </div>

            <div className="space-y-8">
              {/* サイト設定 */}
              <section>
                <h3 className="text-md font-medium text-gray-900 mb-4 border-b pb-2">サイト設定</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">サイトタイトル</label>
                    <input
                      type="text"
                      value={formData.siteTitle}
                      onChange={e => setFormData({ ...formData, siteTitle: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">サイト説明文</label>
                    <textarea
                      rows={3}
                      value={formData.siteDescription}
                      onChange={e => setFormData({ ...formData, siteDescription: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">共同管理者メールアドレス (1行に1つ)</label>
                    <p className="text-xs text-gray-500 mb-1">ここに登録されたGoogleアカウントでログインすると、管理者としてアクセスできます。</p>
                    <textarea
                      rows={3}
                      value={adminEmailsInput}
                      onChange={e => setAdminEmailsInput(e.target.value)}
                      onBlur={() => setFormData({ ...formData, adminEmails: adminEmailsInput.split('\n').map(s => s.trim()).filter(Boolean) })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm font-mono"
                    />
                  </div>
                </div>
              </section>

              {/* 予約ルール */}
              <section>
                <h3 className="text-md font-medium text-gray-900 mb-4 border-b pb-2">予約ルール</h3>
                <div className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">予約受付開始</label>
                      <div className="mt-1 flex items-center">
                        <input
                          type="number"
                          min="0"
                          value={formData.bookingMinDaysAhead}
                          onChange={e => setFormData({ ...formData, bookingMinDaysAhead: parseInt(e.target.value) || 0 })}
                          className="block w-20 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                        <span className="ml-2 text-sm text-gray-600">日後から</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">予約受付終了</label>
                      <div className="mt-1 flex items-center">
                        <input
                          type="number"
                          min="1"
                          value={formData.bookingMaxDaysAhead}
                          onChange={e => setFormData({ ...formData, bookingMaxDaysAhead: parseInt(e.target.value) || 1 })}
                          className="block w-20 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                        <span className="ml-2 text-sm text-gray-600">日後まで</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">予約可能曜日</label>
                    <div className="flex flex-wrap gap-4">
                      {['日', '月', '火', '水', '木', '金', '土'].map((day, index) => (
                        <label key={index} className="inline-flex items-center">
                          <input
                            type="checkbox"
                            checked={formData.allowedDaysOfWeek.includes(index)}
                            onChange={() => {
                              const newDays = formData.allowedDaysOfWeek.includes(index)
                                ? formData.allowedDaysOfWeek.filter(d => d !== index)
                                : [...formData.allowedDaysOfWeek, index].sort();
                              setFormData({ ...formData, allowedDaysOfWeek: newDays });
                            }}
                            className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                          />
                          <span className="ml-2 text-sm text-gray-700">{day}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="inline-flex items-center mt-2">
                      <input
                        type="checkbox"
                        checked={formData.allowOverlapping}
                        onChange={e => setFormData({ ...formData, allowOverlapping: e.target.checked })}
                        className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                      />
                      <span className="ml-2 text-sm font-medium text-gray-700">重複予約を許可する</span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-6">チェックを入れると、同じ担当者・同じ時間帯に複数の予約を受け付けます。</p>
                  </div>
                </div>
              </section>

              {/* 時間枠設定 */}
              <section>
                <h3 className="text-md font-medium text-gray-900 mb-4 border-b pb-2">基本時間枠</h3>
                <div className="space-y-3">
                  {formData.timeSlots.map((slot, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <input
                        type="time"
                        value={slot.start}
                        onChange={e => {
                          const newSlots = [...formData.timeSlots];
                          newSlots[index].start = e.target.value;
                          setFormData({ ...formData, timeSlots: newSlots });
                        }}
                        className="border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <span className="text-gray-500">-</span>
                      <input
                        type="time"
                        value={slot.end}
                        onChange={e => {
                          const newSlots = [...formData.timeSlots];
                          newSlots[index].end = e.target.value;
                          setFormData({ ...formData, timeSlots: newSlots });
                        }}
                        className="border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <button
                        onClick={() => {
                          const newSlots = formData.timeSlots.filter((_, i) => i !== index);
                          setFormData({ ...formData, timeSlots: newSlots });
                        }}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setFormData({ ...formData, timeSlots: [...formData.timeSlots, { start: '09:00', end: '10:00' }] })}
                    className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-800 mt-2"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    時間枠を追加
                  </button>
                </div>
              </section>

              {/* 例外日程 */}
              <section>
                <h3 className="text-md font-medium text-gray-900 mb-4 border-b pb-2">例外的な詳細日時設定</h3>
                <p className="text-xs text-gray-500 mb-4">祝日の休業や、特定の日の特別営業（時間枠の変更）を設定できます。</p>
                <div className="space-y-4">
                  {formData.exceptionalDates.map((exc, index) => (
                    <div key={index} className="flex flex-col sm:flex-row sm:items-start space-y-2 sm:space-y-0 sm:space-x-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <input
                        type="date"
                        value={exc.date}
                        onChange={e => {
                          const newExc = [...formData.exceptionalDates];
                          newExc[index].date = e.target.value;
                          setFormData({ ...formData, exceptionalDates: newExc });
                        }}
                        className="border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <select
                        value={exc.type}
                        onChange={e => {
                          const newExc = [...formData.exceptionalDates];
                          newExc[index].type = e.target.value as 'open' | 'closed';
                          setFormData({ ...formData, exceptionalDates: newExc });
                        }}
                        className="border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="closed">休業日</option>
                        <option value="open">特別営業日</option>
                      </select>
                      
                      {exc.type === 'open' && (
                        <input
                          type="text"
                          placeholder="例: 09:00-10:00, 13:00-14:00"
                          value={exc.timeSlotsStr || ''}
                          onChange={e => {
                            const newExc = [...formData.exceptionalDates];
                            newExc[index].timeSlotsStr = e.target.value;
                            setFormData({ ...formData, exceptionalDates: newExc });
                          }}
                          className="flex-1 border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      )}
                      
                      <button
                        onClick={() => {
                          const newExc = formData.exceptionalDates.filter((_, i) => i !== index);
                          setFormData({ ...formData, exceptionalDates: newExc });
                        }}
                        className="text-red-500 hover:text-red-700 p-1.5 mt-1 sm:mt-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setFormData({ 
                      ...formData, 
                      exceptionalDates: [...formData.exceptionalDates, { date: format(new Date(), 'yyyy-MM-dd'), type: 'closed' }] 
                    })}
                    className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    例外日程を追加
                  </button>
                </div>
              </section>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};
