import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { MessageSquare, Calendar, Database, Send, Bot, Check, ArrowUpRight } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface LandingPageProps {
  onGoToDashboard: () => void;
  onGoToLogin: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGoToDashboard, onGoToLogin }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'مرحباً بك في مطعم ومطبخ البركة شاورما! 🍔 أنا مساعدك الذكي عبر واتساب. كيف يمكنني خدمتك اليوم؟ يمكنك كتابة "أريد رؤية المنيو" أو طلب طعام أو حجز طاولة.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [reachedLimit, setReachedLimit] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // التمرير التلقائي لأسفل الدردشة عند إضافة رسائل جديدة
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || loading || reachedLimit) return;

    const userMessageText = inputText;
    setInputText('');
    setLoading(true);

    const userMessage: ChatMessage = {
      role: 'user',
      content: userMessageText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

    try {
      // إرسال الرسالة إلى الـ API المخصص للمحاكاة المحدودة
      const response = await axios.post(`${apiUrl}/demo/chat`, {
        message: userMessageText,
        history: messages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: new Date().toISOString(),
        })),
        sessionCount: sessionCount,
      });

      const aiText = response.data.responseText;
      const isLimit = response.data.reachedLimit;

      const aiMessage: ChatMessage = {
        role: 'assistant',
        content: aiText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMessage]);
      setSessionCount((prev) => prev + 1);

      if (isLimit) {
        setReachedLimit(true);
      }
    } catch (error) {
      console.error('خطأ في إرسال رسالة المحاكاة:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'عذراً، حدث خطأ فني أثناء الاتصال بالخادم. يرجى التأكد من تشغيل خادم الباك إند.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div className="tech-grid"></div>

      {/* الهيدر (Navbar) */}
      <header style={styles.header}>
        <div style={styles.logoArea}>
          <div style={styles.logoCircle}>R</div>
          <span style={styles.logoText}>RIVIX</span>
        </div>
        <nav style={styles.navLinks}>
          <a href="#features" style={styles.navLink}>الميزات</a>
          <a href="#simulator" style={styles.navLink}>جرب بنفسك</a>
          <a href="#" onClick={(e) => { e.preventDefault(); onGoToLogin(); }} style={styles.navLink}>تسجيل الدخول</a>
          <button onClick={onGoToDashboard} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
            لوحة التحكم
            <ArrowUpRight size={16} />
          </button>
        </nav>
      </header>

      {/* البطل (Hero Section) */}
      <main style={styles.heroSection}>
        <div style={styles.heroTextContainer}>
          <span style={styles.badge}>مدعوم بالذكاء الاصطناعي 🚀</span>
          <h1 style={styles.heroTitle}>
            أتمتة كاملة لعمليات مطعمك عبر <span style={{ color: '#00D2FF' }}>واتساب</span>
          </h1>
          <p style={styles.heroDescription}>
            Rivix تمكنك من تشغيل وكيل ذكي (AI Agent) مخصص للرد الفوري على عملائك، أخذ الطلبات، حجز الطاولات، وتحديث المنيو تلقائياً بقاعدة بياناتك، دون تدخل بشري.
          </p>
          <div style={styles.heroActions}>
            <button onClick={onGoToDashboard} className="btn btn-accent">
              ابدأ تجربتك المجانية
            </button>
            <a href="#simulator" className="btn btn-secondary">
              شاهد المحاكاة الحية
            </a>
          </div>
        </div>

        {/* محاكاة الهاتف وواتساب (Simulator) */}
        <div id="simulator" style={styles.simulatorContainer}>
          <div style={styles.phoneFrame}>
            <div style={styles.phoneNotch}></div>
            <div style={styles.phoneHeader}>
              <div style={styles.avatar}>
                <Bot size={20} color="#FFFFFF" />
              </div>
              <div style={styles.contactInfo}>
                <div style={styles.contactName}>مطعم البركة (مساعد ذكي)</div>
                <div style={styles.contactStatus}>متصل الآن</div>
              </div>
            </div>
            
            <div style={styles.chatArea}>
              {messages.map((msg, index) => (
                <div
                  key={index}
                  style={{
                    ...styles.messageRow,
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      ...styles.bubble,
                      backgroundColor: msg.role === 'user' ? '#E1FFC7' : '#FFFFFF',
                      color: '#000000',
                      borderRadius:
                        msg.role === 'user'
                          ? '12px 0px 12px 12px'
                          : '0px 12px 12px 12px',
                    }}
                  >
                    <p style={styles.bubbleText}>{msg.content}</p>
                    <div style={styles.bubbleMeta}>
                      <span style={styles.bubbleTime}>{msg.timestamp}</span>
                      {msg.role === 'user' && <Check size={12} color="#4FC3F7" style={{ marginRight: 2 }} />}
                    </div>
                  </div>
                </div>
              ))}
              
              {loading && (
                <div style={{ ...styles.messageRow, justifyContent: 'flex-start' }}>
                  <div style={{ ...styles.bubble, backgroundColor: '#FFFFFF', borderRadius: '0px 12px 12px 12px' }}>
                    <div style={styles.bouncingDots}>
                      <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></div>
                      <span style={{ fontSize: '0.85rem', color: '#5E6E85', marginRight: 8 }}>جاري الكتابة...</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendMessage} style={styles.chatInputArea}>
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={reachedLimit ? "تم استهلاك الرسائل الـ 5 المتاحة." : "اكتب رسالة للـ AI..."}
                disabled={loading || reachedLimit}
                style={styles.chatInput}
              />
              <button
                type="submit"
                disabled={loading || reachedLimit || !inputText.trim()}
                style={{
                  ...styles.sendButton,
                  backgroundColor: !inputText.trim() || reachedLimit ? '#CCCCCC' : '#128C7E',
                }}
              >
                <Send size={16} color="#FFFFFF" style={{ transform: 'rotate(180deg)' }} />
              </button>
            </form>
          </div>
          {reachedLimit && (
            <p style={styles.limitWarning}>
              ⚠️ وصلت للحد الأقصى (5 رسائل). تفضل بزيارة لوحة التحكم لاكتشاف بقية الميزات!
            </p>
          )}
        </div>
      </main>

      {/* الميزات (Features) */}
      <section id="features" style={styles.featuresSection}>
        <h2 style={styles.sectionTitle}>ميزات ذكية تحوّل مطعمك إلى العصر الرقمي</h2>
        <div style={styles.grid}>
          <div className="glass-card" style={styles.featureCard}>
            <div style={styles.featureIconContainer}>
              <MessageSquare size={24} color="#00D2FF" />
            </div>
            <h3>الرد الآلي الذكي</h3>
            <p>الرد الذكي الفوري وتصنيف الاستفسارات وحفظ طلبات العملاء بالذكاء الاصطناعي وبأسلوب لائق طبيعي.</p>
          </div>

          <div className="glass-card" style={styles.featureCard}>
            <div style={styles.featureIconContainer}>
              <Calendar size={24} color="#00D2FF" />
            </div>
            <h3>إدارة الحجوزات</h3>
            <p>تلقي حجوزات الطاولات والتأكيد المباشر عبر واتساب وتحديث الحالات من لوحة التحكم فوراً.</p>
          </div>

          <div className="glass-card" style={styles.featureCard}>
            <div style={styles.featureIconContainer}>
              <Database size={24} color="#00D2FF" />
            </div>
            <h3>إدارة الطلبات والمنيو</h3>
            <p>منيو متكامل يمكن تعديله وإضافة أصناف جديدة وحذفها، وطلبات حية مع توضيح الأسعار الدقيقة وقيم المجموع.</p>
          </div>
        </div>
      </section>

      {/* الفوتر */}
      <footer style={styles.footer}>
        <p>© 2026 Rivix Platform. جميع الحقوق محفوظة.</p>
      </footer>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    backgroundColor: '#06122C', // خلفية داكنة للبراند
    color: '#FFFFFF',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px 8%',
    zIndex: 10,
    background: 'rgba(6, 18, 44, 0.5)',
    backdropFilter: 'blur(8px)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  logoArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoCircle: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #0066FF 0%, #00D2FF 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: '1.25rem',
  },
  logoText: {
    fontSize: '1.5rem',
    fontWeight: '800',
    letterSpacing: '1px',
    color: '#FFFFFF',
  },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  navLink: {
    color: '#8E9FB8',
    textDecoration: 'none',
    fontWeight: '500',
    fontSize: '0.95rem',
    transition: 'color 0.3s ease',
  },
  heroSection: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '40px',
    padding: '80px 8%',
    alignItems: 'center',
    zIndex: 5,
  },
  heroTextContainer: {
    textAlign: 'right',
  },
  heroTitle: {
    fontSize: '3.5rem',
    fontWeight: '800',
    lineHeight: '1.25',
    marginBottom: '24px',
  },
  heroDescription: {
    fontSize: '1.15rem',
    color: '#8E9FB8',
    marginBottom: '32px',
    maxWidth: '550px',
  },
  heroActions: {
    display: 'flex',
    gap: '16px',
    flexDirection: 'row',
  },
  badge: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: '20px',
    backgroundColor: 'rgba(0, 210, 255, 0.1)',
    color: '#00D2FF',
    fontSize: '0.85rem',
    fontWeight: '700',
    marginBottom: '16px',
  },
  simulatorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneFrame: {
    width: '320px',
    height: '560px',
    borderRadius: '36px',
    border: '8px solid #2C3E50',
    backgroundColor: '#ECE5DD', // لون خلفية شات واتساب الكلاسيكي
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
  },
  phoneNotch: {
    width: '120px',
    height: '18px',
    backgroundColor: '#2C3E50',
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    borderRadius: '0 0 12px 12px',
    zIndex: 20,
  },
  phoneHeader: {
    backgroundColor: '#075E54', // أخضر واتساب الداكن
    padding: '24px 16px 10px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: '#FFFFFF',
    zIndex: 10,
    borderBottom: '1px solid rgba(0,0,0,0.1)',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInfo: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'right',
  },
  contactName: {
    fontSize: '0.85rem',
    fontWeight: '700',
  },
  contactStatus: {
    fontSize: '0.65rem',
    opacity: 0.8,
  },
  chatArea: {
    flex: 1,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    overflowY: 'auto',
    backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', // نقشة واتساب
    backgroundSize: 'contain',
  },
  messageRow: {
    display: 'flex',
    width: '100%',
  },
  bubble: {
    maxWidth: '85%',
    padding: '8px 12px 6px 12px',
    boxShadow: '0 1px 1px rgba(0,0,0,0.06)',
    position: 'relative',
  },
  bubbleText: {
    fontSize: '0.82rem',
    margin: 0,
    wordBreak: 'break-word',
    textAlign: 'right',
  },
  bubbleMeta: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: '4px',
  },
  bubbleTime: {
    fontSize: '0.6rem',
    color: '#777777',
  },
  bouncingDots: {
    display: 'flex',
    alignItems: 'center',
    flexDirection: 'row',
  },
  chatInputArea: {
    padding: '10px 12px',
    backgroundColor: '#F0F0F0',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  chatInput: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: '24px',
    border: 'none',
    fontSize: '0.85rem',
    outline: 'none',
    textAlign: 'right',
  },
  sendButton: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  limitWarning: {
    color: '#FF6B6B',
    fontSize: '0.8rem',
    fontWeight: '700',
    marginTop: '12px',
    textAlign: 'center',
  },
  featuresSection: {
    padding: '100px 8%',
    background: '#0B192C',
    textAlign: 'center',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
  },
  sectionTitle: {
    fontSize: '2.25rem',
    fontWeight: '800',
    marginBottom: '60px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '30px',
  },
  featureCard: {
    padding: '40px',
    textAlign: 'right',
    background: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '16px',
  },
  featureIconContainer: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    backgroundColor: 'rgba(0, 210, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '20px',
  },
  footer: {
    padding: '40px',
    textAlign: 'center',
    color: '#5E6E85',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    fontSize: '0.9rem',
    marginTop: 'auto',
  },
};

export default LandingPage;
