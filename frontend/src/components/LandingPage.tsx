import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { 
  Calendar, 
  Database, 
  Send, 
  Bot, 
  Check, 
  ArrowUpRight, 
  Sun, 
  Moon, 
  Zap, 
  TrendingUp, 
  Star,
  ChevronRight
} from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface LandingPageProps {
  onGoToDashboard: () => void;
  onGoToLogin: () => void;
  darkMode?: boolean;
  onToggleTheme?: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ 
  onGoToDashboard, 
  onGoToLogin, 
  darkMode = true, 
  onToggleTheme 
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'السلام عليكم! أهلاً بيك في مطعم البركة، إزاي أقدر أساعدك النهاردة؟ ✨',
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

  const handleSendMessage = async (customMessage?: string) => {
    const textToSend = customMessage || inputText;
    if (!textToSend.trim() || loading || reachedLimit) return;

    if (!customMessage) {
      setInputText('');
    }
    setLoading(true);

    const userMessage: ChatMessage = {
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

    try {
      const response = await axios.post(`${apiUrl}/demo/chat`, {
        message: textToSend,
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

  const handleQuickPrompt = (promptText: string) => {
    handleSendMessage(promptText);
  };

  return (
    <div style={styles.page}>
      <div className="tech-grid"></div>

      {/* الهيدر العائم الفاخر (Floating Glass Navbar) */}
      <header style={styles.header}>
        {/* اللوجو واسم البراند بشكل يلفت الانتباه: Rivix System - الضغط عليه يبدل المظهر */}
        <div 
          style={{ ...styles.logoArea, cursor: onToggleTheme ? 'pointer' : 'default' }}
          onClick={onToggleTheme}
          title="اضغط لتغيير مظهر الموقع (داكن / مضيء)"
        >
          <div style={styles.logoBadge}>
            <img 
              src="/logo.jpg" 
              alt="Rivix System Logo" 
              style={styles.logoImg}
            />
            <div style={styles.logoGlowRing}></div>
          </div>
          <div style={styles.brandTitleContainer}>
            <div style={styles.brandTitleText}>
              RIVIX <span style={styles.brandSystemAccent}>SYSTEM</span>
            </div>
            <span style={styles.brandTagline}>AI RESTAURANT OS</span>
          </div>
        </div>

        {/* روابط التنقل والأزرار التفاعلية */}
        <nav style={styles.navLinks}>
          <a href="#features" style={styles.navLink}>الميزات والخصائص</a>
          <a href="#simulator" style={styles.navLink}>تجربة حية</a>
          <a href="#" onClick={(e) => { e.preventDefault(); onGoToLogin(); }} style={styles.navLink}>تسجيل الدخول</a>
          
          {onToggleTheme && (
            <button onClick={onToggleTheme} className="theme-toggle-btn" title="تبديل مظهر الموقع">
              {darkMode ? <Sun size={18} color="#F59E0B" /> : <Moon size={18} color="#0066FF" />}
              <span>{darkMode ? 'المظهر المضيء' : 'المظهر الداكن'}</span>
            </button>
          )}

          <button onClick={onGoToDashboard} className="btn btn-primary" style={styles.ctaHeaderBtn}>
            <span>لوحة التحكم</span>
            <ArrowUpRight size={18} />
          </button>
        </nav>
      </header>

      {/* البطل (Hero Section) */}
      <main style={styles.heroSection}>
        <div style={styles.heroTextContainer}>
          {/* شارة التميز الأولى: اسم البرند وتحته AI Agent */}
          <div style={{ ...styles.heroPill, flexDirection: 'column', alignItems: 'flex-start', padding: '8px 20px', gap: '2px' }}>
            <div style={{ fontWeight: '900', fontSize: '1.1rem', color: '#FFFFFF', letterSpacing: '0.5px' }}>Rivix System</div>
            <div style={{ fontSize: '0.75rem', color: '#00D2FF', letterSpacing: '1px', fontWeight: '800', textTransform: 'uppercase' }}>AI Agent</div>
          </div>

          <h1 style={styles.heroTitle}>
            إدارة مطعمك الذكية عبر <span style={styles.gradientText}>واتساب</span>
          </h1>

          <p style={styles.heroDescription}>
            منصة <strong style={{ color: '#00D2FF' }}>Rivix System</strong> تتيح لك تشغيل مساعد ذكي يخدم عملائك، يعرض المنيو، ويستقبل الطلبات والحجوزات تلقائياً على مدار 24 ساعة.
          </p>

          <div style={styles.heroActions}>
            <button onClick={onGoToDashboard} className="btn btn-accent" style={styles.mainCtaBtn}>
              <Zap size={20} />
              <span>ابدأ تجربتك المجانية الان</span>
            </button>

            <a href="#simulator" className="btn btn-secondary" style={styles.secondaryCtaBtn}>
              <span>شاهد المحاكاة المباشرة</span>
              <ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} />
            </a>
          </div>

          {/* شريط الأرقام القياسية والإحصائيات */}
          <div style={styles.statsBar}>
            <div style={styles.statItem}>
              <div style={styles.statNumber}>&lt; 1 ثانية</div>
              <div style={styles.statDesc}>زمن الرد التلقائي</div>
            </div>
            <div style={styles.statDivider}></div>
            <div style={styles.statItem}>
              <div style={styles.statNumber}>100%</div>
              <div style={styles.statDesc}>دقة أخذ الطلبات</div>
            </div>
            <div style={styles.statDivider}></div>
            <div style={styles.statItem}>
              <div style={styles.statNumber}>+40%</div>
              <div style={styles.statDesc}>زيادة في المبيعات</div>
            </div>
          </div>
        </div>

        {/* محاكاة واجهة الخادم التفاعلية الملساء (Ultra-Sleek Glass Interface Mockup) */}
        <div id="simulator" style={styles.simulatorContainer}>
          <div style={styles.phoneGlowEffect}></div>
          <div style={styles.phoneFrame}>
            {/* هيدر الشاشة التفاعلية */}
            <div style={styles.phoneHeader}>
              <div style={styles.avatarContainer}>
                <img src="/logo.jpg" alt="Rivix Agent" style={styles.avatarImg} />
                <span style={styles.onlineBadge}></span>
              </div>
              <div style={styles.contactInfo}>
                <div style={styles.contactName}>Rivix AI Assistant</div>
                <div style={styles.contactStatus}>النظام الذكي متصل ومتاح 24/7</div>
              </div>
            </div>
            
            {/* منطقة الشات والمحادثة */}
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
                      backgroundColor: msg.role === 'user' ? '#0066FF' : '#0E1B33',
                      color: '#FFFFFF',
                      borderRadius:
                        msg.role === 'user'
                          ? '16px 4px 16px 16px'
                          : '4px 16px 16px 16px',
                      border: msg.role === 'user' ? 'none' : '1px solid rgba(0, 210, 255, 0.2)',
                    }}
                  >
                    <p style={styles.bubbleText}>{msg.content}</p>
                    <div style={styles.bubbleMeta}>
                      <span style={styles.bubbleTime}>{msg.timestamp}</span>
                      {msg.role === 'user' && <Check size={14} color="#00D2FF" style={{ marginRight: 3 }} />}
                    </div>
                  </div>
                </div>
              ))}
              
              {loading && (
                <div style={{ ...styles.messageRow, justifyContent: 'flex-start' }}>
                  <div style={{ ...styles.bubble, backgroundColor: '#0E1B33', borderRadius: '4px 16px 16px 16px', border: '1px solid rgba(0, 210, 255, 0.2)' }}>
                    <div style={styles.bouncingDots}>
                      <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></div>
                      <span style={{ fontSize: '0.8rem', color: '#8E9FB8', marginRight: 8 }}>جاري معالجة الطلب...</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* الأزرار التفاعلية السريعة (Quick Prompt Chips) */}
            <div style={styles.quickPromptsContainer}>
              <button 
                onClick={() => handleQuickPrompt("أريد رؤية قائمة الطعام والأسعار بالجنيه المصري")} 
                style={styles.quickPromptChip}
                disabled={loading || reachedLimit}
              >
                عرض المنيو (ج.م)
              </button>
              <button 
                onClick={() => handleQuickPrompt("أريد طلب وجبة شاورما بالجنيه المصري")} 
                style={styles.quickPromptChip}
                disabled={loading || reachedLimit}
              >
                طلب وجبة جديدة
              </button>
              <button 
                onClick={() => handleQuickPrompt("أريد حجز طاولة لـ 4 أفراد")} 
                style={styles.quickPromptChip}
                disabled={loading || reachedLimit}
              >
                حجز طاولة
              </button>
            </div>

            {/* حقل إدخال الرسالة */}
            <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} style={styles.chatInputArea}>
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={reachedLimit ? "تم استهلاك الرسائل التجريبية." : "أدخل رسالتك هنا..."}
                disabled={loading || reachedLimit}
                style={styles.chatInput}
              />
              <button
                type="submit"
                disabled={loading || reachedLimit || !inputText.trim()}
                style={{
                  ...styles.sendButton,
                  backgroundColor: !inputText.trim() || reachedLimit ? 'rgba(255, 255, 255, 0.1)' : '#0066FF',
                }}
              >
                <Send size={16} color="#FFFFFF" style={{ transform: 'rotate(180deg)' }} />
              </button>
            </form>
          </div>

          {reachedLimit && (
            <div style={styles.limitWarningCard}>
              <Star size={16} color="#F59E0B" />
              <span>تم الوصول للحد الأقصى للتجربة الحية. تفضل بزيارة لوحة التحكم للاستكشاف الكامل.</span>
            </div>
          )}
        </div>
      </main>

      {/* قسم الميزات والخصائص (Features Section) */}
      <section id="features" style={styles.featuresSection}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionBadge}>المميزات الفريدة</span>
          <h2 style={styles.sectionTitle}>لماذا تختار منصة <span style={{ color: '#00D2FF' }}>Rivix System</span> لمطعمك؟</h2>
          <p style={styles.sectionSubtitle}>ميزات هندسية متقدمة مصممة لتسريع أداء مطعمك وزيادة أرباحك وتوفير أطقم العمل.</p>
        </div>

        <div style={styles.grid}>
          <div className="glass-card" style={styles.featureCard}>
            <div style={styles.featureIconContainer}>
              <Bot size={28} color="#00D2FF" />
            </div>
            <h3 style={styles.featureTitle}>مساعد ذكي مدعوم بـ Gemini 3.6</h3>
            <p style={styles.featureText}>فهم عالي الجودة للغة العربية والعامية، والرد التلقائي بدقة متناهية وأسلوب ترحيبي يعزز ثقة العميل.</p>
          </div>

          <div className="glass-card" style={styles.featureCard}>
            <div style={styles.featureIconContainer}>
              <Database size={28} color="#0066FF" />
            </div>
            <h3 style={styles.featureTitle}>إدارة المنيو الصور والاستيراد الذكي</h3>
            <p style={styles.featureText}>تحميل وتعديل أصناف الطعام والأسعار بالصور المباشرة، مع دعم استيراد المنيو كاملاً بملفات Excel / CSV بنقرة واحدة.</p>
          </div>

          <div className="glass-card" style={styles.featureCard}>
            <div style={styles.featureIconContainer}>
              <Calendar size={28} color="#10B981" />
            </div>
            <h3 style={styles.featureTitle}>تنظيم الحجوزات وإدارة الطاولات</h3>
            <p style={styles.featureText}>تأكيد حجوزات الطاولات وحساب عدد الأفراد وإشعار الكول سنتر فورياً بتحديثات الحالات على الشاشة.</p>
          </div>

          <div className="glass-card" style={styles.featureCard}>
            <div style={styles.featureIconContainer}>
              <TrendingUp size={28} color="#F59E0B" />
            </div>
            <h3 style={styles.featureTitle}>تحليلات المبيعات وأداء الكول سنتر</h3>
            <p style={styles.featureText}>لوحة تحكم شاملة تقدم إحصائيات المبيعات اليومية، مراقبة محادثات العملاء الحية، وإشعارات صوتية عند وصول الطلبات.</p>
          </div>
        </div>
      </section>

      {/* الفوتر الاحترافي (Footer) */}
      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <div style={styles.footerBrand}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src="/logo.jpg" alt="Rivix Logo" style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
              <span style={{ fontWeight: '800', fontSize: '1.25rem', color: '#FFFFFF' }}>RIVIX SYSTEM</span>
            </div>
            <p style={styles.footerDesc}>المنظومة الذكية الأولى لإدارة وميكنة عمليات المطاعم بالذكاء الاصطناعي عبر واتساب.</p>
          </div>

          <div style={styles.footerStatus}>
            <span style={styles.statusDot}></span>
            <span>كافة الخدمات والسيرفرات تعمل بكفاءة 100%</span>
          </div>
        </div>

        <div style={styles.footerBottom}>
          <p>© 2026 Rivix System Platform. جميع الحقوق محفوظة.</p>
        </div>
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
    backgroundColor: 'var(--background)',
    color: 'var(--text-main)',
    overflowX: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 6%',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    background: 'rgba(6, 18, 44, 0.75)',
    backdropFilter: 'blur(16px)',
    borderBottom: '1px solid rgba(0, 210, 255, 0.15)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
  },
  logoArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  logoBadge: {
    position: 'relative',
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '2.5px solid #00D2FF',
    boxShadow: '0 0 16px rgba(0, 210, 255, 0.6)',
  },
  logoGlowRing: {
    position: 'absolute',
    inset: -3,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #00D2FF, #0066FF)',
    zIndex: -1,
    opacity: 0.5,
    filter: 'blur(4px)',
  },
  brandTitleContainer: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'right',
  },
  brandTitleText: {
    fontSize: '1.4rem',
    fontWeight: '900',
    letterSpacing: '1px',
    color: '#FFFFFF',
    lineHeight: 1.1,
  },
  brandSystemAccent: {
    color: '#00D2FF',
    textShadow: '0 0 12px rgba(0, 210, 255, 0.5)',
  },
  brandTagline: {
    fontSize: '0.65rem',
    fontWeight: '700',
    letterSpacing: '2px',
    color: '#8E9FB8',
    marginTop: '2px',
  },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  navLink: {
    color: '#E2E8F0',
    textDecoration: 'none',
    fontWeight: '600',
    fontSize: '0.95rem',
    transition: 'color 0.3s ease',
  },
  ctaHeaderBtn: {
    padding: '10px 20px',
    fontSize: '0.9rem',
    borderRadius: '24px',
  },
  heroSection: {
    display: 'grid',
    gridTemplateColumns: '1.1fr 0.9fr',
    gap: '40px',
    padding: '70px 6% 90px 6%',
    alignItems: 'center',
    zIndex: 5,
  },
  heroTextContainer: {
    textAlign: 'right',
  },
  heroPill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 16px',
    borderRadius: '30px',
    background: 'rgba(0, 210, 255, 0.1)',
    border: '1px solid rgba(0, 210, 255, 0.3)',
    color: '#00D2FF',
    fontSize: '0.85rem',
    fontWeight: '700',
    marginBottom: '20px',
  },
  heroTitle: {
    fontSize: '3.4rem',
    fontWeight: '900',
    lineHeight: '1.2',
    marginBottom: '20px',
    color: '#FFFFFF',
  },
  gradientText: {
    background: 'linear-gradient(135deg, #00D2FF 0%, #0066FF 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    textShadow: '0 0 30px rgba(0, 210, 255, 0.3)',
  },
  heroDescription: {
    fontSize: '1.15rem',
    color: '#8E9FB8',
    marginBottom: '32px',
    lineHeight: '1.7',
    maxWidth: '580px',
  },
  heroActions: {
    display: 'flex',
    gap: '16px',
    flexDirection: 'row',
    marginBottom: '40px',
  },
  mainCtaBtn: {
    padding: '14px 28px',
    fontSize: '1rem',
    borderRadius: '30px',
  },
  secondaryCtaBtn: {
    padding: '14px 24px',
    fontSize: '0.95rem',
    borderRadius: '30px',
  },
  statsBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    padding: '20px 24px',
    borderRadius: '16px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    maxWidth: '520px',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'right',
  },
  statNumber: {
    fontSize: '1.4rem',
    fontWeight: '900',
    color: '#00D2FF',
  },
  statDesc: {
    fontSize: '0.75rem',
    color: '#8E9FB8',
    marginTop: '2px',
  },
  statDivider: {
    width: '1px',
    height: '32px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  simulatorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  phoneGlowEffect: {
    position: 'absolute',
    width: '320px',
    height: '520px',
    borderRadius: '40px',
    background: 'radial-gradient(circle, rgba(0, 210, 255, 0.15) 0%, transparent 70%)',
    zIndex: 1,
  },
  phoneFrame: {
    width: '340px',
    height: '600px',
    borderRadius: '40px',
    border: '8px solid #1F2937',
    backgroundColor: '#0B141A', // لون داكن حديث للواتساب
    boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6), 0 0 30px rgba(0, 210, 255, 0.2)',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
    zIndex: 2,
  },
  phoneNotch: {
    width: '130px',
    height: '22px',
    backgroundColor: '#1F2937',
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    borderRadius: '0 0 14px 14px',
    zIndex: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
  },
  cameraLens: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#0F172A',
    border: '1px solid #374151',
  },
  speakerGrille: {
    width: '36px',
    height: '4px',
    borderRadius: '2px',
    backgroundColor: '#374151',
  },
  statusBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px 20px 4px 20px',
    color: '#8696A0',
    fontSize: '0.7rem',
    fontWeight: '600',
    zIndex: 10,
    backgroundColor: '#111B21',
  },
  phoneHeader: {
    backgroundColor: '#111B21',
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    color: '#E9EDEF',
    zIndex: 10,
    borderBottom: '1px solid rgba(134, 150, 160, 0.15)',
  },
  avatarContainer: {
    position: 'relative',
    width: '38px',
    height: '38px',
  },
  avatarImg: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '1px solid #00D2FF',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#00A884',
    border: '2px solid #111B21',
  },
  contactInfo: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'right',
  },
  contactName: {
    fontSize: '0.85rem',
    fontWeight: '700',
    color: '#E9EDEF',
  },
  contactStatus: {
    fontSize: '0.65rem',
    color: '#00A884',
    marginTop: '1px',
  },
  chatArea: {
    flex: 1,
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    overflowY: 'auto',
    backgroundColor: '#0B141A',
  },
  messageRow: {
    display: 'flex',
    width: '100%',
  },
  bubble: {
    maxWidth: '88%',
    padding: '10px 14px 8px 14px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
    position: 'relative',
  },
  bubbleText: {
    fontSize: '0.83rem',
    margin: 0,
    wordBreak: 'break-word',
    textAlign: 'right',
    lineHeight: '1.45',
  },
  bubbleMeta: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: '4px',
  },
  bubbleTime: {
    fontSize: '0.62rem',
    color: '#667781',
  },
  bouncingDots: {
    display: 'flex',
    alignItems: 'center',
    flexDirection: 'row',
  },
  quickPromptsContainer: {
    display: 'flex',
    gap: '6px',
    padding: '8px 12px',
    backgroundColor: '#111B21',
    borderTop: '1px solid rgba(134, 150, 160, 0.1)',
    overflowX: 'auto',
  },
  quickPromptChip: {
    padding: '5px 10px',
    borderRadius: '16px',
    background: 'rgba(0, 210, 255, 0.1)',
    border: '1px solid rgba(0, 210, 255, 0.25)',
    color: '#00D2FF',
    fontSize: '0.72rem',
    fontWeight: '700',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  chatInputArea: {
    padding: '10px 12px',
    backgroundColor: '#111B21',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderTop: '1px solid rgba(134, 150, 160, 0.15)',
  },
  chatInput: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: '20px',
    border: 'none',
    backgroundColor: '#2A3942',
    color: '#E9EDEF',
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
  limitWarningCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    borderRadius: '20px',
    background: 'rgba(245, 158, 11, 0.15)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    color: '#FBBF24',
    fontSize: '0.8rem',
    fontWeight: '700',
    marginTop: '16px',
    textAlign: 'center',
  },
  featuresSection: {
    padding: '90px 6%',
    background: 'rgba(6, 14, 30, 0.8)',
    textAlign: 'center',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
  },
  sectionHeader: {
    maxWidth: '700px',
    margin: '0 auto 60px auto',
  },
  sectionBadge: {
    color: '#00D2FF',
    fontSize: '0.85rem',
    fontWeight: '800',
    letterSpacing: '1px',
    display: 'inline-block',
    marginBottom: '10px',
  },
  sectionTitle: {
    fontSize: '2.4rem',
    fontWeight: '900',
    marginBottom: '14px',
    color: '#FFFFFF',
  },
  sectionSubtitle: {
    fontSize: '1.05rem',
    color: '#8E9FB8',
    lineHeight: '1.6',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '24px',
  },
  featureCard: {
    padding: '32px',
    textAlign: 'right',
    borderRadius: '20px',
  },
  featureIconContainer: {
    width: '56px',
    height: '56px',
    borderRadius: '16px',
    backgroundColor: 'rgba(0, 210, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '20px',
    border: '1px solid rgba(0, 210, 255, 0.2)',
  },
  featureTitle: {
    fontSize: '1.2rem',
    fontWeight: '800',
    marginBottom: '10px',
    color: '#FFFFFF',
  },
  featureText: {
    fontSize: '0.92rem',
    color: '#8E9FB8',
    lineHeight: '1.6',
  },
  footer: {
    padding: '50px 6% 30px 6%',
    backgroundColor: '#040914',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    marginTop: 'auto',
  },
  footerContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '30px',
    flexWrap: 'wrap',
    gap: '20px',
  },
  footerBrand: {
    textAlign: 'right',
  },
  footerDesc: {
    color: '#8E9FB8',
    fontSize: '0.9rem',
    marginTop: '8px',
    maxWidth: '400px',
  },
  footerStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '20px',
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    color: '#10B981',
    fontSize: '0.82rem',
    fontWeight: '700',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#10B981',
    boxShadow: '0 0 8px #10B981',
  },
  footerBottom: {
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    paddingTop: '20px',
    textAlign: 'center',
    color: '#5E6E85',
    fontSize: '0.85rem',
  },
};

export default LandingPage;
