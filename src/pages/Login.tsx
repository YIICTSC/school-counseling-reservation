import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { signInWithGoogle } from '../firebase';
import { useSettings } from '../hooks/useSettings';

export const Login = () => {
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/admin');
    }
  }, [user, navigate]);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex justify-center">
            <span className="text-indigo-600 text-4xl">●</span>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {settings.siteTitle}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            管理者用ログイン
          </p>
        </div>
        
        <div className="mt-8 space-y-6">
          <button
            onClick={handleLogin}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            Googleアカウントでログイン
          </button>
        </div>
      </div>
    </div>
  );
};
