import { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [view, setView] = useState<'landing' | 'login' | 'dashboard'>(() => {
    return localStorage.getItem('token') ? 'dashboard' : 'landing';
  });
  const [restaurantId] = useState<string>('default');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme ? savedTheme === 'dark' : true; // الوضع الداكن افتراضياً
  });

  // مزامنة حالة المظهر مع الـ DOM و localStorage
  useEffect(() => {
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.classList.add('dark-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.classList.remove('dark-theme');
    }
  }, [darkMode]);




  const toggleTheme = () => {
    setDarkMode(prev => !prev);
  };

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
          darkMode={darkMode}
          onToggleTheme={toggleTheme}
        />
      )}
      
      {view === 'login' && (
        <Login 
          onLoginSuccess={handleLoginSuccess} 
          onBackToLanding={() => setView('landing')} 
          darkMode={darkMode}
          onToggleTheme={toggleTheme}
        />
      )}
      
      {view === 'dashboard' && (
        <Dashboard 
          token={token} 
          restaurantId={restaurantId}
          onLogout={handleLogout}
          onBackToLanding={() => setView('landing')}
          onRedirectToLogin={() => setView('login')}
          darkMode={darkMode}
          onToggleTheme={toggleTheme}
        />
      )}
    </div>
  );
}

export default App;
