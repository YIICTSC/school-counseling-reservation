import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { CalendarPlus, Clock, User, XCircle } from 'lucide-react';

interface Appointment {
  id: string;
  counselorId: string;
  parentId: string;
  parentName: string;
  studentName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  notes?: string;
  createdAt: string;
}

export const ParentDashboard = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'appointments'),
      where('parentId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const apps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Appointment[];
      
      // Sort by date and time
      apps.sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.startTime}`);
        const dateB = new Date(`${b.date}T${b.startTime}`);
        return dateB.getTime() - dateA.getTime();
      });
      
      setAppointments(apps);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'appointments');
    });

    return () => unsubscribe();
  }, [user]);

  const handleCancel = async (appointmentId: string) => {
    if (window.confirm('本当にこの予約をキャンセルしますか？')) {
      try {
        await updateDoc(doc(db, 'appointments', appointmentId), {
          status: 'cancelled'
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `appointments/${appointmentId}`);
      }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <span className="px-2 py-1 inline-flex text-xs font-semibold rounded bg-emerald-100 text-emerald-800">確定済</span>;
      case 'pending':
        return <span className="px-2 py-1 inline-flex text-xs font-semibold rounded bg-amber-100 text-amber-800">承認待ち</span>;
      case 'cancelled':
        return <span className="px-2 py-1 inline-flex text-xs font-semibold rounded bg-red-100 text-red-800">キャンセル済</span>;
      default:
        return null;
    }
  };

  if (loading) {
    return <div className="text-center py-10">読み込み中...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">マイページ</h1>
        <Link
          to="/book"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <CalendarPlus className="w-4 h-4 mr-2" />
          新規予約
        </Link>
      </div>

      <div className="bg-white border border-gray-200 overflow-hidden rounded-xl">
        {appointments.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            予約はありません。
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {appointments.map((appointment) => (
              <li key={appointment.id}>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Clock className="w-5 h-5 text-gray-400 mr-2" />
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {format(new Date(appointment.date), 'yyyy年MM月dd日 (E)', { locale: ja })} {appointment.startTime} - {appointment.endTime}
                      </p>
                    </div>
                    <div className="ml-2 flex-shrink-0 flex">
                      {getStatusBadge(appointment.status)}
                    </div>
                  </div>
                  <div className="mt-2 sm:flex sm:justify-between">
                    <div className="sm:flex">
                      <p className="flex items-center text-sm text-gray-500">
                        <User className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                        対象児童・生徒: {appointment.studentName}
                      </p>
                    </div>
                    {appointment.status === 'pending' && (
                      <div className="mt-2 flex items-center text-sm sm:mt-0">
                        <button
                          onClick={() => handleCancel(appointment.id)}
                          className="text-red-600 hover:text-red-900 flex items-center"
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          キャンセル
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
