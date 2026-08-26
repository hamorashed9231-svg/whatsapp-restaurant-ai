import React, { useState } from 'react';
import axios from 'axios';
import { LogIn, ArrowRight, Shield, AlertCircle } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (token: string) => void;
  onBackToLanding: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess, onBackToLanding }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

    try {
      const response = await axios.post(`${apiUrl}/auth/login`, {
        username,
        password,
      });

      if (response.data && response.data.token) {
        onLoginSuccess(response.data.token);
      } else {
        setError('حدث خطأ أثناء استلام رمز الدخول.');
      }
    } catch (err: any) {
      console.error('خطأ تسجيل الدخول:', err);
      setError(err.response?.data?.message || 'اسم المستخدم أو كلمة المرور غير صحيحة!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div className="tech-grid"></div>
      
      <div className="glass-card animate-fade-in" style={styles.card}>
        <div style={styles.header}>
          <div style={styles.iconContainer}>
            <Shield size={32} color="#00D2FF" />
          </div>
          <h2 style={styles.title}>تسجيل الدخول إلى Rivix</h2>
          <p style={styles.subtitle}>أدخل بيانات اعتماد المسؤول للوصول إلى لوحة التحكم</p>
        </div>

        {error && (
          <div style={styles.errorContainer}>
            <AlertCircle size={20} color="#EF4444" style={{ marginLeft: 8 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>اسم المستخدم</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="مثال: admin"
              required
              disabled={loading}
              style={styles.input}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>كلمة المرور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              disabled={loading}
              style={styles.input}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: 8 }}
          >
            {loading ? (
              <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }}></span>
            ) : (
              <>
                <LogIn size={20} />
                <span>دخول للوحة التحكم</span>
              </>
            )}
          </button>
        </form>

        <button
          onClick={onBackToLanding}
          className="btn btn-secondary"
          style={{ width: '100%', marginTop: 12 }}
        >
          <ArrowRight size={20} />
          <span>العودة للرئيسية</span>
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    position: 'relative',
    backgroundColor: '#06122C', // خلفية داكنة فخمة
  },
  card: {
    width: '100%',
    maxWidth: '450px',
    padding: '40px',
    zIndex: 1,
    borderRadius: '16px',
    textAlign: 'center',
    background: 'rgba(255, 255, 255, 0.07)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    color: '#FFFFFF',
  },
  header: {
    marginBottom: '30px',
  },
  iconContainer: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'rgba(0, 210, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px auto',
    border: '1px solid rgba(0, 210, 255, 0.2)',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#8E9FB8',
  },
  errorContainer: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    padding: '12px',
    borderRadius: '8px',
    color: '#FCA5A5',
    fontSize: '0.9rem',
    marginBottom: '24px',
    textAlign: 'right',
  },
  form: {
    textAlign: 'right',
  },
  inputGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '0.9rem',
    fontWeight: '600',
    color: '#E2E8F0',
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '14px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#FFFFFF',
    fontSize: '1rem',
    outline: 'none',
    transition: 'all 0.3s ease',
    textAlign: 'right',
  },
};

export default Login;
