import { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [view, setView] = useState<'landing' | 'login' | 'dashboard'>('landing');
  const [restaurantId] = useState<string>('default');

  // التحقق من حالة الدخول عند بدء التشغيل
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  const handleLoginSuccess = (newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setView('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setView('landing');
  };

  // توجيه تلقائي للوحة التحكم في حال كان المستخدم مسجلاً دخوله بالفعل واختار زر لوحة التحكم
  const handleGoToDashboard = () => {
    if (token) {
      setView('dashboard');
    } else {
      setView('login');
    }
  };

  return (
    <div className="app-container">
      {view === 'landing' && (
        <LandingPage 
          onGoToDashboard={handleGoToDashboard} 
          onGoToLogin={() => setView('login')}
        />
      )}
      
      {view === 'login' && (
        <Login 
          onLoginSuccess={handleLoginSuccess} 
          onBackToLanding={() => setView('landing')} 
        />
      )}
      
      {view === 'dashboard' && (
        <Dashboard 
          token={token} 
          restaurantId={restaurantId}
          onLogout={handleLogout}
          onBackToLanding={() => setView('landing')}
          onRedirectToLogin={() => setView('login')}
        />
      )}
    </div>
  );
}

export default App;
