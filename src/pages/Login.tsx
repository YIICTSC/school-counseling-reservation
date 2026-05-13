import { useEffect, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getGoogleRedirectResult, signInWithGoogle, signInWithGoogleRedirect } from '../firebase';
import { useSettings } from '../hooks/useSettings';

const getLoginErrorMessage = (error: unknown) => {
  if (!(error instanceof FirebaseError)) {
    return 'Googleログインに失敗しました。時間をおいてもう一度お試しください。';
  }

  switch (error.code) {
    case 'auth/unauthorized-domain':
      return 'この公開URLがFirebase Authenticationの承認済みドメインに登録されていません。Firebase Consoleで yiictsc.github.io を追加してください。';
    case 'auth/popup-closed-by-user':
      return 'Googleログイン画面が閉じられました。もう一度ログインしてください。';
    case 'auth/cancelled-popup-request':
      return 'Googleログイン処理がキャンセルされました。もう一度ログインしてください。';
    case 'auth/account-exists-with-different-credential':
      return '同じメールアドレスの別ログイン方法が既に存在します。Firebase Authenticationのログイン方法を確認してください。';
    case 'auth/operation-not-allowed':
      return 'GoogleログインがFirebase Authenticationで有効化されていません。Sign-in methodでGoogleを有効にしてください。';
    default:
      return `Googleログインに失敗しました。エラー: ${error.code}`;
  }
};

export const Login = () => {
  const { user, profile, loading, authError } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    if (profile?.role === 'admin') {
      navigate('/admin');
    }
    if (!loading && user && profile?.role === 'parent') {
      setLoginError('このGoogleアカウントは管理者として登録されていません。管理者メール設定を確認してください。');
    }
  }, [user, profile, loading, navigate]);

  useEffect(() => {
    getGoogleRedirectResult().catch((error) => {
      setLoginError(getLoginErrorMessage(error));
    });
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Login failed:', error);
      if (
        error instanceof FirebaseError &&
        ['auth/popup-blocked', 'auth/popup-blocked-by-browser'].includes(error.code)
      ) {
        await signInWithGoogleRedirect();
        return;
      }
      setLoginError(getLoginErrorMessage(error));
    } finally {
      setIsLoggingIn(false);
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
          {(loginError || authError) && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loginError || authError}
            </div>
          )}
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            {isLoggingIn ? 'ログイン中...' : 'Googleアカウントでログイン'}
          </button>
        </div>
      </div>
    </div>
  );
};
