import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { logOut } from '../firebase';
import { Users, LogOut, User, LogIn } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';

export const Layout = () => {
  const { user, profile } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 h-16 flex items-center shrink-0">
        <div className="w-full px-8 mx-auto">
          <div className="flex justify-between h-16">
            <div className="flex">
              <Link to="/" className="flex-shrink-0 flex items-center gap-2">
                <span className="text-indigo-600 text-xl">●</span>
                <span className="text-xl font-bold text-indigo-600">{settings.siteTitle}</span>
                {profile?.role === 'admin' && (
                  <span className="ml-2 text-xs bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full font-semibold">
                    管理者モード
                  </span>
                )}
              </Link>
              <nav className="ml-6 flex space-x-8">
                <Link
                  to="/"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  予約フォーム
                </Link>
                {profile?.role === 'admin' && (
                  <Link
                    to="/admin"
                    className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    <Users className="w-4 h-4 mr-1" />
                    管理者ダッシュボード
                  </Link>
                )}
              </nav>
            </div>
            <div className="flex items-center">
              {user ? (
                <>
                  <div className="flex items-center text-sm text-gray-500 mr-4">
                    <User className="w-4 h-4 mr-1" />
                    {profile?.displayName}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-gray-500 bg-white hover:text-gray-700 focus:outline-none transition"
                  >
                    <LogOut className="w-4 h-4 mr-1" />
                    ログアウト
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-gray-500 bg-white hover:text-gray-700 focus:outline-none transition"
                >
                  <LogIn className="w-4 h-4 mr-1" />
                  管理者ログイン
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
};
