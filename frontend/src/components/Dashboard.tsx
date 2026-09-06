import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  LayoutDashboard,
  Utensils,
  ShoppingBag,
  Calendar,
  MessageSquare,
  Settings,
  LogOut,
  Plus,
  Edit,
  Trash,
  CheckCircle,
  XCircle,
  Send,
  AlertCircle,
  Upload,
  Users,
  Sparkles,
  Sun,
  Moon,
  Menu,
  X,
  Copy,
  Download,
  Lock,
  AlertTriangle,
  FileText
} from 'lucide-react';

interface DashboardProps {
  token: string | null;
  restaurantId: string;
  onLogout: () => void;
  onBackToLanding: () => void;
  onRedirectToLogin: () => void;
  darkMode?: boolean;
  onToggleTheme?: () => void;
}

// تعريف هياكل البيانات المسترجعة
interface Restaurant {
  id: string;
  name: string;
  phone_number: string;
  whatsapp_number_id: string;
  whatsapp_access_token?: string | null;
  catalog_id?: string | null;
  logo_url?: string | null;
  subscription_tier: string;
  subscription_status: string;
  subscription_expires_at: string;
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  image_url?: string | null;
  is_available: boolean;
  restaurant_id?: string;
}

interface Order {
  id: string;
  customer_phone: string;
  items_json: any;
  total_price: number;
  status: string;
  created_at: string;
}

interface Reservation {
  id: string;
  customer_phone: string;
  date_time: string;
  party_size: number;
  status: string;
}

interface Conversation {
  id: string;
  customer_phone: string;
  status: string;
  category: 'INQUIRY' | 'ORDER' | 'COMPLAINT' | 'GROUP';
  is_group?: boolean;
  group_name?: string;
  assigned_to?: string | null;
  closed_by?: string | null;
  is_archived?: boolean;
  created_at?: string;
  updated_at: string;
  isWindowOpen?: boolean;
  windowExpiresAt?: string | null;
  remainingHours?: number;
}

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sender_name?: string;
  senderName?: string;
  sender?: string;
  text?: string;
  image_url?: string;
  timestamp?: string;
  created_at?: string;
  is_template?: boolean;
  template_name?: string;
  isStaff?: boolean;
  is_edited?: boolean;
  edited_at?: string;
}

interface QuickReplyItem {
  id: string;
  label: string;
  text: string;
}

const DEFAULT_QUICK_REPLIES: QuickReplyItem[] = [
  { id: '1', label: '👋 ترحيب بالعميل', text: 'أهلاً بك في مطعم عيسى! 🌯 كيف أقدر أساعدك النهاردة؟' },
  { id: '2', label: '📦 حالة الطلب', text: 'تم تسجيل طلبك وجاري إعداده في المطبخ وسيصلك خلال 30 دقيقة!' },
  { id: '3', label: '⏰ مواعيد العمل', text: 'بنفتح يومياً من الساعة 11 صباحاً وحتى الساعة 2 صباحاً. مرحباً بك في أي وقت!' },
  { id: '4', label: '🛵 خدمة التوصيل', text: 'التوصيل مجاناً للطلبات الأكثر من 150 جنيه داخل المنطقة.' },
  { id: '5', label: '✅ تأكيد الاستلام', text: 'شكراً لتواصلك معنا! سعداء بخدمتك ونتمنى لك وجبة شهية.' }
];

const playNotificationSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {}
};

const getStoredQuickReplies = (restId?: string): QuickReplyItem[] => {
  try {
    const key = restId ? `rivix_quick_replies_${restId}` : 'rivix_quick_replies_v1';
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    return DEFAULT_QUICK_REPLIES;
  } catch (e) {
    return DEFAULT_QUICK_REPLIES;
  }
};

const saveQuickRepliesToStorage = (replies: QuickReplyItem[], restId?: string) => {
  try {
    const key = restId ? `rivix_quick_replies_${restId}` : 'rivix_quick_replies_v1';
    localStorage.setItem(key, JSON.stringify(replies));
  } catch (e) {}
};

const DEFAULT_CATEGORIES = ['وجبات رئيسية', 'مقبلات', 'مشروبات', 'حلويات'];

const getStoredCustomCategories = (restId?: string): string[] => {
  try {
    const key = restId ? `rivix_custom_categories_${restId}` : 'rivix_custom_categories_v1';
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const saveCustomCategoriesToStorage = (cats: string[], restId?: string) => {
  try {
    const key = restId ? `rivix_custom_categories_${restId}` : 'rivix_custom_categories_v1';
    localStorage.setItem(key, JSON.stringify(cats));
  } catch (e) {}
};


const getStoredDeletedIds = (restId?: string): string[] => {
  try {
    const key = restId ? `rivix_deleted_menu_items_${restId}` : 'rivix_deleted_menu_items';
    const raw = localStorage.getItem(key);
    if (!raw && restId) {
      const fallback = localStorage.getItem('rivix_deleted_menu_items');
      return fallback ? JSON.parse(fallback) : [];
    }
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const getStoredUserItems = (restId?: string): MenuItem[] => {
  try {
    const key = restId ? `rivix_menu_${restId}` : 'rivix_menu_v3';
    const raw = localStorage.getItem(key);
    if (!raw && restId) {
      const fallback = localStorage.getItem('rivix_menu_v3');
      const items = fallback ? JSON.parse(fallback) : [];
      return Array.isArray(items) ? items : [];
    }
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch (e) {
    return [];
  }
};

const saveMenuItemsToStorage = (items: MenuItem[], restId?: string) => {
  try {
    if (!Array.isArray(items)) return;
    const key = restId ? `rivix_menu_${restId}` : 'rivix_menu_v3';
    localStorage.setItem(key, JSON.stringify(items));
    if (restId) {
      localStorage.setItem('rivix_menu_v3', JSON.stringify(items));
    }
  } catch (e) {}
};

const saveDeletedIdsToStorage = (ids: string[], restId?: string) => {
  try {
    if (!Array.isArray(ids)) return;
    const key = restId ? `rivix_deleted_menu_items_${restId}` : 'rivix_deleted_menu_items';
    localStorage.setItem(key, JSON.stringify(ids));
    if (restId) {
      localStorage.setItem('rivix_deleted_menu_items', JSON.stringify(ids));
    }
  } catch (e) {}
};

const syncMenuItemsWithStorage = (serverItems?: any, _restId?: string): MenuItem[] => {
  if (serverItems && Array.isArray(serverItems)) {
    return serverItems;
  }
  return [];
};

class ChatErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Chat Error Boundary Caught Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '30px', textAlign: 'center', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)', margin: '16px' }}>
          <AlertTriangle size={44} color="#EF4444" style={{ marginBottom: '12px' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#EF4444', marginBottom: '6px' }}>تعذّر عرض تفاصيل هذه المحادثة</h3>
          <p style={{ fontSize: '0.85rem', color: '#64748B', maxWidth: '420px', marginBottom: '16px', lineHeight: '1.5' }}>
            تحتوي هذه المحادثة على بيانات غير مكتملة أو قديمة في قاعدة البيانات. تم تفعيل نمط الأمان لمنع انهيار الشاشة.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              if (this.props.onReset) this.props.onReset();
            }}
            style={{
              backgroundColor: '#0066FF',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 18px',
              fontSize: '0.85rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,102,255,0.3)'
            }}
          >
            🔄 إعادة تحميل المحادثة
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const getSafePhone = (c?: any): string => {
  if (!c) return 'رقم غير متاح';
  return String(c.customer_phone || c.customerPhone || 'رقم غير متاح');
};

const isGroupConvCheck = (c?: any): boolean => {
  if (!c) return false;
  const phone = getSafePhone(c);
  return c.category === 'GROUP' || Boolean(c.is_group) || (typeof phone === 'string' && (phone.includes('g.us') || phone.includes('جروب')));
};

const safeFormatTime = (ts?: any): string => {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
};

const Dashboard: React.FC<DashboardProps> = ({
  token,
  restaurantId,
  onLogout,
  onBackToLanding,
  onRedirectToLogin,
  darkMode = true,
  onToggleTheme,
}) => {
  const styles = getDashboardStyles(darkMode);
  const [activeTab, setActiveTab] = useState<'overview' | 'menu' | 'orders' | 'reservations' | 'conversations' | 'settings' | 'users' | 'ai-assistant'>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  
  // حالات تحميل البيانات العامة
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // بيانات التبويبات المختلفة
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>(() => getStoredCustomCategories(restaurantId));
  const [selectedMenuCategoryFilter, setSelectedMenuCategoryFilter] = useState<string>('ALL');
  const [isAddingNewCategoryInForm, setIsAddingNewCategoryInForm] = useState<boolean>(false);
  const [customCategoryInput, setCustomCategoryInput] = useState<string>('');
  const [showCategoryManagerModal, setShowCategoryManagerModal] = useState<boolean>(false);
  const [newCategoryManagerInput, setNewCategoryManagerInput] = useState<string>('');

  const allCategories = Array.from(
    new Set([
      ...DEFAULT_CATEGORIES,
      ...customCategories,
      ...menuItems.map(item => item?.category).filter(Boolean)
    ])
  );
  const [orders, setOrders] = useState<Order[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [unreadConvIds, setUnreadConvIds] = useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatImageUrls, setChatImageUrls] = useState<string[]>([]);
  // حالات الردود المحفوظة القابلة للإضافة والتعديل من قبل الأدمن
  const [savedReplies, setSavedReplies] = useState<QuickReplyItem[]>(() => getStoredQuickReplies(restaurantId));
  const [showAddReplyModal, setShowAddReplyModal] = useState<boolean>(false);
  const [newReplyLabel, setNewReplyLabel] = useState<string>('');
  const [newReplyText, setNewReplyText] = useState<string>('');
  // حالات نافذة الـ 24 ساعة وقوالب واتساب الرسمية
  const [selectedConvWindowOpen, setSelectedConvWindowOpen] = useState<boolean>(true);
  const [selectedConvExpiresAt, setSelectedConvExpiresAt] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState<boolean>(false);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('order_update');
  const [templateLanguage, setTemplateLanguage] = useState<string>('ar');
  const [templateLoading, setTemplateLoading] = useState<boolean>(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateSuccess, setTemplateSuccess] = useState<string | null>(null);

  const AVAILABLE_TEMPLATES = [
    {
      name: 'order_update',
      title: '📦 متابعة وتحديث حالة الطلب (Order Update)',
      description: 'يُستخدم لإخطار العميل بتحديث حالة طلبه وإعادة فتح المحادثة بعد انقضاء 24 ساعة.',
      preview: 'أهلاً بك! نود إبلاغك بأنه تم تحديث حالة طلبك لدى المطعم. يسعدنا تواصلك معنا لمتابعة تفاصيل الطلب.'
    },
    {
      name: 'issue_followup',
      title: '⚠️ متابعة الشكوى والدعم الفني (Issue Followup)',
      description: 'يُستخدم للمتابعة مع العميل بخصوص شكوى سابقة أو استفسار معلق.',
      preview: 'مرحباً بك من فريق خدمة العملاء! نتابع معك بخصوص ملاحظاتك الأخيرة، ويرجى التواصل معنا لضمان رضاك التام.'
    },
    {
      name: 'general_reconnect',
      title: '💬 إعادة التواصل واستعادة المحادثة (General Reconnect)',
      description: 'يُستخدم للتواصل العام واستعراض العروض وتجديد جلسة المحادثة.',
      preview: 'أهلاً بك مجدداً في مطعمنا! يسعدنا تقديم أحدث العروض والوجبات الخاصة لك. كيف يمكننا خدمتك اليوم؟'
    }
  ];

  const SAVED_QUICK_REPLIES = [
    { label: '👋 ترحيب بالعميل', text: 'أهلاً بك في مطعم عيسى! 🌯 كيف أقدر أساعدك النهاردة؟' },
    { label: '📦 حالة الطلب', text: 'تم تسجيل طلبك وجاري إعداده في المطبخ وسيصلك خلال 30 دقيقة!' },
    { label: '⏰ مواعيد العمل', text: 'بنفتح يومياً من الساعة 11 صباحاً وحتى الساعة 2 صباحاً. مرحباً بك في أي وقت!' },
    { label: '🛵 خدمة التوصيل', text: 'التوصيل مجاناً للطلبات الأكثر من 150 جنيه داخل المنطقة.' },
    { label: '✅ تأكيد الاستلام', text: 'شكراً لتواصلك معنا! سعداء بخدمتك ونتمنى لك وجبة شهية.' }
  ];

  // إعدادات وتصنيفات المستخدمين والمحادثات
  const [userRole, setUserRole] = useState<'admin' | 'staff'>('staff');
  const [currentUsername, setCurrentUsername] = useState<string>('موظف الخدمة');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'ALL' | 'ORDER' | 'COMPLAINT' | 'INQUIRY' | 'GROUP'>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'UNANSWERED' | 'IN_PROGRESS' | 'CLOSED'>('ALL');
  const [viewArchived, setViewArchived] = useState(false);
  const [usersList, setUsersList] = useState<{ id: string; username: string; role: string; created_at: string }[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'staff'>('staff');
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersSuccess, setUsersSuccess] = useState<string | null>(null);
  const [menuViewMode, setMenuViewMode] = useState<'grid' | 'table'>('grid');

  const getFoodImage = (item: MenuItem) => {
    if (item.image_url && item.image_url.trim()) return item.image_url;
    const name = item.name.toLowerCase();
    if (name.includes('شاورما')) return 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=600&q=80';
    if (name.includes('بيتزا')) return 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80';
    if (name.includes('بطاطس')) return 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80';
    if (name.includes('عصير') || name.includes('برتقال')) return 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=600&q=80';
    if (name.includes('كولا') || name.includes('مشروب')) return 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80';
    if (item.category.includes('مشروب')) return 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=600&q=80';
    if (item.category.includes('مقبل')) return 'https://images.unsplash.com/photo-1541529086526-db283c563270?auto=format&fit=crop&w=600&q=80';
    return 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80';
  };

  // لفك تشفير التوكن والحصول على الدور (Role) واسم الموظف
  useEffect(() => {
    if (token) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          window.atob(base64)
            .split('')
            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const decoded = JSON.parse(jsonPayload);
        setUserRole(decoded.role || 'staff');
        setCurrentUsername(decoded.username || 'موظف الخدمة');
      } catch (e) {
        setUserRole('staff');
        setCurrentUsername('موظف الخدمة');
      }
    }
  }, [token]);

  // حالات مساعد الضبط الذكي والتعليمات المخصصة
  const [aiInstructions, setAiInstructions] = useState('');
  const [configChatMessages, setConfigChatMessages] = useState<ChatMessage[]>([]);
  const [configChatInput, setConfigChatInput] = useState('');
  const [configLoading, setConfigLoading] = useState(false);
  const [isDirectEditing, setIsDirectEditing] = useState(false);

  // حالات إدارة المنيو (إضافة وتعديل)
  const [showAddMenuModal, setShowAddMenuModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [menuForm, setMenuForm] = useState({
    name: '',
    description: '',
    price: '',
    category: 'وجبات رئيسية',
    image_url: '',
    is_available: true,
  });

  const [settingsForm, setSettingsForm] = useState({
    name: '',
    phone_number: '',
    whatsapp_number_id: '',
    whatsapp_access_token: '',
    catalog_id: '',
    logo_url: '',
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [catalogSyncLoading, setCatalogSyncLoading] = useState(false);
  const [catalogSyncMessage, setCatalogSyncMessage] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingMessageText, setEditingMessageText] = useState<string>('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const selectedConversationIdRef = useRef<string | null>(null);

  const handleEditMessageSubmit = async (index: number) => {
    if (!selectedConversation || !editingMessageText.trim()) return;
    try {
      const res = await api.put(`/conversations/${selectedConversation.id}/messages/${index}`, {
        content: editingMessageText.trim()
      });
      const updated = res.data.messages || chatMessages.map((m, i) => i === index ? { ...m, content: editingMessageText.trim(), is_edited: true } : m);
      setChatMessages(updated);
      setEditingMessageIndex(null);
      setEditingMessageText('');
    } catch (err: any) {
      alert(err.response?.data?.message || 'فشل تعديل الرسالة.');
    }
  };

  const handleDeleteSingleMessage = async (index: number) => {
    if (!selectedConversation) return;
    if (!window.confirm('هل أنت متأكد من مسح هذه الرسالة نهائياً من المحادثة؟')) return;
    try {
      const res = await api.delete(`/conversations/${selectedConversation.id}/messages/${index}`);
      const updated = res.data.messages || chatMessages.filter((_, i) => i !== index);
      setChatMessages(updated);
    } catch (err: any) {
      alert(err.response?.data?.message || 'فشل مسح الرسالة.');
    }
  };

  const [copiedMsgIndex, setCopiedMsgIndex] = useState<number | null>(null);

  const handleCopyMessageText = (content: string, index: number) => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopiedMsgIndex(index);
    setTimeout(() => setCopiedMsgIndex(null), 2000);
  };

  const processClipboardData = async (clipboardData: DataTransfer): Promise<boolean> => {
    if (!clipboardData) return false;

    const items = Array.from(clipboardData.items || []);
    const files = Array.from(clipboardData.files || []);

    const rawImageFiles: File[] = [];

    // 1. فحص عناصر الحافظة المسحوبة مباشرة
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) rawImageFiles.push(file);
      } else if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name))) {
          rawImageFiles.push(file);
        }
      }
    }

    // 2. فحص قائمة الملفات في حال عدم وجود صورة في العناصر
    if (rawImageFiles.length === 0) {
      for (const file of files) {
        if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name)) {
          rawImageFiles.push(file);
        }
      }
    }

    // تنقية وتجميع الصور المتطابقة بالـ size و type لتجنب التكرار من اسكرين شوت ويندوز
    const imageFiles: File[] = [];
    const seenKeys = new Set<string>();
    for (const f of rawImageFiles) {
      const key = `${f.name}_${f.size}_${f.type}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        imageFiles.push(f);
      }
    }

    // 3. قراءة كافة الصور وضغطها تلقائياً وإضافتها للمعاينة (صورة واحدة فقط بدون تكرار)
    if (imageFiles.length > 0) {
      const readPromises = imageFiles.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const raw = reader.result as string;
            const compressed = await compressImageDataUrl(raw);
            resolve(compressed);
          };
          reader.readAsDataURL(file);
        });
      });

      const results = await Promise.all(readPromises);
      setChatImageUrls(prev => {
        const next = [...prev];
        for (const res of results) {
          if (!next.includes(res)) {
            next.push(res);
          }
        }
        return next;
      });
      return true;
    }

    // 4. فحص ما إذا كان النص الملصق عبارة عن صورة base64 مباشرة
    const textData = clipboardData.getData('text/plain') || '';
    if (textData.trim().startsWith('data:image/')) {
      const compressed = await compressImageDataUrl(textData.trim());
      setChatImageUrls(prev => prev.includes(compressed) ? prev : [...prev, compressed]);
      return true;
    }

    return false;
  };

  const handlePasteInChat = async (e: React.ClipboardEvent) => {
    if (e.clipboardData) {
      const handled = await processClipboardData(e.clipboardData);
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  };

  const handleSyncCatalog = async () => {
    if (!restaurant) return;
    setCatalogSyncLoading(true);
    setCatalogSyncMessage(null);
    try {
      const res = await api.post(`/restaurants/${restaurant.id}/catalog/sync`);
      setCatalogSyncMessage(res.data.message || 'تمت مزامنة الأصناف مع كتالوج Meta بنجاح!');
      setTimeout(() => setCatalogSyncMessage(null), 5000);
    } catch (err: any) {
      setCatalogSyncMessage(err.response?.data?.message || 'فشلت المزامنة. تأكد من إدخال معرف الكتالوج والتوكين في الإعدادات.');
    } finally {
      setCatalogSyncLoading(false);
    }
  };

  const handleSendCatalogToCustomer = async () => {
    if (!selectedConversation) return;
    try {
      const res = await api.post(`/conversations/${selectedConversation.id}/send-catalog`);
      const newCatMsg: ChatMessage = {
        role: 'assistant',
        content: '[🛍️ تم إرسال كتالوج الواتساب الرسمي المباشر للعميل]',
        sender_name: currentUsername,
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, newCatMsg]);
      alert(res.data.message || 'تم إرسال الكتالوج المباشر للعميل!');
    } catch (err: any) {
      alert(err.response?.data?.message || 'فشل إرسال الكتالوج للعميل.');
    }
  };

  // تصدير قائمة الطعام (المنيو) كملف إكسيل Excel (.xlsx)
  const handleExportMenuExcel = () => {
    if (!menuItems || menuItems.length === 0) {
      alert('لا توجد عناصر في المنيو لتصديرها.');
      return;
    }

    // دالة مساعدة: تحويل base64 لنص بديل، واقتطاع أي نص يتجاوز حد Excel (32767 حرف)
    const safeText = (val: string | undefined | null, maxLen = 32000): string => {
      if (!val) return '';
      if (val.startsWith('data:image')) return '[صورة مضمنة]';
      return val.length > maxLen ? val.substring(0, maxLen) + '...' : val;
    };

    try {
      const dataToExport = menuItems.map((item, index) => ({
        'م': index + 1,
        'اسم الصنف': safeText(item.name),
        'الوصف': safeText(item.description),
        'السعر (ج.م)': Number(item.price),
        'التصنيف': safeText(item.category),
        'حالة التوفر': item.is_available ? 'متوفر' : 'غير متوفر',
        'رابط الصورة': safeText(item.image_url)
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);

      worksheet['!cols'] = [
        { wch: 6 },
        { wch: 25 },
        { wch: 35 },
        { wch: 15 },
        { wch: 20 },
        { wch: 15 },
        { wch: 45 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Menu');

      // استخدام Blob + createObjectURL بدلاً من XLSX.writeFile لضمان التوافق مع جميع المتصفحات
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);

      const restName = (restaurant?.name || 'restaurant').replace(/\s+/g, '_');
      const fileName = `menu_${restName}_${new Date().toISOString().split('T')[0]}.xlsx`;

      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('فشل تصدير ملف الإكسيل:', err);
      alert('حدث خطأ أثناء تصدير ملف الإكسيل.');
    }
  };

const compressImageDataUrl = (dataUrl: string, maxWidth = 800, quality = 0.55): Promise<string> => {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image/') || dataUrl.startsWith('data:image/svg')) {
      return resolve(dataUrl);
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);

      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

  const handleChatImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileList = Array.from(files);
      const readPromises = fileList.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const rawDataUrl = reader.result as string;
            const compressed = await compressImageDataUrl(rawDataUrl);
            resolve(compressed);
          };
          reader.readAsDataURL(file);
        });
      });
      Promise.all(readPromises).then(results => {
        setChatImageUrls(prev => [...prev, ...results]);
      });
    }
  };

  const handleRemoveChatImage = (index: number) => {
    setChatImageUrls(prev => prev.filter((_, i) => i !== index));
    if (chatImageUrls.length <= 1 && chatFileInputRef.current) {
      chatFileInputRef.current.value = '';
    }
  };

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  // إنشاء أكسيوس مخصص مع رأس التفويض ومعالجة 401 تلقائياً
  const api = axios.create({
    baseURL: apiUrl,
  });

  api.interceptors.request.use((config) => {
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  api.interceptors.response.use(
    (response) => response,
    (err) => {
      if (err.response && err.response.status === 401) {
        onRedirectToLogin();
      }
      return Promise.reject(err);
    }
  );

  // جلب بيانات المطعم الأساسية فور التشغيل
  useEffect(() => {
    const fetchBaseData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // جلب بيانات المطعم الافتراضي
        const resRest = await api.get(`/restaurants/${restaurantId}`);
        const restData = resRest.data;
        if (token) {
          try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const decoded = JSON.parse(decodeURIComponent(window.atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
            if (decoded.username === 'houda' || decoded.restaurantName === 'مطعم عم عيسى') {
              restData.name = 'مطعم عم عيسى';
            }
          } catch (e) {}
        }
        setRestaurant(restData);
        setSettingsForm({
          name: restData.name || 'مطعم عم عيسى',
          phone_number: restData.phone_number || '',
          whatsapp_number_id: restData.whatsapp_number_id || '',
          whatsapp_access_token: restData.whatsapp_access_token || '',
          catalog_id: restData.catalog_id || '',
          logo_url: restData.logo_url || localStorage.getItem('restaurant_logo') || '',
        });

        // جلب بقية البيانات من قاعدة البيانات المركزية وحمايتها من أخطاء الاتصال
        const actualRestId = resRest.data.id;
        const [resMenu, resOrders, resReserv, resConvers, resAiInst, resCats, resQuick] = await Promise.all([
          api.get(`/restaurants/${actualRestId}/menu`).catch(() => ({ data: [] })),
          api.get(`/restaurants/${actualRestId}/orders`).catch(() => ({ data: [] })),
          api.get(`/restaurants/${actualRestId}/reservations`).catch(() => ({ data: [] })),
          api.get(`/restaurants/${actualRestId}/conversations`).catch(() => ({ data: [] })),
          api.get(`/restaurants/${actualRestId}/ai-instructions`).catch(() => ({ data: { instructions: '' } })),
          api.get(`/restaurants/${actualRestId}/categories`).catch(() => ({ data: [] })),
          api.get(`/restaurants/${actualRestId}/quick-replies`).catch(() => ({ data: [] }))
        ]);

        setMenuItems(resMenu.data || []);
        setOrders(resOrders.data || []);
        setReservations(resReserv.data || []);
        setConversations(resConvers.data || []);
        setAiInstructions(resAiInst.data?.instructions || '');

        if (Array.isArray(resCats.data) && resCats.data.length > 0) {
          setCustomCategories(resCats.data);
        }
        if (Array.isArray(resQuick.data) && resQuick.data.length > 0) {
          setSavedReplies(resQuick.data);
        }
      } catch (err: any) {
        console.error('خطأ أثناء جلب بيانات لوحة التحكم:', err);
        setError(err.response?.data?.message || 'عذراً، فشل الاتصال بالباك إند وقاعدة البيانات. تأكد من تشغيل المخدم وتهيئة قاعدة البيانات.');
      } finally {
        setLoading(false);
      }
    };

    fetchBaseData();
  }, [restaurantId, token]);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversation?.id || null;
  }, [selectedConversation?.id]);

  // تحديث الشات تلقائياً كل 3 ثواني وبشكل خفيف (بدون سحب المنيو والتصنيفات الثقيلة)
  useEffect(() => {
    if (!restaurant) return;
    const interval = setInterval(async () => {
      try {
        // ✅ جلب المحادثات فقط لتخفيف الضغط على الشبكة والسيرفر (المنيو يُجلب عند التحميل فقط)
        const resConvs = await api.get(`/restaurants/${restaurant.id}/conversations`);

        const freshConvs: Conversation[] = resConvs.data;
        if (Array.isArray(freshConvs)) {
          let hasActiveConvChanged = false;
          
          setConversations(prev => {
            let hasNewMessage = false;
            const newUnreads = new Set(unreadConvIds);

            freshConvs.forEach(fc => {
              const prevFc = prev.find(p => p.id === fc.id);
              if (prevFc && new Date(fc.updated_at).getTime() > new Date(prevFc.updated_at).getTime()) {
                if (fc.status === 'UNANSWERED' || fc.category === 'INQUIRY' || fc.category === 'ORDER') {
                  hasNewMessage = true;
                  newUnreads.add(fc.id);
                }
                if (fc.id === selectedConversationIdRef.current) {
                  hasActiveConvChanged = true;
                }
              } else if (!prevFc && prev.length > 0) {
                hasNewMessage = true;
                newUnreads.add(fc.id);
              }
            });

            if (hasNewMessage && soundEnabled) {
              playNotificationSound();
            }
            if (hasNewMessage) {
              setUnreadConvIds(newUnreads);
            }

            return freshConvs;
          });

          const currentActiveId = selectedConversationIdRef.current;
          if (currentActiveId) {
            api.get(`/conversations/${currentActiveId}/messages`).then(msgRes => {
              if (selectedConversationIdRef.current === currentActiveId) {
                const msgList = Array.isArray(msgRes.data) ? msgRes.data : (msgRes.data?.messages || []);
                setChatMessages(prev => {
                  if (prev.length !== msgList.length) {
                    return msgList;
                  }
                  const lastPrev = prev[prev.length - 1];
                  const lastNew = msgList[msgList.length - 1];
                  if (lastPrev?.content !== lastNew?.content || lastPrev?.timestamp !== lastNew?.timestamp) {
                    return msgList;
                  }
                  return prev;
                });
              }
            }).catch(() => {});
          }
        }
      } catch (e) {}
    }, 3000);

    return () => clearInterval(interval);
  }, [restaurant, unreadConvIds, soundEnabled]);

  // استماع حدث اللصق السريع (Ctrl + V) للصور على مستوى الشاشة بالكامل أثناء فتح شات
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      if (activeTab !== 'conversations' || !selectedConversation || !selectedConvWindowOpen) return;

      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target.id !== 'chat-input-field') {
        return;
      }

      if (e.clipboardData) {
        const handled = await processClipboardData(e.clipboardData);
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [activeTab, selectedConversation, selectedConvWindowOpen]);

  // تحديث التبويب النشط أو تنشيط جلب بيانات إضافية
  const changeTab = async (tab: typeof activeTab) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
    if (!restaurant) return;
    try {
      if (tab === 'menu') {
        const [resMenu, resCats] = await Promise.all([
          api.get(`/restaurants/${restaurant.id}/menu`),
          api.get(`/restaurants/${restaurant.id}/categories`)
        ]);
        setMenuItems(resMenu.data || []);
        if (Array.isArray(resCats.data)) setCustomCategories(resCats.data);
      } else if (tab === 'orders') {
        const res = await api.get(`/restaurants/${restaurant.id}/orders`);
        setOrders(res.data);
      } else if (tab === 'reservations') {
        const res = await api.get(`/restaurants/${restaurant.id}/reservations`);
        setReservations(res.data);
      } else if (tab === 'conversations') {
        const res = await api.get(`/restaurants/${restaurant.id}/conversations`);
        setConversations(res.data);
      } else if (tab === 'users') {
        fetchUsersList();
      } else if (tab === 'ai-assistant') {
        const res = await api.get(`/restaurants/${restaurant.id}/ai-instructions`);
        setAiInstructions(res.data.instructions || '');
      }
    } catch (err) {
      console.error('فشل تحديث البيانات للتبويب:', tab, err);
    }
  };

  // جلب قائمة المستخدمين
  const fetchUsersList = async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await api.get('/users');
      setUsersList(res.data);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setUsersError(err.response?.data?.message || 'فشل جلب قائمة المستخدمين.');
    } finally {
      setUsersLoading(false);
    }
  };

  // إنشاء مستخدم جديد
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) return;
    setUsersLoading(true);
    setUsersError(null);
    setUsersSuccess(null);
    try {
      const res = await api.post('/users', {
        username: newUsername,
        password: newPassword,
        role: newRole
      });
      setUsersSuccess(res.data.message || 'تم إنشاء الحساب بنجاح!');
      setNewUsername('');
      setNewPassword('');
      fetchUsersList();
    } catch (err: any) {
      console.error('Error creating user:', err);
      setUsersError(err.response?.data?.message || 'فشل إنشاء حساب الموظف.');
    } finally {
      setUsersLoading(false);
    }
  };

  // حذف مستخدم
  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذا الحساب؟')) return;
    setUsersLoading(true);
    setUsersError(null);
    setUsersSuccess(null);
    try {
      const res = await api.delete(`/users/${id}`);
      setUsersSuccess(res.data.message || 'تم حذف الحساب بنجاح!');
      fetchUsersList();
    } catch (err: any) {
      console.error('Error deleting user:', err);
      setUsersError(err.response?.data?.message || 'فشل حذف الحساب.');
    } finally {
      setUsersLoading(false);
    }
  };

  // تحديث تصنيف المحادثة يدوياً
  const handleUpdateCategory = async (conversationId: string, category: 'INQUIRY' | 'ORDER' | 'COMPLAINT' | 'GROUP') => {
    try {
      await api.put(`/conversations/${conversationId}/category`, { category });
      setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, category } : c));
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(prev => prev ? { ...prev, category } : null);
      }
    } catch (err: any) {
      console.error('Error updating category:', err);
      alert('فشل تحديث تصنيف المحادثة.');
    }
  };

  // تحديث حالة المحادثة (UNANSWERED / IN_PROGRESS / CLOSED) والاحتفاظ بتحديد اسم الموظف
  const handleUpdateStatus = async (conversationId: string, newStatus: 'UNANSWERED' | 'IN_PROGRESS' | 'CLOSED') => {
    try {
      const res = await api.put(`/conversations/${conversationId}/status`, {
        status: newStatus,
        assigned_to: newStatus === 'IN_PROGRESS' ? currentUsername : undefined,
        closed_by: newStatus === 'CLOSED' ? currentUsername : undefined
      });
      const updatedConv = res.data.conversation || {
        ...selectedConversation,
        status: newStatus,
        assigned_to: newStatus === 'UNANSWERED' ? null : (newStatus === 'IN_PROGRESS' ? currentUsername : selectedConversation?.assigned_to || currentUsername),
        closed_by: newStatus === 'CLOSED' ? currentUsername : null
      };
      setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, ...updatedConv } : c));
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(prev => prev ? { ...prev, ...updatedConv } : null);
      }
    } catch (err: any) {
      console.error('Error updating status:', err);
      alert('حدث خطأ أثناء تحديث حالة المحادثة.');
    }
  };

  // أرشفة أو إلغاء أرشفة المحادثة والتحديث الفوري المباشر (Optimistic UI Update)
  const handleToggleArchive = async (conversationId: string, is_archived: boolean) => {
    // 1. تحديث الحالة فوراً في الذاكرة المباشرة بدون أي انتظار
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, is_archived } : c));
    if (selectedConversation?.id === conversationId) {
      setSelectedConversation(prev => prev ? { ...prev, is_archived } : null);
    }

    try {
      await api.put(`/conversations/${conversationId}/archive`, { is_archived });
    } catch (err: any) {
      console.error('Error toggling archive:', err);
      // التراجع الفوري في حال حدوث خطأ في الشبكة
      setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, is_archived: !is_archived } : c));
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(prev => prev ? { ...prev, is_archived: !is_archived } : null);
      }
      alert('حدث خطأ أثناء حفظ التغييرات، يرجى الفحص والتحقق من الاتصال بالشبكة.');
    }
  };

  // حذف المحادثة نهائياً من قاعدة البيانات واللوحة
  const handleDeleteConversation = async (conversationId: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذه المحادثة نهائياً؟')) return;
    try {
      await api.delete(`/conversations/${conversationId}`);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(null);
      }
    } catch (err: any) {
      console.error('Error deleting conversation:', err);
      alert('حدث خطأ أثناء محاولة الحذف.');
    }
  };

  // إضافة رد محفوظ جديد بواسطة الأدمن
  const handleAddQuickReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReplyLabel.trim() || !newReplyText.trim()) return;

    const newItem: QuickReplyItem = {
      id: `reply_${Date.now()}`,
      label: newReplyLabel.trim(),
      text: newReplyText.trim()
    };

    const updated = [...savedReplies, newItem];
    setSavedReplies(updated);
    const restId = restaurant?.id || restaurantId;
    api.post(`/restaurants/${restId}/quick-replies`, { replies: updated }).catch(() => {});

    setNewReplyLabel('');
    setNewReplyText('');
    setShowAddReplyModal(false);
  };

  // حذف رد محفوظ من قبل الأدمن
  const handleDeleteQuickReply = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('هل أنت متأكد من حذف هذا الرد المحفوظ؟')) return;
    const updated = savedReplies.filter(r => r.id !== id);
    setSavedReplies(updated);
    const restId = restaurant?.id || restaurantId;
    api.post(`/restaurants/${restId}/quick-replies`, { replies: updated }).catch(() => {});
  };

  // دالة تحديد الألوان والبادجات للحالات الـ 3 (غير مردود، جاري الرد، مغلقة)
  const getStatusInfo = (conv: Conversation) => {
    const s = (conv.status || 'UNANSWERED').toUpperCase();
    if (s === 'CLOSED' || s === 'ARCHIVED') {
      return {
        label: conv.closed_by ? `✅ مغلقة بواسطة: ${conv.closed_by}` : '✅ مغلقة',
        shortLabel: 'مغلقة',
        color: darkMode ? '#94A3B8' : '#475569',
        bgColor: darkMode ? '#1E293B' : '#F1F5F9',
        borderColor: '#64748B',
        badgeBg: '#64748B'
      };
    }
    if (s === 'IN_PROGRESS' || s === 'ACTIVE') {
      return {
        label: conv.assigned_to ? `🔵 جاري المتابعة: ${conv.assigned_to}` : '🔵 جاري المتابعة',
        shortLabel: 'جاري المتابعة',
        color: darkMode ? '#60A5FA' : '#1E40AF',
        bgColor: darkMode ? 'rgba(30, 64, 175, 0.25)' : '#EFF6FF',
        borderColor: '#3B82F6',
        badgeBg: '#2563EB'
      };
    }
    return {
      label: '🟠 لم يتم الرد عليه بعد',
      shortLabel: 'لم يتم الرد',
      color: darkMode ? '#FBBF24' : '#B45309',
      bgColor: darkMode ? 'rgba(217, 119, 6, 0.25)' : '#FFFBEB',
      borderColor: '#F59E0B',
      badgeBg: '#D97706'
    };
  };

  // معالجة إرسال رسالة في شات الضبط الذكي للأدمن
  const handleConfigChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configChatInput.trim() || !restaurant) return;

    const userMsg = configChatInput;
    setConfigChatInput('');

    // إضافة رسالة المستخدم محلياً في قائمة الرسائل
    const newUserMessage: ChatMessage = { role: 'user', content: userMsg, timestamp: new Date().toISOString() };
    const updatedMsgs = [...configChatMessages, newUserMessage];
    setConfigChatMessages(updatedMsgs);
    setConfigLoading(true);

    try {
      const res = await api.post(`/restaurants/${restaurant.id}/ai-config-chat`, {
        message: userMsg,
        history: configChatMessages
      });

      // إضافة رد المساعد الذكي
      const assistantMsg: ChatMessage = { role: 'assistant', content: res.data.responseText, timestamp: new Date().toISOString() };
      setConfigChatMessages([...updatedMsgs, assistantMsg]);

      // تحديث قائمة القواعد النشطة الحالية المعروضة
      const resAiInst = await api.get(`/restaurants/${restaurant.id}/ai-instructions`);
      setAiInstructions(resAiInst.data.instructions || '');
    } catch (err: any) {
      console.error('Error in config chat:', err);
      alert(err.response?.data?.message || 'حدث خطأ أثناء معالجة رسالة الضبط.');
    } finally {
      setConfigLoading(false);
    }
  };

  // حفظ القواعد المكتوبة يدوياً مباشرة بقاعدة البيانات
  const handleDirectInstructionsSave = async () => {
    if (!restaurant) return;
    setConfigLoading(true);
    try {
      await api.put(`/restaurants/${restaurant.id}/ai-instructions`, { instructions: aiInstructions });
      alert('تم حفظ وتطبيق القواعد بنجاح!');
    } catch (err: any) {
      console.error('Error saving instructions:', err);
      alert('فشل حفظ القواعد في قاعدة البيانات.');
    } finally {
      setConfigLoading(false);
    }
  };

  // جلب رسائل محادثة معينة
  const handleSelectConversation = async (conversation: Conversation) => {
    selectedConversationIdRef.current = conversation.id;
    setSelectedConversation(conversation);

    // ✅ عرض الرسائل الموجودة فوراً من الـ conversation object (بدون انتظار)
    const existingMsgs: ChatMessage[] = Array.isArray((conversation as any).messages_json)
      ? (conversation as any).messages_json
      : [];
    if (existingMsgs.length > 0) {
      setChatMessages(existingMsgs);
    } else {
      setChatMessages([]); // نفرغ فقط لو مفيش رسائل مؤقتة
    }

    setUnreadConvIds(prev => {
      const next = new Set(prev);
      next.delete(conversation.id);
      return next;
    });

    // تمرير الشات لأسفل فوراً إذا في رسائل
    if (existingMsgs.length > 0) {
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50);
    }

    try {
      const res = await api.get(`/conversations/${conversation.id}/messages`);
      if (selectedConversationIdRef.current === conversation.id) {
        const msgList = Array.isArray(res.data) ? res.data : (res.data?.messages || []);
        // نُحدِّث الرسائل فقط لو الـ API رجع بيانات أحدث أو أكثر
        if (msgList.length >= existingMsgs.length) {
          setChatMessages(msgList);
        }
        if (res.data && res.data.isWindowOpen !== undefined) {
          setSelectedConvWindowOpen(res.data.isWindowOpen);
          setSelectedConvExpiresAt(res.data.windowExpiresAt || null);
        } else {
          setSelectedConvWindowOpen(conversation.isWindowOpen ?? true);
          setSelectedConvExpiresAt(conversation.windowExpiresAt ?? null);
        }
        // تمرير الشات لأسفل بعد التحديث
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch (err) {
      console.error('فشل جلب رسائل المحادثة:', err);
    }
  };

  // إرسال رد يدوي أو صور من لوحة التحكم وتسجيل اسم الموظف وتغيير الحالة لـ IN_PROGRESS
  const handleSendManualMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!chatInput.trim() && chatImageUrls.length === 0) || !selectedConversation || !restaurant) return;
    if (!selectedConvWindowOpen) {
      setShowTemplateModal(true);
      return;
    }

    const textToSend = chatInput;
    const imagesToSend = [...chatImageUrls];
    setChatInput('');
    setChatImageUrls([]);
    if (chatFileInputRef.current) chatFileInputRef.current.value = '';

    const newMsgs: ChatMessage[] = [];
    if (imagesToSend.length > 0) {
      imagesToSend.forEach((img, idx) => {
        newMsgs.push({
          role: 'assistant',
          content: idx === 0 ? textToSend : '',
          image_url: img,
          sender_name: currentUsername,
          timestamp: new Date().toISOString()
        });
      });
    } else {
      newMsgs.push({
        role: 'assistant',
        content: textToSend,
        sender_name: currentUsername,
        timestamp: new Date().toISOString()
      });
    }

    setChatMessages(prev => [...prev, ...newMsgs]);

    try {
      if (imagesToSend.length > 0) {
        for (let i = 0; i < imagesToSend.length; i++) {
          const caption = i === 0 ? textToSend : '';
          await api.post(`/conversations/${selectedConversation.id}/messages`, { content: caption, image_url: imagesToSend[i] });
        }
      } else {
        await api.post(`/conversations/${selectedConversation.id}/messages`, { content: textToSend });
      }

      const updatedData = {
        status: 'IN_PROGRESS',
        assigned_to: selectedConversation.assigned_to || currentUsername,
        updated_at: new Date().toISOString(),
        isWindowOpen: true
      };
      setConversations(prev => prev.map(c => c.id === selectedConversation.id ? { ...c, ...updatedData } : c));
      setSelectedConversation(prev => prev ? { ...prev, ...updatedData } : null);
      setSelectedConvWindowOpen(true);
    } catch (err: any) {
      console.error('خطأ إرسال رد يدوي:', err);
      if (err.response?.status === 400 && (err.response?.data?.error === 'SESSION_WINDOW_EXPIRED' || err.response?.data?.message?.includes('24'))) {
        setSelectedConvWindowOpen(false);
        setShowTemplateModal(true);
        setChatMessages(prev => prev.filter(m => !newMsgs.includes(m)));
      } else {
        setChatMessages(prev => prev.filter(m => !newMsgs.includes(m)));
        const errorText = err.response?.data?.message || err.response?.data?.error || err.message || 'فشل إرسال الصورة/الرسالة عبر الواتساب.';
        alert(errorText);
      }
    }
  };

  // إرسال قالب موثق من Meta وإعادة فتح الجلسة 24 ساعة
  const handleSendTemplateMessage = async () => {
    if (!selectedConversation) return;
    setTemplateLoading(true);
    setTemplateError(null);
    setTemplateSuccess(null);
    try {
      const res = await api.post(`/conversations/${selectedConversation.id}/send-template`, {
        templateName: selectedTemplateName,
        language: templateLanguage
      });
      setTemplateSuccess('تم إرسال القالب وتجديد نافذة الـ 24 ساعة بنجاح!');
      setSelectedConvWindowOpen(true);
      const selTempObj = AVAILABLE_TEMPLATES.find(t => t.name === selectedTemplateName);
      const newTemplateMsg: ChatMessage = {
        role: 'assistant',
        content: `[قالب موثّق من Meta: ${selTempObj?.name || selectedTemplateName}]\n${selTempObj?.preview || ''}`,
        sender_name: currentUsername,
        timestamp: new Date().toISOString(),
        is_template: true
      };
      setChatMessages(prev => [...prev, newTemplateMsg]);
      setTimeout(() => {
        setShowTemplateModal(false);
        setTemplateSuccess(null);
      }, 1500);
    } catch (err: any) {
      console.error('Error sending template message:', err);
      setTemplateError(err.response?.data?.message || 'فشل إرسال القالب الرسمي عبر Meta Graph API.');
    } finally {
      setTemplateLoading(false);
    }
  };

  // ================= عمليات المنيو (CRUD) =================

  const handleOpenAddModal = () => {
    setEditingItem(null);
    setMenuForm({
      name: '',
      description: '',
      price: '',
      category: 'وجبات رئيسية',
      image_url: '',
      is_available: true
    });
    setShowAddMenuModal(true);
  };

  const handleOpenEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setMenuForm({
      name: item.name,
      description: item.description || '',
      price: item.price.toString(),
      category: item.category,
      image_url: item.image_url || '',
      is_available: item.is_available
    });
    setShowAddMenuModal(true);
  };

  const handleSaveMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant) return;

    const dataPayload = {
      name: menuForm.name,
      description: menuForm.description,
      price: parseFloat(menuForm.price) || 0,
      category: menuForm.category,
      image_url: menuForm.image_url || '',
      is_available: menuForm.is_available
    };

    const targetId = editingItem ? editingItem.id : `item-${Date.now()}`;
    const fullItem: MenuItem = {
      id: targetId,
      restaurant_id: restaurant.id,
      ...dataPayload
    };




    const restId = restaurant?.id || restaurantId;

    if (menuForm.category && !customCategories.includes(menuForm.category) && !DEFAULT_CATEGORIES.includes(menuForm.category)) {
      const updatedCats = [...customCategories, menuForm.category];
      setCustomCategories(updatedCats);
      api.post(`/restaurants/${restId}/categories`, { categories: updatedCats }).catch(() => {});
    }

    setShowAddMenuModal(false);

    try {
      if (editingItem) {
        await api.put(`/menu/${editingItem.id}`, dataPayload);
      } else {
        await api.post(`/restaurants/${restaurant.id}/menu`, dataPayload);
      }
      const resMenu = await api.get(`/restaurants/${restaurant.id}/menu`);
      setMenuItems(resMenu.data || []);
    } catch (err: any) {
      console.error('خطأ أثناء حفظ الصنف:', err);
      alert(err.response?.data?.message || 'فشل حفظ الصنف في قاعدة البيانات.');
    }
  };

  const handleImportMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile || !restaurant) return;

    setImportLoading(true);
    setImportError(null);
    setImportSuccess(null);

    const formData = new FormData();
    formData.append('file', importFile);

    try {
      const res = await api.post(`/restaurants/${restaurant.id}/menu/import`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setImportSuccess(res.data.message || 'تم الاستيراد بنجاح!');
      setImportFile(null);
      
      // تحديث قائمة الطعام من قاعدة البيانات المركزية
      const resMenu = await api.get(`/restaurants/${restaurant.id}/menu`);
      setMenuItems(resMenu.data || []);

      // إغلاق المودال بعد ثانيتين
      setTimeout(() => {
        setShowImportModal(false);
        setImportSuccess(null);
      }, 2000);

    } catch (err: any) {
      console.error('خطأ أثناء الاستيراد:', err);
      setImportError(err.response?.data?.message || 'فشل استيراد الملف. يرجى التحقق من تنسيق الملف والبيانات.');
    } finally {
      setImportLoading(false);
    }
  };

  const handleDeleteMenuItem = async (itemId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذا الصنف من قائمة الطعام نهائياً؟')) return;

    setMenuItems(prev => prev.filter(m => m && m.id !== itemId));

    try {
      await api.delete(`/menu/${itemId}`);
      if (restaurant) {
        const resMenu = await api.get(`/restaurants/${restaurant.id}/menu`);
        setMenuItems(resMenu.data || []);
      }
    } catch (err: any) {
      console.warn('خطأ أثناء حذف الصنف من السيرفر:', err);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant) return;

    setSettingsLoading(true);
    setSettingsSuccess(null);
    setSettingsError(null);

    const updatedRest = { ...restaurant, ...settingsForm };
    setRestaurant(updatedRest);

    if (settingsForm.logo_url) {
      localStorage.setItem('restaurant_logo', settingsForm.logo_url);
    }

    try {
      await api.put(`/restaurants/${restaurant.id}`, settingsForm);
      setSettingsSuccess('تم حفظ الإعدادات واللوجو بنجاح ولن تتغير عند الريفريش!');
      setTimeout(() => {
        setSettingsSuccess(null);
      }, 3500);
    } catch (err: any) {
      setSettingsSuccess('تم حفظ الإعدادات بالمتصفح بنجاح!');
      setTimeout(() => {
        setSettingsSuccess(null);
      }, 3500);
    } finally {
      setSettingsLoading(false);
    }
  };

  // ================= عمليات الطلبات والحجوزات =================

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const res = await api.put(`/orders/${orderId}/status`, { status: newStatus });
      setOrders(prev => prev.map(o => o.id === orderId ? res.data.order : o));
    } catch (err) {
      console.error('خطأ تحديث الطلب:', err);
    }
  };

  const handleUpdateReservationStatus = async (resId: string, newStatus: string) => {
    try {
      const res = await api.put(`/reservations/${resId}/status`, { status: newStatus });
      setReservations(prev => prev.map(r => r.id === resId ? res.data.reservation : r));
    } catch (err) {
      console.error('خطأ تحديث الحجز:', err);
    }
  };

  // استعراض تفاصيل عناصر الطلب المخزنة كـ JSON
  const renderOrderItems = (itemsJson: any) => {
    try {
      const items = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
      if (!Array.isArray(items)) return 'تنسيق طلب غير صالح';
      return items.map((it: any, i: number) => (
        <div key={i} style={{ fontSize: '0.85rem' }}>
          • {it.name} (عدد: {it.quantity}) - {it.subtotal || it.price * it.quantity} ج.م
        </div>
      ));
    } catch (e) {
      return 'تفاصيل غير متوفرة';
    }
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div className="spinner"></div>
        <p style={{ marginTop: '16px', fontWeight: 'bold', color: '#5E6E85' }}>جاري تحميل بيانات لوحة التحكم من المخدم...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <AlertCircle size={48} color="#EF4444" />
        <h3 style={{ marginTop: '16px', fontSize: '1.25rem', fontWeight: 'bold' }}>فشل الاتصال بالنظام</h3>
        <p style={{ color: '#EF4444', textAlign: 'center', marginTop: '8px', maxWidth: '500px' }}>{error}</p>
        <button onClick={() => window.location.reload()} className="btn btn-primary" style={{ marginTop: '20px' }}>
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div style={styles.dashboardLayout}>
      {/* خلفية مظلمة شفافة للتغطية عند فتح القائمة */}
      {isSidebarOpen && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(6, 14, 30, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 998,
            transition: 'opacity 0.3s ease',
          }}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* شريط التنقل الجانبي المنزلق (Sidebar Drawer) */}
      <aside 
        style={{
          ...styles.sidebar,
          position: 'fixed',
          top: 0,
          right: isSidebarOpen ? 0 : '-320px',
          bottom: 0,
          width: '300px',
          zIndex: 999,
          boxShadow: isSidebarOpen ? '-8px 0 30px rgba(0,0,0,0.5)' : 'none',
          transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        <div 
          style={{ 
            ...styles.sidebarHeader, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '24px',
            paddingBottom: '16px',
            borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`
          }}
        >
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: onToggleTheme ? 'pointer' : 'default' }}
            onClick={onToggleTheme}
            title="اضغط على اللوجو لتبديل المظهر (داكن / مضيء)"
          >
            <img 
              src={restaurant?.logo_url || localStorage.getItem('restaurant_logo') || '/logo.jpg'} 
              alt={restaurant?.name || "RIVIX SYSTEM"} 
              style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(0, 210, 255, 0.4)' }} 
            />
            <div style={styles.sidebarTitle}>
              <div style={{ fontWeight: '800', fontSize: '1.15rem', color: darkMode ? '#FFFFFF' : '#0F1E36' }}>
                {restaurant?.name || 'Rivix System'}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#00D2FF' }}>تبديل المظهر 🌙/☀️</div>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            style={{
              background: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              border: 'none',
              color: darkMode ? '#FFFFFF' : '#0F1E36',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            title="إغلاق القائمة"
          >
            <X size={20} />
          </button>
        </div>

        <nav style={styles.sidebarNav}>
          <button
            onClick={() => changeTab('overview')}
            style={{ ...styles.navItem, ...(activeTab === 'overview' ? styles.navItemActive : {}) }}
          >
            <LayoutDashboard size={20} />
            <span>نظرة عامة</span>
          </button>

          <button
            onClick={() => changeTab('menu')}
            style={{ ...styles.navItem, ...(activeTab === 'menu' ? styles.navItemActive : {}) }}
          >
            <Utensils size={20} />
            <span>إدارة المنيو</span>
          </button>

          <button
            onClick={() => changeTab('orders')}
            style={{ ...styles.navItem, ...(activeTab === 'orders' ? styles.navItemActive : {}) }}
          >
            <ShoppingBag size={20} />
            <span>الطلبات الواردة</span>
          </button>

          <button
            onClick={() => changeTab('reservations')}
            style={{ ...styles.navItem, ...(activeTab === 'reservations' ? styles.navItemActive : {}) }}
          >
            <Calendar size={20} />
            <span>الحجوزات والطاولات</span>
          </button>

          <button
            onClick={() => changeTab('conversations')}
            style={{ ...styles.navItem, ...(activeTab === 'conversations' ? styles.navItemActive : {}) }}
          >
            <MessageSquare size={20} />
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>مراقبة المحادثات</span>
              {conversations.filter(c => c.category === 'COMPLAINT').length > 0 && (
                <span style={{
                  backgroundColor: '#EF4444',
                  color: '#FFFFFF',
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  marginRight: '6px'
                }}>
                  {conversations.filter(c => c.category === 'COMPLAINT').length} شكوى
                </span>
              )}
            </span>
          </button>

          <button
            onClick={() => changeTab('settings')}
            style={{ ...styles.navItem, ...(activeTab === 'settings' ? styles.navItemActive : {}) }}
          >
            <Settings size={20} />
            <span>إعدادات النظام</span>
          </button>

          {userRole === 'admin' && (
            <>
              <button
                onClick={() => changeTab('ai-assistant')}
                style={{ ...styles.navItem, ...(activeTab === 'ai-assistant' ? styles.navItemActive : {}) }}
              >
                <Sparkles size={20} />
                <span>مساعد الضبط الذكي</span>
              </button>

              <button
                onClick={() => changeTab('users')}
                style={{ ...styles.navItem, ...(activeTab === 'users' ? styles.navItemActive : {}) }}
              >
                <Users size={20} />
                <span>إدارة الموظفين</span>
              </button>
            </>
          )}
        </nav>

        <div style={styles.sidebarFooter}>
          <button onClick={onLogout} style={styles.logoutButton}>
            <LogOut size={20} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* زر القائمة العائم (Floating Menu Toggle Button) */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 990,
            backgroundColor: '#0066FF',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '50px',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 8px 25px rgba(0, 102, 255, 0.45)',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '0.9rem',
            transition: 'all 0.2s ease',
          }}
          title="فتح قائمة الاختيارات والتبويبات"
        >
          <Menu size={22} />
          <span>القائمة</span>
          {conversations.filter(c => c.category === 'COMPLAINT').length > 0 && (
            <span style={{
              backgroundColor: '#EF4444',
              color: '#FFFFFF',
              fontSize: '0.7rem',
              fontWeight: 'bold',
              padding: '2px 6px',
              borderRadius: '10px',
            }}>
              {conversations.filter(c => c.category === 'COMPLAINT').length}
            </span>
          )}
        </button>
      )}

      {/* محتوى لوحة التحكم الأساسي (Main Content) */}
      <main style={{ ...styles.mainContent, width: '100%' }}>
        {/* الهيدر العلوي */}
        <header style={styles.topBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => setIsSidebarOpen(prev => !prev)}
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '12px',
                fontSize: '0.95rem',
                fontWeight: '700',
                cursor: 'pointer',
                border: 'none',
                boxShadow: '0 4px 14px rgba(0, 102, 255, 0.35)',
              }}
              title="فتح قائمة الاختيارات والتبويبات"
            >
              <Menu size={22} />
              <span>زر القائمة</span>
              {conversations.filter(c => c.category === 'COMPLAINT').length > 0 && (
                <span style={{
                  backgroundColor: '#EF4444',
                  color: '#FFFFFF',
                  fontSize: '0.75rem',
                  fontWeight: '800',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  marginRight: '4px'
                }}>
                  {conversations.filter(c => c.category === 'COMPLAINT').length}
                </span>
              )}
            </button>

            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: darkMode ? '#FFFFFF' : '#0F1E36' }}>
                {activeTab === 'overview'
                  ? `مرحباً، ${restaurant?.name || 'مطعم عم عيسى'}`
                  : `مرحباً، ${currentUsername}`}
              </h2>
              <p style={{ fontSize: '0.85rem', color: darkMode ? '#94A3B8' : '#5E6E85' }}>
                {activeTab === 'overview'
                  ? `مستوى الاشتراك: ${restaurant?.subscription_tier || 'نشط'}`
                  : `حساب المستخدم: ${currentUsername} (${userRole === 'admin' ? 'مدير النظام' : 'موظف الخدمة'})`}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {onToggleTheme && (
              <button onClick={onToggleTheme} className="theme-toggle-btn" title="تبديل مظهر اللوحة">
                {darkMode ? <Sun size={18} color="#F59E0B" /> : <Moon size={18} color="#0066FF" />}
                <span>{darkMode ? 'الوضع المضيء' : 'الوضع الداكن'}</span>
              </button>
            )}
            <button onClick={onBackToLanding} className="btn btn-secondary">
              العودة لصفحة الهبوط
            </button>
          </div>
        </header>

        {/* محتوى التبويبات */}
        <div style={styles.contentBody}>
          
          {/* 1. التبويب الأول: نظرة عامة (Overview) */}
          {activeTab === 'overview' && (
            <div className="animate-fade-in" style={styles.tabContent}>
              <div style={styles.statsGrid}>
                <div className="glass-card" style={styles.statCard}>
                  <ShoppingBag size={32} color="#0066FF" />
                  <div>
                    <div style={styles.statLabel}>إجمالي الطلبات</div>
                    <div style={styles.statVal}>{orders.length}</div>
                  </div>
                </div>

                <div className="glass-card" style={styles.statCard}>
                  <Calendar size={32} color="#00D2FF" />
                  <div>
                    <div style={styles.statLabel}>إجمالي الحجوزات</div>
                    <div style={styles.statVal}>{reservations.length}</div>
                  </div>
                </div>

                <div className="glass-card" style={styles.statCard}>
                  <MessageSquare size={32} color="#10B981" />
                  <div>
                    <div style={styles.statLabel}>العملاء المتفاعلون</div>
                    <div style={styles.statVal}>{conversations.length}</div>
                  </div>
                </div>

                <div 
                  className="glass-card" 
                  style={{ ...styles.statCard, cursor: 'pointer' }}
                  onClick={() => {
                    setSelectedCategoryFilter('COMPLAINT');
                    setActiveTab('conversations');
                  }}
                  title="اضغط لمعاينة وتصفية كافة الشكاوى والبلاغات"
                >
                  <AlertCircle size={32} color="#EF4444" />
                  <div>
                    <div style={styles.statLabel}>الشكاوى والبلاغات</div>
                    <div style={{ ...styles.statVal, color: conversations.filter(c => c.category === 'COMPLAINT').length > 0 ? '#EF4444' : styles.statVal.color }}>
                      {conversations.filter(c => c.category === 'COMPLAINT').length}
                    </div>
                  </div>
                </div>
              </div>

              {/* بطاقة الاشتراك والدعم */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginTop: '24px' }}>
                <div className="glass-card" style={{ padding: '24px' }}>
                  <h3 style={styles.cardTitle}>الطلبات الأخيرة</h3>
                  {orders.length === 0 ? (
                    <p style={{ color: '#5E6E85', marginTop: '16px' }}>لا توجد طلبات واردة بعد.</p>
                  ) : (
                    <div style={styles.recentList}>
                      {orders.slice(0, 5).map(order => (
                        <div key={order.id} style={styles.listItem}>
                          <div>
                            <span style={{ fontWeight: 'bold' }}>رقم العميل: {order.customer_phone}</span>
                            <div style={{ color: '#5E6E85', fontSize: '0.8rem' }}>التاريخ: {new Date(order.created_at).toLocaleString()}</div>
                          </div>
                          <div>
                            <span style={{ fontWeight: 'bold', marginLeft: '12px' }}>{Number(order.total_price)} ج.م</span>
                            <span className={`badge badge-${order.status.toLowerCase()}`}>{order.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="glass-card" style={{ padding: '24px', background: 'linear-gradient(135deg, #06122C 0%, #0B192C 100%)', color: '#FFFFFF' }}>
                  <h3 style={{ ...styles.cardTitle, color: '#FFFFFF' }}>حالة الاشتراك</h3>
                  <div style={{ marginTop: '24px' }}>
                    <div style={{ fontSize: '0.9rem', color: '#8E9FB8' }}>حالة الخدمة:</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10B981', margin: '4px 0 16px 0' }}>{restaurant?.subscription_status}</div>
                    
                    <div style={{ fontSize: '0.9rem', color: '#8E9FB8' }}>تاريخ الانتهاء:</div>
                    <div style={{ fontSize: '1rem', fontWeight: 'bold', margin: '4px 0 24px 0' }}>
                      {restaurant ? new Date(restaurant.subscription_expires_at).toLocaleDateString() : 'N/A'}
                    </div>
                    
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
                      <p style={{ fontSize: '0.8rem', color: '#8E9FB8' }}>سيعمل الـ AI Agent تلقائياً للرد على واتساب طالما كان اشتراكك نشطاً.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. التبويب الثاني: إدارة المنيو (Menu Manager) */}
          {activeTab === 'menu' && (
            <div className="animate-fade-in" style={styles.tabContent}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h3 style={styles.cardTitle}>قائمة المأكولات والمشروبات</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>استعرض وعدّل أصناف طعام مطعمك المعروضة للزبائن بالصور والأسعار بالجنيه المصري.</p>
                </div>
                
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {/* زر التبديل بين عرض الكروت الفاخرة وعرض الجدول */}
                  <div style={{ display: 'flex', backgroundColor: 'var(--card-bg)', borderRadius: '10px', padding: '4px', border: '1px solid var(--border-color)' }}>
                    <button
                      onClick={() => setMenuViewMode('grid')}
                      style={{
                        border: 'none',
                        backgroundColor: menuViewMode === 'grid' ? '#0066FF' : 'transparent',
                        color: menuViewMode === 'grid' ? '#FFFFFF' : 'var(--text-muted)',
                        padding: '6px 14px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        transition: 'all 0.2s'
                      }}
                    >
                      عرض كروت الطعام 📇
                    </button>
                    <button
                      onClick={() => setMenuViewMode('table')}
                      style={{
                        border: 'none',
                        backgroundColor: menuViewMode === 'table' ? '#0066FF' : 'transparent',
                        color: menuViewMode === 'table' ? '#FFFFFF' : 'var(--text-muted)',
                        padding: '6px 14px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        transition: 'all 0.2s'
                      }}
                    >
                      عرض الجدول 📋
                    </button>
                  </div>

                  <button onClick={handleSyncCatalog} disabled={catalogSyncLoading} className="btn btn-secondary" style={{ backgroundColor: '#8B5CF6', color: '#FFFFFF', border: 'none' }} title="مزامنة كافة عناصر المنيو مع كتالوج Meta Commerce Catalog الرسمي على واتساب">
                    <Sparkles size={18} />
                    <span>{catalogSyncLoading ? 'جاري المزامنة...' : '🛍️ مزامنة كتالوج الواتساب'}</span>
                  </button>
                  <button onClick={() => setShowImportModal(true)} className="btn btn-secondary">
                    <Upload size={18} />
                    <span>استيراد Excel</span>
                  </button>
                  <button onClick={handleExportMenuExcel} className="btn btn-secondary" style={{ backgroundColor: '#10B981', color: '#FFFFFF', border: 'none' }} title="تصدير جميع عناصر المنيو في ملف إكسيل جاهز">
                    <Download size={18} />
                    <span>تصدير Excel</span>
                  </button>
                  <button onClick={handleOpenAddModal} className="btn btn-primary">
                    <Plus size={18} />
                    <span>إضافة صنف جديد</span>
                  </button>
                </div>
              </div>

              {catalogSyncMessage && (
                <div style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)', border: '1px solid #8B5CF6', color: '#8B5CF6', padding: '12px 16px', borderRadius: '10px', fontWeight: 'bold', fontSize: '0.88rem', marginBottom: '20px' }}>
                  {catalogSyncMessage}
                </div>
              )}

              {/* شريط تصفية وإدارة التصنيفات الديناميكية للمنيو */}
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '10px 0', borderBottom: '1px solid var(--border-color)', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setSelectedMenuCategoryFilter('ALL')}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '20px',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: selectedMenuCategoryFilter === 'ALL' ? '#0066FF' : 'var(--card-bg)',
                    color: selectedMenuCategoryFilter === 'ALL' ? '#FFFFFF' : 'var(--text-muted)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                  }}
                >
                  🍔 الكل ({menuItems.length})
                </button>
                {allCategories.map(cat => {
                  const count = menuItems.filter(item => item.category === cat).length;
                  const isSelected = selectedMenuCategoryFilter === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedMenuCategoryFilter(cat)}
                      style={{
                        padding: '6px 16px',
                        borderRadius: '20px',
                        fontSize: '0.82rem',
                        fontWeight: '700',
                        border: isSelected ? 'none' : '1px solid var(--border-color)',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? '#0066FF' : 'var(--card-bg)',
                        color: isSelected ? '#FFFFFF' : 'var(--text-main)',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.05)'
                      }}
                    >
                      {cat} ({count})
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setShowCategoryManagerModal(true)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    border: '1px dashed #0066FF',
                    cursor: 'pointer',
                    backgroundColor: 'rgba(0, 102, 255, 0.08)',
                    color: '#0066FF',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="إدارة وإضافة تصنيفات جديدة للمنيو"
                >
                  <span>🏷️ إدارة التصنيفات</span>
                </button>
              </div>

              {menuItems.length === 0 ? (
                <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
                  <Utensils size={48} color="#00D2FF" style={{ margin: '0 auto 16px auto' }} />
                  <p style={{ color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 'bold' }}>لا توجد أي أصناف في منيو المطعم حالياً.</p>
                  <button onClick={handleOpenAddModal} className="btn btn-primary" style={{ marginTop: '16px' }}>أضف أول صنف الآن</button>
                </div>
              ) : (() => {
                const filteredMenuItems = menuItems.filter(item => {
                  if (!item) return false;
                  if (selectedMenuCategoryFilter === 'ALL') return true;
                  return item.category === selectedMenuCategoryFilter;
                });

                if (filteredMenuItems.length === 0) {
                  return (
                    <div className="glass-card" style={{ padding: '30px', textAlign: 'center', margin: '16px 0' }}>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                        لا توجد أصناف تندرج تحت قسم <strong>"{selectedMenuCategoryFilter}"</strong> حالياً.
                      </p>
                      <button onClick={handleOpenAddModal} className="btn btn-primary" style={{ marginTop: '12px', fontSize: '0.85rem' }}>
                        ➕ إضافة صنف لقسم {selectedMenuCategoryFilter}
                      </button>
                    </div>
                  );
                }

                return menuViewMode === 'grid' ? (
                /* عرض كروت المأكولات الفاخرة بالصور والأسعار (Cards Grid View) */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px', marginTop: '16px' }}>
                  {filteredMenuItems.map(item => (
                    <div 
                      key={item.id} 
                      className="glass-card animate-fade-in"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        backgroundColor: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                      }}
                    >
                      {/* صورة الوجبة المضيئة مع السعر والتصنيف */}
                      <div style={{ position: 'relative', width: '100%', height: '175px', overflow: 'hidden', backgroundColor: '#060E1E' }}>
                        <img 
                          src={getFoodImage(item)} 
                          alt={item.name} 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(6,14,30,0.9) 0%, transparent 65%)' }} />
                        
                        {/* شارة التصنيف */}
                        <span style={{
                          position: 'absolute',
                          top: '12px',
                          left: '12px',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          backgroundColor: 'rgba(6, 14, 30, 0.8)',
                          color: '#00D2FF',
                          border: '1px solid rgba(0, 210, 255, 0.4)',
                          backdropFilter: 'blur(4px)'
                        }}>
                          {item.category}
                        </span>

                        {/* شارة السعر المضيئة بالجنيه المصري */}
                        <span style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          padding: '6px 14px',
                          borderRadius: '20px',
                          fontSize: '0.95rem',
                          fontWeight: '900',
                          backgroundColor: '#00D2FF',
                          color: '#06122C',
                          boxShadow: '0 4px 14px rgba(0, 210, 255, 0.6)',
                        }}>
                          {Number(item.price)} ج.م
                        </span>
                      </div>

                      {/* معلومات الوجبة والتحكم */}
                      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between', gap: '14px' }}>
                        <div>
                          <h4 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '8px' }}>{item.name}</h4>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5', minHeight: '40px' }}>
                            {item.description || 'وجبة شهية ومجهزة فوراً بفرن المطعم.'}
                          </p>
                        </div>

                        {/* شريط الحالة والخيارات */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            backgroundColor: item.is_available ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: item.is_available ? '#10B981' : '#EF4444',
                            border: item.is_available ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'
                          }}>
                            {item.is_available ? '● متوفر' : '✕ غير متوفر'}
                          </span>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              onClick={() => handleOpenEditModal(item)} 
                              style={{
                                border: 'none',
                                backgroundColor: 'rgba(0, 102, 255, 0.15)',
                                color: '#0066FF',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.8rem',
                                fontWeight: '700'
                              }}
                            >
                              <Edit size={14} />
                              <span>تعديل</span>
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                handleDeleteMenuItem(item.id, e);
                              }} 
                              style={{
                                border: 'none',
                                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                color: '#EF4444',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.8rem',
                                fontWeight: '700'
                              }}
                            >
                              <Trash size={14} style={{ pointerEvents: 'none' }} />
                              <span style={{ pointerEvents: 'none' }} onClick={(e) => e.stopPropagation()}>حذف</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* عرض الجدول التقليدي */
                <div style={styles.menuTableContainer}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={styles.tableHeaderRow}>
                        <th style={styles.tableHeaderCell}>الصورة والمعاينة</th>
                        <th style={styles.tableHeaderCell}>الصنف</th>
                        <th style={styles.tableHeaderCell}>التصنيف</th>
                        <th style={styles.tableHeaderCell}>السعر</th>
                        <th style={styles.tableHeaderCell}>الحالة</th>
                        <th style={styles.tableHeaderCell}>خيارات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMenuItems.map(item => (
                        <tr key={item.id} style={styles.tableRow}>
                          <td style={styles.tableCell}>
                            <img 
                              src={getFoodImage(item)} 
                              alt={item.name} 
                              style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border-color)' }} 
                            />
                          </td>
                          <td style={styles.tableCell}>
                            <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                            {item.description && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.description}</div>}
                          </td>
                          <td style={styles.tableCell}>{item.category}</td>
                          <td style={styles.tableCell}><span style={{ fontWeight: '900', color: '#00D2FF' }}>{Number(item.price)} ج.م</span></td>
                          <td style={styles.tableCell}>
                            <span style={{
                              padding: '4px 8px',
                              borderRadius: '12px',
                              fontSize: '0.75rem',
                              backgroundColor: item.is_available ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              color: item.is_available ? '#10B981' : '#EF4444'
                            }}>
                              {item.is_available ? 'متوفر' : 'غير متوفر'}
                            </span>
                          </td>
                          <td style={styles.tableCell}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => handleOpenEditModal(item)} style={styles.actionIconButton}>
                                <Edit size={16} color="#0066FF" />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleDeleteMenuItem(item.id, e);
                                }} 
                                style={styles.actionIconButton}
                              >
                                <Trash size={16} color="#EF4444" style={{ pointerEvents: 'none' }} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

              {/* مودال الإضافة والتعديل */}
              {showAddMenuModal && (
                <div style={styles.modalOverlay}>
                  <div className="glass-card" style={styles.modal}>
                    <h3 style={{ marginBottom: '20px', fontWeight: 'bold' }}>{editingItem ? 'تعديل صنف منيو' : 'إضافة صنف منيو جديد'}</h3>
                    <form onSubmit={handleSaveMenu}>
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>اسم الصنف</label>
                        <input
                          type="text"
                          value={menuForm.name}
                          onChange={e => setMenuForm({ ...menuForm, name: e.target.value })}
                          required
                          style={styles.formInput}
                        />
                      </div>

                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>الوصف</label>
                        <textarea
                          value={menuForm.description}
                          onChange={e => setMenuForm({ ...menuForm, description: e.target.value })}
                          style={{ ...styles.formInput, height: '80px', resize: 'none' }}
                        />
                      </div>

                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>صورة الصنف (اختر صورة من جهازك)</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px' }}>
                          {menuForm.image_url ? (
                            <div style={{ position: 'relative', width: '70px', height: '70px', borderRadius: '10px', overflow: 'hidden', border: '2px solid #00D2FF', flexShrink: 0 }}>
                              <img src={menuForm.image_url} alt="معاينة الصنف" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <button
                                type="button"
                                onClick={() => setMenuForm({ ...menuForm, image_url: '' })}
                                style={{ position: 'absolute', top: '2px', right: '2px', backgroundColor: 'rgba(239,68,68,0.95)', color: '#FFF', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                title="إزالة الصورة"
                              >
                                ✕
                              </button>
                            </div>
                          ) : null}

                          <div style={{ flex: 1 }}>
                            <input
                              type="file"
                              id="item-file-upload"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    setMenuForm({ ...menuForm, image_url: reader.result as string });
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                            <label
                              htmlFor="item-file-upload"
                              className="btn btn-secondary"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: 'pointer',
                                padding: '10px 16px',
                                borderRadius: '8px',
                                backgroundColor: 'rgba(0, 102, 255, 0.12)',
                                color: '#00D2FF',
                                border: '1px solid rgba(0, 210, 255, 0.3)',
                                fontWeight: '700',
                                fontSize: '0.85rem'
                              }}
                            >
                              <Upload size={18} />
                              <span>{menuForm.image_url ? 'تغيير صورة الصنف من الجهاز 📁' : 'اختر صورة الصنف من جهازك 📁'}</span>
                            </label>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
                              اختر أي صورة مخزنة على جهازك (موبايل أو كمبيوتر) ليتم عرضها فوراً على الكارت والواتساب!
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>السعر (ج.م)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={menuForm.price}
                            onChange={e => setMenuForm({ ...menuForm, price: e.target.value })}
                            required
                            style={styles.formInput}
                          />
                        </div>

                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>التصنيف</label>
                          {!isAddingNewCategoryInForm ? (
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <select
                                value={menuForm.category}
                                onChange={e => {
                                  if (e.target.value === 'ADD_NEW_CUSTOM_CATEGORY') {
                                    setIsAddingNewCategoryInForm(true);
                                    setCustomCategoryInput('');
                                  } else {
                                    setMenuForm({ ...menuForm, category: e.target.value });
                                  }
                                }}
                                style={{ ...styles.formInput, flex: 1 }}
                              >
                                {allCategories.map(cat => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                                <option value="ADD_NEW_CUSTOM_CATEGORY">➕ إضافة تصنيف جديد...</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsAddingNewCategoryInForm(true);
                                  setCustomCategoryInput('');
                                }}
                                className="btn btn-secondary"
                                style={{ padding: '8px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                                title="إضافة تصنيف جديد"
                              >
                                ➕ جديد
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <input
                                type="text"
                                placeholder="أدخل اسم التصنيف الجديد (مثل: مشويات...)"
                                value={customCategoryInput}
                                onChange={e => {
                                  setCustomCategoryInput(e.target.value);
                                  setMenuForm({ ...menuForm, category: e.target.value });
                                }}
                                required
                                style={{ ...styles.formInput, flex: 1 }}
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (customCategoryInput.trim()) {
                                    const newCat = customCategoryInput.trim();
                                    if (!customCategories.includes(newCat) && !DEFAULT_CATEGORIES.includes(newCat)) {
                                      const updated = [...customCategories, newCat];
                                      setCustomCategories(updated);
                                      const restId = restaurant?.id || restaurantId;
                                      api.post(`/restaurants/${restId}/categories`, { categories: updated }).catch(() => {});
                                    }
                                    setMenuForm({ ...menuForm, category: newCat });
                                  }
                                  setIsAddingNewCategoryInForm(false);
                                }}
                                className="btn btn-primary"
                                style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                              >
                                حفظ
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsAddingNewCategoryInForm(false);
                                  setMenuForm({ ...menuForm, category: allCategories[0] || 'وجبات رئيسية' });
                                }}
                                className="btn btn-secondary"
                                style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                              >
                                إلغاء
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ ...styles.formGroup, flexDirection: 'row', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          id="is_available"
                          checked={menuForm.is_available}
                          onChange={e => setMenuForm({ ...menuForm, is_available: e.target.checked })}
                        />
                        <label htmlFor="is_available" style={{ cursor: 'pointer', fontWeight: 'bold' }}>متوفر للطلب حالياً</label>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                        <button type="button" onClick={() => setShowAddMenuModal(false)} className="btn btn-secondary">إلغاء</button>
                        <button type="submit" className="btn btn-primary">حفظ</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* مودال الاستيراد من Excel */}
              {showImportModal && (
                <div style={styles.modalOverlay}>
                  <div className="glass-card" style={styles.modal}>
                    <h3 style={{ marginBottom: '16px', fontWeight: 'bold' }}>استيراد قائمة الطعام من Excel / CSV</h3>
                    
                    <div style={{ backgroundColor: 'rgba(0,102,255,0.05)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.85rem', color: '#8E9FB8', textAlign: 'right' }}>
                      <strong style={{ color: '#0066FF' }}>تنبيه بخصوص تنسيق الملف:</strong>
                      <p style={{ marginTop: '4px', margin: 0 }}>يجب أن يحتوي الملف على الأعمدة التالية:</p>
                      <p style={{ margin: '4px 0 0 0', fontWeight: 'bold' }}>الاسم | الوصف | السعر | التصنيف | متوفر</p>
                    </div>

                    {importError && (
                      <div style={{ ...styles.errorContainer, marginBottom: '16px' }}>
                        <AlertCircle size={20} color="#EF4444" style={{ marginLeft: 8 }} />
                        <span>{importError}</span>
                      </div>
                    )}

                    {importSuccess && (
                      <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '8px', color: '#6EE7B7', fontSize: '0.9rem', marginBottom: '16px', textAlign: 'right' }}>
                        <CheckCircle size={20} color="#10B981" style={{ marginLeft: 8 }} />
                        <span>{importSuccess}</span>
                      </div>
                    )}

                    <form onSubmit={handleImportMenu}>
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>اختر ملف Excel (.xlsx) أو CSV</label>
                        <input
                          type="file"
                          accept=".xlsx, .xls, .csv"
                          onChange={e => setImportFile(e.target.files?.[0] || null)}
                          required
                          disabled={importLoading}
                          style={{ ...styles.formInput, padding: '10px' }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                        <button type="button" onClick={() => { setShowImportModal(false); setImportError(null); setImportSuccess(null); }} className="btn btn-secondary" disabled={importLoading}>إلغاء</button>
                        <button type="submit" className="btn btn-primary" disabled={importLoading || !importFile}>
                          {importLoading ? (
                            <span className="spinner" style={{ width: 16, height: 16 }}></span>
                          ) : (
                            <>
                              <Upload size={16} />
                              <span>بدء الاستيراد</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* مودال إدارة التصنيفات للأدمن */}
              {showCategoryManagerModal && (
                <div style={styles.modalOverlay}>
                  <div className="glass-card" style={{ ...styles.modal, maxWidth: '520px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-main)', margin: 0 }}>🏷️ إدارة تصنيفات المنيو</h3>
                      <button
                        type="button"
                        onClick={() => setShowCategoryManagerModal(false)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', padding: '4px' }}
                      >
                        ✕
                      </button>
                    </div>

                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
                      يمكن للأدمن إضافة تصنيفات مخصصة جديدة (مثل: مشويات, عروض وتوفير, ساندوتشات, عصائر...) لتنظيم قائمة الطعام على الواجهة والواتساب.
                    </p>

                    {/* نموذج إضافة تصنيف جديد */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (newCategoryManagerInput.trim()) {
                          const catName = newCategoryManagerInput.trim();
                          if (!customCategories.includes(catName) && !DEFAULT_CATEGORIES.includes(catName)) {
                            const updated = [...customCategories, catName];
                            setCustomCategories(updated);
                            const restId = restaurant?.id || restaurantId;
                            api.post(`/restaurants/${restId}/categories`, { categories: updated }).catch(() => {});
                          }
                          setNewCategoryManagerInput('');
                        }
                      }}
                      style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}
                    >
                      <input
                        type="text"
                        placeholder="أدخل اسم تصنيف جديد (مثل: مشويات، وجبات أطفال...)"
                        value={newCategoryManagerInput}
                        onChange={(e) => setNewCategoryManagerInput(e.target.value)}
                        style={{ ...styles.formInput, flex: 1 }}
                        required
                      />
                      <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
                        ➕ إضافة
                      </button>
                    </form>

                    {/* قائمة التصنيفات المتاحة حالياً */}
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '10px', color: 'var(--text-main)' }}>التصنيفات المتاحة حالياً:</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '200px', overflowY: 'auto', padding: '4px' }}>
                      {allCategories.map((cat) => {
                        const isCustom = customCategories.includes(cat);
                        return (
                          <div
                            key={cat}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              backgroundColor: 'rgba(0, 102, 255, 0.12)',
                              border: '1px solid rgba(0, 102, 255, 0.25)',
                              fontSize: '0.85rem',
                              fontWeight: 'bold',
                              color: 'var(--text-main)'
                            }}
                          >
                            <span>{cat}</span>
                            {isCustom && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`هل أنت متأكد من حذف تصنيف "${cat}"؟`)) {
                                    const updated = customCategories.filter(c => c !== cat);
                                    setCustomCategories(updated);
                                    const restId = restaurant?.id || restaurantId;
                                    api.post(`/restaurants/${restId}/categories`, { categories: updated }).catch(() => {});
                                    if (selectedMenuCategoryFilter === cat) {
                                      setSelectedMenuCategoryFilter('ALL');
                                    }
                                  }
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#EF4444',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                  padding: '0 2px'
                                }}
                                title="حذف هذا التصنيف المخصص"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                      <button type="button" onClick={() => setShowCategoryManagerModal(false)} className="btn btn-secondary">إغلاق</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. التبويب الثالث: الطلبات (Orders) */}
          {activeTab === 'orders' && (
            <div className="animate-fade-in" style={styles.tabContent}>
              <h3 style={{ ...styles.cardTitle, marginBottom: '24px' }}>متابعة طلبات المأكولات والمشروبات</h3>
              
              {orders.length === 0 ? (
                <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
                  <ShoppingBag size={48} color="#5E6E85" style={{ margin: '0 auto 16px auto' }} />
                  <p>لم يتم تسجيل أي طلبات طعام بعد.</p>
                </div>
              ) : (
                <div style={styles.grid}>
                  {orders.map(order => (
                    <div key={order.id} className="glass-card" style={styles.orderCard}>
                      <div style={styles.orderCardHeader}>
                        <div>
                          <div style={{ fontWeight: 'bold' }}>زبون: {order.customer_phone}</div>
                          <div style={{ fontSize: '0.75rem', color: '#5E6E85' }}>التاريخ: {new Date(order.created_at).toLocaleString()}</div>
                        </div>
                        <span className={`badge badge-${order.status.toLowerCase()}`}>{order.status}</span>
                      </div>
                      
                      <div style={styles.orderCardBody}>
                        {renderOrderItems(order.items_json)}
                        <div style={{ borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '8px', marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                          <span>المجموع الكلي:</span>
                          <span>{Number(order.total_price)} ج.م</span>
                        </div>
                      </div>

                      <div style={styles.orderCardActions}>
                        {order.status === 'PENDING' && (
                          <button onClick={() => handleUpdateOrderStatus(order.id, 'PREPARING')} style={{ flex: 1 }} className="btn btn-primary">
                            قبول وتحضير
                          </button>
                        )}
                        {order.status === 'PREPARING' && (
                          <button onClick={() => handleUpdateOrderStatus(order.id, 'DELIVERED')} style={{ flex: 1 }} className="btn btn-accent">
                            تم التوصيل
                          </button>
                        )}
                        {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
                          <button onClick={() => handleUpdateOrderStatus(order.id, 'CANCELLED')} style={styles.cancelBtn}>
                            إلغاء
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. التبويب الرابع: الحجوزات (Reservations) */}
          {activeTab === 'reservations' && (
            <div className="animate-fade-in" style={styles.tabContent}>
              <h3 style={{ ...styles.cardTitle, marginBottom: '24px' }}>إدارة حجوزات الطاولات</h3>

              {reservations.length === 0 ? (
                <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
                  <Calendar size={48} color="#5E6E85" style={{ margin: '0 auto 16px auto' }} />
                  <p>لا توجد أي حجوزات طاولات نشطة حالياً.</p>
                </div>
              ) : (
                <div style={styles.menuTableContainer}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={styles.tableHeaderRow}>
                        <th style={styles.tableHeaderCell}>رقم هاتف العميل</th>
                        <th style={styles.tableHeaderCell}>تاريخ ووقت الحجز</th>
                        <th style={styles.tableHeaderCell}>عدد الأفراد</th>
                        <th style={styles.tableHeaderCell}>الحالة</th>
                        <th style={styles.tableHeaderCell}>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reservations.map(res => (
                        <tr key={res.id} style={styles.tableRow}>
                          <td style={{ ...styles.tableCell, fontWeight: 'bold' }}>{res.customer_phone}</td>
                          <td style={styles.tableCell}>{new Date(res.date_time).toLocaleString()}</td>
                          <td style={styles.tableCell}>{res.party_size} أشخاص</td>
                          <td style={styles.tableCell}>
                            <span className={`badge badge-${res.status.toLowerCase()}`}>{res.status}</span>
                          </td>
                          <td style={styles.tableCell}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {res.status === 'PENDING' && (
                                <>
                                  <button onClick={() => handleUpdateReservationStatus(res.id, 'CONFIRMED')} style={styles.actionBtnConfirm}>
                                    <CheckCircle size={16} /> تأكيد الحجز
                                  </button>
                                  <button onClick={() => handleUpdateReservationStatus(res.id, 'CANCELLED')} style={styles.actionBtnCancel}>
                                    <XCircle size={16} /> إلغاء
                                  </button>
                                </>
                              )}
                              {res.status === 'CONFIRMED' && (
                                <button onClick={() => handleUpdateReservationStatus(res.id, 'COMPLETED')} style={styles.actionBtnComplete}>
                                  إتمام وحضور
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 5. التبويب الخامس: مراقبة المحادثات (Conversations) */}
          {activeTab === 'conversations' && (
            <div className="animate-fade-in" style={{ ...styles.tabContent, height: 'calc(100vh - 180px)', padding: 0 }}>
              <div style={styles.conversationsLayout}>
                {/* قائمة المحادثات (يسار) */}
                <div style={styles.conversationsListPane}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ fontWeight: 'bold', margin: 0, fontSize: '0.95rem' }}>
                      دردشات خدمة العملاء 💬
                    </h4>
                    <button
                      type="button"
                      onClick={() => setSoundEnabled(prev => !prev)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.72rem',
                        fontWeight: 'bold',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: soundEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: soundEnabled ? '#10B981' : '#EF4444',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title={soundEnabled ? 'كتم صوت الإشعارات' : 'تفعيل صوت الإشعارات'}
                    >
                      {soundEnabled ? '🔔 الصوت: مفعّل' : '🔇 مكتوم'}
                    </button>
                  </div>
                  
                  {/* مفتاح التنقل بين الدردشات النشطة والأرشيف */}
                  <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.08)', backgroundColor: '#F1F5F9', padding: '4px', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setViewArchived(false)}
                      style={{
                        flex: 1,
                        padding: '8px 4px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: !viewArchived ? '#0066FF' : 'transparent',
                        color: !viewArchived ? '#FFFFFF' : '#64748B',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      💬 النشطة ({conversations.filter(c => !c.is_archived).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewArchived(true)}
                      style={{
                        flex: 1,
                        padding: '8px 4px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: viewArchived ? '#475569' : 'transparent',
                        color: viewArchived ? '#FFFFFF' : '#64748B',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      📦 الأرشيف ({conversations.filter(c => Boolean(c.is_archived)).length})
                    </button>
                  </div>
                  
                  {/* شريط فلترة التصنيفات (Categories) */}
                  <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.05)', backgroundColor: '#F8FAFC', padding: '6px', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryFilter('ALL')}
                      style={{
                        flex: 1,
                        padding: '5px 2px',
                        fontSize: '0.65rem',
                        fontWeight: 'bold',
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: selectedCategoryFilter === 'ALL' ? '#0066FF' : 'transparent',
                        color: selectedCategoryFilter === 'ALL' ? '#FFFFFF' : '#64748B',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      💬 الكل
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryFilter('ORDER')}
                      style={{
                        flex: 1,
                        padding: '5px 2px',
                        fontSize: '0.65rem',
                        fontWeight: 'bold',
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: selectedCategoryFilter === 'ORDER' ? '#10B981' : 'transparent',
                        color: selectedCategoryFilter === 'ORDER' ? '#FFFFFF' : '#64748B',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      📦 طلبات
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryFilter('COMPLAINT')}
                      style={{
                        flex: 1,
                        padding: '5px 2px',
                        fontSize: '0.65rem',
                        fontWeight: 'bold',
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: selectedCategoryFilter === 'COMPLAINT' ? '#EF4444' : 'transparent',
                        color: selectedCategoryFilter === 'COMPLAINT' ? '#FFFFFF' : '#64748B',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      ⚠️ شكاوى ({conversations.filter(c => (viewArchived ? Boolean(c.is_archived) : !c.is_archived) && c.category === 'COMPLAINT').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryFilter('INQUIRY')}
                      style={{
                        flex: 1,
                        padding: '5px 2px',
                        fontSize: '0.65rem',
                        fontWeight: 'bold',
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: selectedCategoryFilter === 'INQUIRY' ? '#3B82F6' : 'transparent',
                        color: selectedCategoryFilter === 'INQUIRY' ? '#FFFFFF' : '#64748B',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      ❓ استفسار
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryFilter('GROUP')}
                      style={{
                        flex: 1,
                        padding: '5px 2px',
                        fontSize: '0.65rem',
                        fontWeight: 'bold',
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: selectedCategoryFilter === 'GROUP' ? '#8B5CF6' : 'transparent',
                        color: selectedCategoryFilter === 'GROUP' ? '#FFFFFF' : '#64748B',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      👥 الجروبات ({conversations.filter(c => (viewArchived ? Boolean(c.is_archived) : !c.is_archived) && (c.category === 'GROUP' || c.is_group || c.customer_phone.includes('g.us') || c.customer_phone.includes('جروب'))).length})
                    </button>
                  </div>

                  {/* شريط فلترة الحالات الـ 3 (لم يتم الرد / جاري المتابعة / مغلقة) */}
                  <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.05)', backgroundColor: '#F1F5F9', padding: '6px', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedStatusFilter('ALL')}
                      style={{
                        flex: 1,
                        padding: '4px 2px',
                        fontSize: '0.65rem',
                        fontWeight: 'bold',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: selectedStatusFilter === 'ALL' ? '#334155' : 'transparent',
                        color: selectedStatusFilter === 'ALL' ? '#FFFFFF' : '#64748B',
                        cursor: 'pointer'
                      }}
                    >
                      الكل ({conversations.filter(c => viewArchived ? Boolean(c.is_archived) : !c.is_archived).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedStatusFilter('UNANSWERED')}
                      style={{
                        flex: 1,
                        padding: '4px 2px',
                        fontSize: '0.65rem',
                        fontWeight: 'bold',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: selectedStatusFilter === 'UNANSWERED' ? '#F59E0B' : 'transparent',
                        color: selectedStatusFilter === 'UNANSWERED' ? '#FFFFFF' : '#B45309',
                        cursor: 'pointer'
                      }}
                    >
                      🟠 معلّق
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedStatusFilter('IN_PROGRESS')}
                      style={{
                        flex: 1,
                        padding: '4px 2px',
                        fontSize: '0.65rem',
                        fontWeight: 'bold',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: selectedStatusFilter === 'IN_PROGRESS' ? '#3B82F6' : 'transparent',
                        color: selectedStatusFilter === 'IN_PROGRESS' ? '#FFFFFF' : '#1E40AF',
                        cursor: 'pointer'
                      }}
                    >
                      🔵 قيد الرد
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedStatusFilter('CLOSED')}
                      style={{
                        flex: 1,
                        padding: '4px 2px',
                        fontSize: '0.65rem',
                        fontWeight: 'bold',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: selectedStatusFilter === 'CLOSED' ? '#64748B' : 'transparent',
                        color: selectedStatusFilter === 'CLOSED' ? '#FFFFFF' : '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      ✅ مغلقة
                    </button>
                  </div>

                  {conversations
                    .filter(c => Boolean(c))
                    .filter(c => viewArchived ? Boolean(c.is_archived) : !c.is_archived)
                    .filter(c => {
                      if (selectedCategoryFilter === 'ALL') return true;
                      if (selectedCategoryFilter === 'GROUP') {
                        return isGroupConvCheck(c);
                      }
                      return c.category === selectedCategoryFilter;
                    })
                    .filter(c => {
                      const s = (c?.status || 'UNANSWERED').toUpperCase();
                      if (selectedStatusFilter === 'UNANSWERED') return s === 'UNANSWERED';
                      if (selectedStatusFilter === 'IN_PROGRESS') return s === 'IN_PROGRESS' || s === 'ACTIVE';
                      if (selectedStatusFilter === 'CLOSED') return s === 'CLOSED' || s === 'ARCHIVED';
                      return true;
                    }).length === 0 ? (
                    <p style={{ color: '#5E6E85', padding: '20px', textAlign: 'center', fontSize: '0.85rem' }}>
                      {viewArchived ? 'لا توجد محادثات مؤرشفة حالياً.' : 'لا توجد محادثات نشطة تطابق التصفية.'}
                    </p>
                  ) : (
                    <div style={{ overflowY: 'auto', flex: 1, padding: '6px', minHeight: 0 }}>
                      {conversations
                        .filter(c => Boolean(c))
                        .filter(c => viewArchived ? Boolean(c.is_archived) : !c.is_archived)
                        .filter(c => {
                          if (selectedCategoryFilter === 'ALL') return true;
                          if (selectedCategoryFilter === 'GROUP') {
                            return isGroupConvCheck(c);
                          }
                          return c.category === selectedCategoryFilter;
                        })
                        .filter(c => {
                          const s = (c?.status || 'UNANSWERED').toUpperCase();
                          if (selectedStatusFilter === 'UNANSWERED') return s === 'UNANSWERED';
                          if (selectedStatusFilter === 'IN_PROGRESS') return s === 'IN_PROGRESS' || s === 'ACTIVE';
                          if (selectedStatusFilter === 'CLOSED') return s === 'CLOSED' || s === 'ARCHIVED';
                          return true;
                        })
                        .map(conv => {
                          if (!conv) return null;
                          const phoneStr = getSafePhone(conv);
                          const isGroupConv = isGroupConvCheck(conv);
                          const catColor = conv.category === 'ORDER' ? '#10B981' : conv.category === 'COMPLAINT' ? '#EF4444' : isGroupConv ? '#8B5CF6' : '#3B82F6';
                          const catLabel = conv.category === 'ORDER' ? 'طلب' : conv.category === 'COMPLAINT' ? 'شكوى' : isGroupConv ? '👥 مجموعة' : 'استفسار';
                          const statusInfo = getStatusInfo(conv);
                          const isSelected = selectedConversation?.id === conv.id;
                          const timeFormatted = safeFormatTime(conv.updated_at || conv.created_at);

                          return (
                            <div
                              key={conv.id || Math.random()}
                              onClick={() => handleSelectConversation(conv)}
                              style={{
                                padding: '10px 12px',
                                marginBottom: '6px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                backgroundColor: isSelected ? 'rgba(0, 102, 255, 0.08)' : statusInfo.bgColor,
                                borderRight: `4px solid ${statusInfo.borderColor}`,
                                borderTop: '1px solid rgba(0,0,0,0.03)',
                                borderLeft: '1px solid rgba(0,0,0,0.03)',
                                borderBottom: '1px solid rgba(0,0,0,0.03)'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: `${catColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <MessageSquare size={14} color={catColor} />
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '0.82rem' }}>{phoneStr}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                      <span style={{ fontSize: '0.65rem', color: catColor, fontWeight: 'bold', backgroundColor: `${catColor}10`, padding: '2px 6px', borderRadius: '4px' }}>
                                        {catLabel}
                                      </span>
                                      {timeFormatted && (
                                        <span style={{ fontSize: '0.65rem', color: '#8E9FB8' }}>
                                          {timeFormatted}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* الشارات الملونة لهوية الموظف والحالة الـ 3 والإشعارات */}
                              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                                <span style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 'bold',
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  backgroundColor: statusInfo.badgeBg,
                                  color: '#FFFFFF'
                                }}>
                                  {statusInfo.label}
                                </span>
                                {unreadConvIds.has(conv.id) && (
                                  <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 'bold',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    backgroundColor: '#EF4444',
                                    color: '#FFFFFF',
                                    animation: 'pulse 1.5s infinite',
                                    boxShadow: '0 0 8px rgba(239, 68, 68, 0.5)'
                                  }}>
                                    🔔 رسالة جديدة
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* واجهة الرسائل (يمين) مع حماية ErrorBoundary */}
                <ChatErrorBoundary onReset={() => { selectedConversationIdRef.current = null; setSelectedConversation(null); setChatMessages([]); }}>
                  <div style={styles.chatPane}>
                    {selectedConversation ? (
                      <>
                        {/* هيدر الدردشة مع التحكم بالحالة واسم الموظف وزر الأرشفة */}
                        <div style={{ ...styles.chatPaneHeader, padding: '12px 16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                {(() => {
                                  const phoneStr = getSafePhone(selectedConversation);
                                  const isGroup = isGroupConvCheck(selectedConversation);
                                  return (
                                    <>
                                      <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: darkMode ? '#FFFFFF' : '#0F1E36' }}>
                                        {isGroup ? `👥 مجموعة: ${phoneStr}` : `📱 رقم العميل: ${phoneStr}`}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (phoneStr && phoneStr !== 'رقم غير متاح') {
                                            navigator.clipboard.writeText(phoneStr);
                                            setCopySuccess(true);
                                            setTimeout(() => setCopySuccess(false), 2000);
                                          }
                                        }}
                                        style={{
                                          border: '1px solid #CBD5E1',
                                          backgroundColor: copySuccess ? '#10B981' : '#FFFFFF',
                                          color: copySuccess ? '#FFFFFF' : '#0F1E36',
                                          borderRadius: '6px',
                                          padding: '3px 8px',
                                          fontSize: '0.72rem',
                                          fontWeight: 'bold',
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          transition: 'all 0.2s'
                                        }}
                                        title="نسخ رقم الهاتف للحافظة"
                                      >
                                        {copySuccess ? (
                                          <>
                                            <CheckCircle size={13} color="#FFFFFF" />
                                            <span>تم النسخ!</span>
                                          </>
                                        ) : (
                                          <>
                                            <Copy size={13} color="#0066FF" />
                                            <span>نسخ الرقم</span>
                                          </>
                                        )}
                                      </button>
                                    </>
                                  );
                                })()}
                              </div>
                              
                              {/* عرض هوية الموظف المتابع أو مغلق الشات */}
                              <div style={{ fontSize: '0.75rem', marginTop: '3px' }}>
                                {(() => {
                                  const stInfo = getStatusInfo(selectedConversation);
                                  return (
                                    <span style={{ fontWeight: 'bold', color: stInfo.color }}>
                                      الحالة الحالية: {stInfo.label}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                              {/* زر إرسال الكتالوج الرسمي المباشر للعميل */}
                              <button
                                type="button"
                                onClick={handleSendCatalogToCustomer}
                                style={{
                                  border: 'none',
                                  backgroundColor: '#8B5CF6',
                                  color: '#FFFFFF',
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  fontSize: '0.75rem',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  boxShadow: '0 2px 6px rgba(139, 92, 246, 0.3)'
                                }}
                                title="إرسال كارت الكتالوج الرسمي المباشر للعميل على الواتساب"
                              >
                                🛍️ إرسال الكتالوج
                              </button>

                              {/* زر الأرشفة / إلغاء الأرشفة */}
                              {!selectedConversation.is_archived ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleArchive(selectedConversation.id, true)}
                                  style={{
                                    border: 'none',
                                    backgroundColor: '#475569',
                                    color: '#FFFFFF',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 6px rgba(71, 85, 105, 0.3)'
                                  }}
                                  title="أرشفة المحادثة ونقلها لأرشيف النظام"
                                >
                                  📦 أرشفة الشات
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleToggleArchive(selectedConversation.id, false)}
                                  style={{
                                    border: 'none',
                                    backgroundColor: '#0066FF',
                                    color: '#FFFFFF',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 6px rgba(0, 102, 255, 0.3)'
                                  }}
                                  title="إعادة الشات للقائمة النشطة"
                                >
                                  📤 إلغاء الأرشفة
                                </button>
                              )}

                              {/* زر حذف المحادثة نهائياً */}
                              <button
                                type="button"
                                onClick={() => handleDeleteConversation(selectedConversation.id)}
                                style={{
                                  border: 'none',
                                  backgroundColor: '#EF4444',
                                  color: '#FFFFFF',
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  fontSize: '0.75rem',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  boxShadow: '0 2px 6px rgba(239, 68, 68, 0.3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="حذف هذه المحادثة وكافة رسائلها نهائياً"
                              >
                                <Trash size={13} />
                                <span>حذف المحادثة</span>
                              </button>

                              {/* أزرار التحكم الفوري بالحالة لتحديد اسم الموظف */}
                              {(selectedConversation.status || '').toUpperCase() !== 'IN_PROGRESS' && (selectedConversation.status || '').toUpperCase() !== 'ACTIVE' && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(selectedConversation.id, 'IN_PROGRESS')}
                                  style={{
                                    border: 'none',
                                    backgroundColor: '#3B82F6',
                                    color: '#FFFFFF',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 6px rgba(59, 130, 246, 0.3)'
                                  }}
                                  title="استلام متابعة الدردشة باسمك الحالي"
                                >
                                  🔵 استلام الدردشة ({currentUsername})
                                </button>
                              )}

                              {(selectedConversation.status || '').toUpperCase() !== 'CLOSED' ? (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(selectedConversation.id, 'CLOSED')}
                                  style={{
                                    border: 'none',
                                    backgroundColor: '#EF4444',
                                    color: '#FFFFFF',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 6px rgba(239, 68, 68, 0.3)'
                                  }}
                                >
                                  🔴 إغلاق المحادثة
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(selectedConversation.id, 'IN_PROGRESS')}
                                  style={{
                                    border: 'none',
                                    backgroundColor: '#10B981',
                                    color: '#FFFFFF',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
                                  }}
                                >
                                  🔄 إعادة فتح الدردشة
                                </button>
                              )}

                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRight: '1px solid #E2E8F0', paddingRight: '10px' }}>
                                <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 'bold' }}>التصنيف:</span>
                                <select
                                  value={selectedConversation.category || (isGroupConvCheck(selectedConversation) ? 'GROUP' : 'INQUIRY')}
                                  onChange={(e) => handleUpdateCategory(selectedConversation.id, e.target.value as any)}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    color: selectedConversation.category === 'ORDER' ? '#10B981' : selectedConversation.category === 'COMPLAINT' ? '#EF4444' : selectedConversation.category === 'GROUP' ? '#8B5CF6' : '#3B82F6'
                                  }}
                                >
                                  <option value="INQUIRY">❓ استفسارات</option>
                                  <option value="ORDER">📦 طلبات</option>
                                  <option value="COMPLAINT">⚠️ شكاوى</option>
                                  <option value="GROUP">👥 مجموعات الواتساب (API Group)</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div style={styles.chatPaneBody}>
                          {!Array.isArray(chatMessages) || chatMessages.length === 0 ? (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#5E6E85' }}>
                              لا توجد رسائل مسجلة في المحادثة بعد.
                            </div>
                          ) : (
                            chatMessages.map((msg, i) => {
                              if (!msg) return null;
                              const msgRole = msg.role || ((msg as any).isStaff || (msg as any).sender === 'staff' ? 'assistant' : 'user');
                              const isUser = msgRole === 'user';
                              const msgContent = msg.content || (msg as any).text || '';
                              const senderName = msg.sender_name || (msg as any).senderName || (msg as any).sender || '';
                              const timeStr = safeFormatTime(msg.timestamp || (msg as any).created_at);

                              return (
                                <div
                                  key={i}
                                  style={{
                                    ...styles.chatPaneMessageRow,
                                    justifyContent: isUser ? 'flex-start' : 'flex-end',
                                  }}
                                >
                                  <div
                                    style={{
                                      ...styles.chatPaneBubble,
                                      backgroundColor: isUser ? (darkMode ? '#202C33' : '#FFFFFF') : (darkMode ? '#005C4B' : '#D9FDD3'),
                                      color: isUser ? (darkMode ? '#E9EDEF' : '#111B21') : (darkMode ? '#E9EDEF' : '#111B21'),
                                      border: isUser ? (darkMode ? '1px solid #2A3942' : '1px solid #E2E8F0') : (darkMode ? 'none' : '1px solid #C6F6D5'),
                                      borderRadius: isUser ? '14px 14px 14px 2px' : '14px 14px 2px 14px',
                                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                      position: 'relative',
                                      minWidth: '200px'
                                    }}
                                  >
                                    {senderName && !isUser && (
                                      <div style={{ fontSize: '0.65rem', color: '#0066FF', fontWeight: '800', marginBottom: '4px' }}>
                                        الرد بواسطة الموظف: {senderName}
                                      </div>
                                    )}
                                    {msg.image_url && (
                                      <div style={{ marginBottom: '6px' }}>
                                        <img
                                          src={msg.image_url}
                                          alt="صورة مرفقة"
                                          style={{ maxWidth: '240px', maxHeight: '180px', borderRadius: '8px', objectFit: 'cover', display: 'block' }}
                                        />
                                      </div>
                                    )}

                                    {editingMessageIndex === i ? (
                                      <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <textarea
                                          value={editingMessageText}
                                          onChange={e => setEditingMessageText(e.target.value)}
                                          style={{
                                            width: '100%',
                                            minHeight: '60px',
                                            padding: '8px',
                                            borderRadius: '6px',
                                            border: '1px solid #0066FF',
                                            fontSize: '0.85rem',
                                            outline: 'none',
                                            backgroundColor: darkMode ? '#1E293B' : '#FFFFFF',
                                            color: darkMode ? '#F8FAFC' : '#0F172A',
                                            resize: 'vertical'
                                          }}
                                          autoFocus
                                        />
                                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                          <button
                                            type="button"
                                            onClick={() => handleEditMessageSubmit(i)}
                                            style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '4px', border: 'none', backgroundColor: '#0066FF', color: '#FFF', fontWeight: 'bold', cursor: 'pointer' }}
                                          >
                                            حفظ التعديل
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setEditingMessageIndex(null)}
                                            style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #CBD5E1', backgroundColor: 'transparent', color: darkMode ? '#94A3B8' : '#475569', cursor: 'pointer' }}
                                          >
                                            إلغاء
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        {msgContent && <p style={{ fontSize: '0.85rem', color: darkMode ? '#F8FAFC' : '#0F172A', margin: 0, whiteSpace: 'pre-wrap' }}>{msgContent}</p>}
                                        
                                        {/* شريط الإجراءات: تعديل ومسح الرسالة */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '4px' }}>
                                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <button
                                              type="button"
                                              onClick={() => handleCopyMessageText(msgContent, i)}
                                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: copiedMsgIndex === i ? '#10B981' : (darkMode ? '#94A3B8' : '#64748B'), opacity: 0.85 }}
                                              title="نسخ النص (Ctrl+C)"
                                            >
                                              {copiedMsgIndex === i ? <CheckCircle size={13} color="#10B981" /> : <Copy size={13} />}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditingMessageIndex(i);
                                                setEditingMessageText(msgContent);
                                              }}
                                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#0066FF', opacity: 0.8 }}
                                              title="تعديل هذه الرسالة"
                                            >
                                              <Edit size={13} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteSingleMessage(i)}
                                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#EF4444', opacity: 0.8 }}
                                              title="مسح هذه الرسالة نهائياً"
                                            >
                                              <Trash size={13} />
                                            </button>
                                          </div>
                                          
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            {(msg.is_edited || (msg as any).is_edited) && (
                                              <span style={{ fontSize: '0.6rem', color: '#94A3B8', fontStyle: 'italic' }}>(مُعدّلة)</span>
                                            )}
                                            {timeStr && (
                                              <span style={{ fontSize: '0.6rem', color: '#94A3B8' }}>{timeStr}</span>
                                            )}
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                          <div ref={chatEndRef} />
                        </div>

                        <form onSubmit={handleSendManualMessage} style={{ ...styles.chatPaneInputArea, flexDirection: 'column', gap: '8px' }}>
                          {/* شريط الردود السريعة المحفوظة */}
                          {selectedConvWindowOpen && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', width: '100%', paddingBottom: '4px', scrollbarWidth: 'thin' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: darkMode ? '#94A3B8' : '#64748B', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Sparkles size={14} color="#0066FF" />
                                <span>ردود محفوظة:</span>
                              </span>
                              {savedReplies.map((reply) => (
                                <div
                                  key={reply.id}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    border: '1px solid #BFDBFE',
                                    backgroundColor: darkMode ? '#1E293B' : '#EFF6FF',
                                    color: darkMode ? '#93C5FD' : '#1E40AF',
                                    borderRadius: '16px',
                                    padding: '3px 10px',
                                    fontSize: '0.72rem',
                                    fontWeight: 'bold',
                                    whiteSpace: 'nowrap',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                  }}
                                >
                                  <span
                                    onClick={() => setChatInput(reply.text)}
                                    style={{ cursor: 'pointer' }}
                                    title={`إدراج الرد: "${reply.text}"`}
                                  >
                                    {reply.label}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => handleDeleteQuickReply(reply.id, e)}
                                    style={{
                                      border: 'none',
                                      background: 'none',
                                      color: darkMode ? '#94A3B8' : '#64748B',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      padding: 0,
                                      marginLeft: '2px'
                                    }}
                                    title="حذف هذا الرد المحفوظ"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              ))}
                              {/* زر إضافة رد محفوظ جديد للأدمن */}
                              <button
                                type="button"
                                onClick={() => setShowAddReplyModal(true)}
                                style={{
                                  border: '1px dashed #0066FF',
                                  backgroundColor: darkMode ? 'rgba(0, 102, 255, 0.15)' : '#EBF3FF',
                                  color: '#0066FF',
                                  borderRadius: '16px',
                                  padding: '3px 10px',
                                  fontSize: '0.72rem',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="إضافة رد جديد مخصص لقائمة الردود المحفوظة"
                              >
                                <Plus size={13} />
                                <span>إضافة رد</span>
                              </button>
                            </div>
                          )}

                          {/* شريط التحذير الأصفر عند انتهاء نافذة الـ 24 ساعة للعميل */}
                          {!selectedConvWindowOpen && (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              backgroundColor: darkMode ? 'rgba(217, 119, 6, 0.15)' : '#FEF3C7',
                              border: '1px solid #F59E0B',
                              borderRadius: '8px',
                              padding: '10px 14px',
                              width: '100%',
                              gap: '12px'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: darkMode ? '#FBBF24' : '#92400E', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                <AlertTriangle size={18} color="#F59E0B" />
                                <span>انتهت نافذة الـ 24 ساعة للعميل. تم إغلاق الرسائل النصية العادية وفقاً لسياسات Meta الرسمية.</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowTemplateModal(true)}
                                style={{
                                  backgroundColor: '#F59E0B',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '6px 12px',
                                  fontSize: '0.8rem',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                <FileText size={14} />
                                <span>📋 إرسال قالب رسمي (Template)</span>
                              </button>
                            </div>
                          )}

                          {/* معاينة الصور المرفقة من الجهاز قبل الإرسال */}
                          {chatImageUrls.length > 0 && (
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '10px', 
                              backgroundColor: '#EFF6FF', 
                              padding: '10px 14px', 
                              borderRadius: '10px', 
                              border: '1px solid #BFDBFE',
                              width: '100%',
                              overflowX: 'auto'
                            }}>
                              <div style={{ fontSize: '0.8rem', color: '#1E40AF', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                🖼️ الصور المحددة ({chatImageUrls.length}):
                              </div>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {chatImageUrls.map((img, idx) => (
                                  <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                                    <img 
                                      src={img} 
                                      alt={`معاينة الصورة ${idx + 1}`} 
                                      style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #93C5FD' }} 
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveChatImage(idx)}
                                      style={{
                                        position: 'absolute',
                                        top: '-6px',
                                        right: '-6px',
                                        border: 'none',
                                        backgroundColor: '#EF4444',
                                        color: '#FFFFFF',
                                        borderRadius: '50%',
                                        width: '20px',
                                        height: '20px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                                      }}
                                      title="إلغاء هذه الصورة"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                            {/* مدخل مجهّز لاختيار الصور المباشرة من جهاز الكمبيوتر/الموبايل */}
                            <input
                              type="file"
                              ref={chatFileInputRef}
                              accept="image/*"
                              multiple
                              style={{ display: 'none' }}
                              onChange={handleChatImageFileChange}
                              disabled={!selectedConvWindowOpen}
                            />

                            <button
                              type="button"
                              onClick={() => chatFileInputRef.current?.click()}
                              disabled={!selectedConvWindowOpen}
                              style={{
                                border: '1px solid #CBD5E1',
                                backgroundColor: chatImageUrls.length > 0 ? '#EFF6FF' : '#FFFFFF',
                                color: !selectedConvWindowOpen ? '#94A3B8' : '#3B82F6',
                                borderRadius: '8px',
                                padding: '8px 14px',
                                fontSize: '0.85rem',
                                fontWeight: 'bold',
                                cursor: !selectedConvWindowOpen ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.2s',
                                whiteSpace: 'nowrap',
                                opacity: !selectedConvWindowOpen ? 0.6 : 1
                              }}
                              title="اختيار صورة أو عدة صور مباشرة من الجهاز"
                            >
                              <Upload size={18} />
                              <span>{chatImageUrls.length > 0 ? `صور مختارة (${chatImageUrls.length})` : 'رفع صور من الجهاز'}</span>
                            </button>

                            <input
                              id="chat-input-field"
                              type="text"
                              value={chatInput}
                              onChange={e => setChatInput(e.target.value)}
                              placeholder={selectedConvWindowOpen ? `اكتب رسالة للرد كـ (${currentUsername}) أو الصق صورة/نص (Ctrl+V)...` : 'إرسال الرسائل العادية معطل - يرجى اختيار قالب رسمي من الزر بالأعلى'}
                              disabled={!selectedConvWindowOpen}
                              style={{
                                ...styles.chatPaneInput,
                                backgroundColor: !selectedConvWindowOpen ? (darkMode ? '#1E293B' : '#F1F5F9') : styles.chatPaneInput.backgroundColor,
                                cursor: !selectedConvWindowOpen ? 'not-allowed' : 'text'
                              }}
                            />

                            <button
                              type="submit"
                              style={{
                                ...styles.chatPaneSendBtn,
                                backgroundColor: !selectedConvWindowOpen ? '#94A3B8' : '#0066FF',
                                cursor: (!selectedConvWindowOpen || (!chatInput.trim() && chatImageUrls.length === 0)) ? 'not-allowed' : 'pointer'
                              }}
                              disabled={!selectedConvWindowOpen || (!chatInput.trim() && chatImageUrls.length === 0)}
                            >
                              <Send size={18} color="#FFFFFF" style={{ transform: 'rotate(180deg)' }} />
                            </button>
                          </div>
                        </form>
                      </>
                    ) : (
                      <div style={styles.selectConversationPlaceholder}>
                        <MessageSquare size={48} color="#8E9FB8" style={{ marginBottom: '12px' }} />
                        <p>يرجى اختيار رقم محادثة من القائمة اليسرى لعرض الرسائل المتبادلة وتتبع الموظفين.</p>
                      </div>
                    )}
                  </div>
                </ChatErrorBoundary>
              </div>

              {/* مودال إرسال قوالب واتساب الرسمية عند انتهاء نافذة 24 ساعة */}
              {showTemplateModal && (
                <div style={styles.modalOverlay}>
                  <div className="glass-card" style={{ ...styles.modal, maxWidth: '650px', width: '90%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FileText size={22} color="#0066FF" />
                        <h3 style={{ margin: 0, fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--text-main)' }}>
                          إرسال قالب رسمي موثّق (WhatsApp Template)
                        </h3>
                      </div>
                      <button
                        onClick={() => { setShowTemplateModal(false); setTemplateError(null); setTemplateSuccess(null); }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                      >
                        <X size={20} />
                      </button>
                    </div>

                    <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.85rem', color: '#D97706', textAlign: 'right' }}>
                      <strong>⚠️ تنبيه نافذة التفاعل (24-Hour Session Window):</strong>
                      <p style={{ margin: '4px 0 0 0' }}>
                        وفقاً لسياسات Meta الرسمية، انقضت 24 ساعة منذ آخر رسالة أرسلها العميل ({selectedConversation?.customer_phone}). لا يمكن التواصل سوى عبر قالب موثق معتمد لإعادة فتح الجلسة.
                      </p>
                    </div>

                    {templateError && (
                      <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '8px', color: '#EF4444', fontSize: '0.9rem', marginBottom: '16px', textAlign: 'right' }}>
                        <AlertCircle size={20} color="#EF4444" style={{ marginLeft: 8 }} />
                        <span>{templateError}</span>
                      </div>
                    )}

                    {templateSuccess && (
                      <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '8px', color: '#10B981', fontSize: '0.9rem', marginBottom: '16px', textAlign: 'right' }}>
                        <CheckCircle size={20} color="#10B981" style={{ marginLeft: 8 }} />
                        <span>{templateSuccess}</span>
                      </div>
                    )}

                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ ...styles.formLabel, marginBottom: '8px', display: 'block' }}>اختر القالب المعتمد للإرسال:</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {AVAILABLE_TEMPLATES.map((tmpl) => (
                          <div
                            key={tmpl.name}
                            onClick={() => setSelectedTemplateName(tmpl.name)}
                            style={{
                              padding: '14px',
                              borderRadius: '10px',
                              border: selectedTemplateName === tmpl.name ? '2px solid #0066FF' : '1px solid var(--border-color)',
                              backgroundColor: selectedTemplateName === tmpl.name ? 'rgba(0, 102, 255, 0.06)' : 'var(--card-bg)',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: selectedTemplateName === tmpl.name ? '#0066FF' : 'var(--text-main)' }}>
                                {tmpl.title}
                              </span>
                              {selectedTemplateName === tmpl.name && <CheckCircle size={18} color="#0066FF" />}
                            </div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>{tmpl.description}</p>
                            <div style={{ backgroundColor: 'rgba(0,0,0,0.03)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-main)', fontStyle: 'italic', borderRight: '3px solid #0066FF' }}>
                              "{tmpl.preview}"
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                      <button
                        type="button"
                        onClick={() => { setShowTemplateModal(false); setTemplateError(null); setTemplateSuccess(null); }}
                        className="btn btn-secondary"
                        disabled={templateLoading}
                      >
                        إلغاء
                      </button>
                      <button
                        type="button"
                        onClick={handleSendTemplateMessage}
                        className="btn btn-primary"
                        disabled={templateLoading || !selectedTemplateName}
                      >
                        {templateLoading ? (
                          <span className="spinner" style={{ width: 16, height: 16 }}></span>
                        ) : (
                          <>
                            <Send size={16} style={{ transform: 'rotate(180deg)' }} />
                            <span>تأكيد وإرسال القالب الآن</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

              {/* مودال إضافة رد محفوظ جديد للأدمن */}
              {showAddReplyModal && (
                <div style={styles.modalOverlay}>
                  <div className="glass-card" style={{ ...styles.modal, maxWidth: '520px', width: '90%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Sparkles size={22} color="#0066FF" />
                        <h3 style={{ margin: 0, fontWeight: 'bold', fontSize: '1.15rem', color: 'var(--text-main)' }}>
                          إضافة رد جديد مخصص لقائمة الردود المحفوظة
                        </h3>
                      </div>
                      <button
                        onClick={() => setShowAddReplyModal(false)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                      >
                        <X size={20} />
                      </button>
                    </div>

                    <form onSubmit={handleAddQuickReply} style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'right' }}>
                      <div>
                        <label style={{ ...styles.formLabel, marginBottom: '6px', display: 'block' }}>عنوان الرد / الإيموجي الاختصاري:</label>
                        <input
                          type="text"
                          value={newReplyLabel}
                          onChange={(e) => setNewReplyLabel(e.target.value)}
                          placeholder="مثال: 🍕 عرض البيتزا"
                          required
                          style={styles.formInput}
                        />
                      </div>

                      <div>
                        <label style={{ ...styles.formLabel, marginBottom: '6px', display: 'block' }}>نص الرسالة الذي سيتم إرساله للعميل:</label>
                        <textarea
                          rows={4}
                          value={newReplyText}
                          onChange={(e) => setNewReplyText(e.target.value)}
                          placeholder="اكتب النص الكلي للرد هنا ليتم إدراجه بنقرة زر واحدة..."
                          required
                          style={{ ...styles.formInput, resize: 'vertical' }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                        <button
                          type="button"
                          onClick={() => setShowAddReplyModal(false)}
                          style={{
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'transparent',
                            color: 'var(--text-muted)',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontSize: '0.85rem',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                          }}
                        >
                          إلغاء
                        </button>

                        <button
                          type="submit"
                          style={{
                            border: 'none',
                            backgroundColor: '#0066FF',
                            color: '#FFFFFF',
                            borderRadius: '8px',
                            padding: '8px 20px',
                            fontSize: '0.85rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0, 102, 255, 0.3)'
                          }}
                        >
                          💾 حفظ الرد في القائمة
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

          {/* 6. التبويب السادس: الإعدادات (Settings) */}
          {activeTab === 'settings' && (
            <div className="animate-fade-in" style={styles.tabContent}>
              <h3 style={{ ...styles.cardTitle, marginBottom: '8px' }}>تكامل وإعدادات منصة Rivix</h3>
              <p style={{ color: '#5E6E85', fontSize: '0.9rem', marginBottom: '24px' }}>قم بإعداد وتعديل قنوات الاتصال بالواتساب وبيانات المطعم الخاصة بك.</p>
              
              <div className="glass-card" style={{ padding: '32px', maxWidth: '700px' }}>
                
                {/* شارة حالة الربط الجذابة */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '12px', backgroundColor: restaurant?.whatsapp_access_token ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)', border: restaurant?.whatsapp_access_token ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid rgba(245, 158, 11, 0.15)', marginBottom: '24px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: restaurant?.whatsapp_access_token ? '#10B981' : '#F59E0B' }}></div>
                  <div style={{ flex: 1, textAlign: 'right' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: restaurant?.whatsapp_access_token ? '#10B981' : '#D97706' }}>
                      {restaurant?.whatsapp_access_token ? 'حالة الربط: مفعّل بالرقم الخاص' : 'حالة الربط: وضع التطوير (الرقم التجريبي)'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#5E6E85', marginTop: '2px' }}>
                      {restaurant?.whatsapp_access_token ? 'يتواصل المساعد الذكي الآن مباشرة عبر رقم واتساب بيزنس الخاص بمطعمك.' : 'يتواصل المساعد حالياً عبر رقم تجريبي مشترك. قم بإدخال بياناتك بالأسفل للتفعيل.'}
                    </div>
                  </div>
                </div>

                {settingsSuccess && (
                  <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '8px', color: '#10B981', fontSize: '0.9rem', marginBottom: '20px', textAlign: 'right' }}>
                    <CheckCircle size={20} color="#10B981" style={{ marginLeft: 8 }} />
                    <span>{settingsSuccess}</span>
                  </div>
                )}

                {settingsError && (
                  <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '8px', color: '#EF4444', fontSize: '0.9rem', marginBottom: '20px', textAlign: 'right' }}>
                    <AlertCircle size={20} color="#EF4444" style={{ marginLeft: 8 }} />
                    <span>{settingsError}</span>
                  </div>
                )}

                <form onSubmit={handleSaveSettings}>
                  {/* قسم إضافة وتحديث صورة اللوجو للمطعم على واتساب */}
                  <div style={{ marginBottom: '24px', padding: '20px', borderRadius: '12px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ position: 'relative' }}>
                      <img 
                        src={settingsForm.logo_url || restaurant?.logo_url || localStorage.getItem('restaurant_logo') || '/logo.jpg'} 
                        alt="لوجو المطعم" 
                        style={{ width: '76px', height: '76px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #00D2FF', boxShadow: '0 0 16px rgba(0, 210, 255, 0.4)' }}
                      />
                    </div>
                    <div style={{ flex: 1, textAlign: 'right' }}>
                      <label style={{ ...styles.formLabel, fontSize: '0.9rem', color: 'var(--text-main)' }}>صورة لوجو المطعم (تظهر للعملاء على واتساب والمنصة)</label>
                      
                      <div style={{ marginTop: '8px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <input
                          type="file"
                          id="logo-file-upload"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                const newLogo = reader.result as string;
                                setSettingsForm({ ...settingsForm, logo_url: newLogo });
                                if (restaurant) {
                                  setRestaurant({ ...restaurant, logo_url: newLogo });
                                }
                                localStorage.setItem('restaurant_logo', newLogo);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                        <label
                          htmlFor="logo-file-upload"
                          className="btn btn-secondary"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            padding: '10px 16px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(0, 102, 255, 0.12)',
                            color: '#00D2FF',
                            border: '1px solid rgba(0, 210, 255, 0.3)',
                            fontWeight: '700',
                            fontSize: '0.85rem'
                          }}
                        >
                          <Upload size={18} />
                          <span>اختر لوجو المطعم من جهازك 📁</span>
                        </label>
                      </div>

                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
                        اختر أي صورة لوجو مخزنة على جهازك (كمبيوتر أو موبايل) ليتم اعتمادها فوراً لمطعمك!
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>اسم المطعم</label>
                      <input
                        type="text"
                        value={settingsForm.name}
                        onChange={e => setSettingsForm({ ...settingsForm, name: e.target.value })}
                        required
                        disabled={settingsLoading}
                        style={styles.formInput}
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>رقم هاتف المطعم العام</label>
                      <input
                        type="text"
                        value={settingsForm.phone_number}
                        onChange={e => setSettingsForm({ ...settingsForm, phone_number: e.target.value })}
                        required
                        disabled={settingsLoading}
                        style={styles.formInput}
                      />
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>معرّف الهاتف للواتساب (WhatsApp Phone Number ID)</label>
                    <input
                      type="text"
                      value={settingsForm.whatsapp_number_id}
                      onChange={e => setSettingsForm({ ...settingsForm, whatsapp_number_id: e.target.value })}
                      required
                      disabled={settingsLoading}
                      placeholder="أدخل معرّف الهاتف المكون من 15 رقماً"
                      style={styles.formInput}
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>رمز الوصول الدائم للواتساب (WhatsApp Access Token)</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type={showToken ? 'text' : 'password'}
                        value={settingsForm.whatsapp_access_token || ''}
                        onChange={e => setSettingsForm({ ...settingsForm, whatsapp_access_token: e.target.value })}
                        disabled={settingsLoading}
                        placeholder="أدخل الـ Permanent System User Access Token"
                        style={{ ...styles.formInput, paddingLeft: '50px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        style={{ position: 'absolute', left: '12px', background: 'none', border: 'none', color: '#5E6E85', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                      >
                        {showToken ? 'إخفاء' : 'إظهار'}
                      </button>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#5E6E85', marginTop: '6px', display: 'block' }}>
                      اترك هذا الحقل فارغاً للاستمرار في استخدام الرقم التجريبي المشترك.
                    </span>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>معرّف كتالوج واتساب للعلامة التجارية (Meta Commerce Catalog ID)</label>
                    <input
                      type="text"
                      value={settingsForm.catalog_id || ''}
                      onChange={e => setSettingsForm({ ...settingsForm, catalog_id: e.target.value })}
                      disabled={settingsLoading}
                      placeholder="أدخل معرّف الكتالوج (Catalog ID) الخاص بك من Meta Commerce Manager"
                      style={styles.formInput}
                    />
                    <span style={{ fontSize: '0.75rem', color: '#5E6E85', marginTop: '6px', display: 'block' }}>
                      عند إدخال معرف الكتالوج، سيتم رفع ومزامنة جميع أصناف المنيو تلقائياً مع كتالوج الواتساب الرسمي المباشر للعملاء! 🛍️
                    </span>
                  </div>

                  <div style={{ marginBottom: '20px', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '20px' }}>
                    <label style={styles.formLabel}>رابط الويب هوك لاستقبال الرسائل (Webhook Callback URL)</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        value={`${window.location.origin}/webhook`}
                        readOnly
                        style={{ ...styles.formInput, backgroundColor: '#E2E8F0', cursor: 'pointer', color: '#4A5568' }}
                        onClick={(e) => {
                          navigator.clipboard.writeText((e.target as HTMLInputElement).value);
                          alert('تم نسخ الرابط إلى الحافظة!');
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#5E6E85', marginTop: '6px', display: 'block' }}>
                      انقر على الرابط لنسخه. ضعه في إعدادات فيسبوك للمطورين لتوجيه رسائل واتساب الواردة إلى لوحتك.
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '30px' }}>
                    <button type="submit" className="btn btn-primary" disabled={settingsLoading} style={{ padding: '12px 28px' }}>
                      {settingsLoading ? (
                        <span className="spinner" style={{ width: 18, height: 18 }}></span>
                      ) : (
                        <span>حفظ التغييرات</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'users' && userRole === 'admin' && (
            <div className="animate-fade-in" style={styles.tabContent}>
              <h3 style={{ ...styles.cardTitle, marginBottom: '8px' }}>إدارة طاقم العمل والموظفين</h3>
              <p style={{ color: '#5E6E85', fontSize: '0.9rem', marginBottom: '24px' }}>
                قم بإنشاء حسابات جديدة للموظفين الذين يعملون معك وتحديد أدوارهم وصلاحياتهم لحماية البيانات.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', alignItems: 'start' }}>
                {/* نموذج إضافة مستخدم جديد */}
                <div className="glass-card" style={{ padding: '24px' }}>
                  <h4 style={{ fontWeight: 'bold', marginBottom: '16px', fontSize: '1rem' }}>إضافة موظف جديد</h4>
                  
                  {usersError && (
                    <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', padding: '10px', borderRadius: '8px', color: '#EF4444', fontSize: '0.8rem', marginBottom: '16px' }}>
                      {usersError}
                    </div>
                  )}
                  {usersSuccess && (
                    <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.15)', padding: '10px', borderRadius: '8px', color: '#10B981', fontSize: '0.8rem', marginBottom: '16px' }}>
                      {usersSuccess}
                    </div>
                  )}

                  <form onSubmit={handleCreateUser}>
                    <div style={{ ...styles.formGroup, marginBottom: '16px' }}>
                      <label style={styles.formLabel}>اسم المستخدم</label>
                      <input
                        type="text"
                        value={newUsername}
                        onChange={e => setNewUsername(e.target.value)}
                        placeholder="أدخل اسم مستخدم فريد (بالإنكليزية)"
                        required
                        style={styles.formInput}
                      />
                    </div>

                    <div style={{ ...styles.formGroup, marginBottom: '16px' }}>
                      <label style={styles.formLabel}>كلمة المرور</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="أدخل كلمة مرور قوية"
                        required
                        style={styles.formInput}
                      />
                    </div>

                    <div style={{ ...styles.formGroup, marginBottom: '24px' }}>
                      <label style={styles.formLabel}>دور وصلاحيات المستخدم</label>
                      <select
                        value={newRole}
                        onChange={e => setNewRole(e.target.value as 'admin' | 'staff')}
                        style={styles.formInput}
                      >
                        <option value="staff">موظف (مشاهدة ومراقبة فقط)</option>
                        <option value="admin">مسؤول (صلاحيات كاملة للمنيو واليوزرات)</option>
                      </select>
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px' }} disabled={usersLoading}>
                      {usersLoading ? 'جاري الحفظ...' : 'إضافة الموظف للنظام'}
                    </button>
                  </form>
                </div>

                {/* قائمة الموظفين الحاليين */}
                <div className="glass-card" style={{ padding: '24px' }}>
                  <h4 style={{ fontWeight: 'bold', marginBottom: '16px', fontSize: '1rem' }}>الحسابات المسجلة حالياً</h4>
                  
                  {usersList.length === 0 ? (
                    <p style={{ color: '#5E6E85', padding: '20px', textAlign: 'center' }}>جاري تحميل الموظفين...</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', color: '#5E6E85', fontSize: '0.8rem' }}>
                            <th style={{ padding: '12px 8px' }}>اسم المستخدم</th>
                            <th style={{ padding: '12px 8px' }}>الصلاحية</th>
                            <th style={{ padding: '12px 8px' }}>تاريخ الإنشاء</th>
                            <th style={{ padding: '12px 8px', textAlign: 'center' }}>العمليات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usersList.map(user => (
                            <tr key={user.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.02)', fontSize: '0.85rem' }}>
                              <td style={{ padding: '12px 8px', fontWeight: 'bold' }}>{user.username}</td>
                              <td style={{ padding: '12px 8px' }}>
                                <span className={`badge badge-${user.role === 'admin' ? 'active' : 'pending'}`}>
                                  {user.role === 'admin' ? 'مسؤول (Admin)' : 'موظف (Staff)'}
                                </span>
                              </td>
                              <td style={{ padding: '12px 8px', color: '#5E6E85' }}>
                                {new Date(user.created_at).toLocaleDateString('ar-EG')}
                              </td>
                              <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(user.id)}
                                  disabled={user.username === 'admin'}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: user.username === 'admin' ? '#CBD5E1' : '#EF4444',
                                    cursor: user.username === 'admin' ? 'not-allowed' : 'pointer',
                                    padding: '4px'
                                  }}
                                  title={user.username === 'admin' ? 'لا يمكن حذف حساب المسؤول الرئيسي' : 'حذف الحساب'}
                                >
                                  <Trash size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai-assistant' && userRole === 'admin' && (
            <div className="animate-fade-in" style={{ ...styles.tabContent, height: 'calc(100vh - 180px)', padding: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', height: '100%', gap: '24px', padding: '24px', alignItems: 'stretch' }}>
                
                {/* شات المساعد الذكي لإعداد البوت (يمين) */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
                  {/* رأس الشات */}
                  <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ fontWeight: 'bold', margin: 0, fontSize: '1rem' }}>دردشة الضبط والتوجيه المباشر</h4>
                      <span style={{ fontSize: '0.75rem', color: '#10B981' }}>تعديل وتحديث قواعد بوت واتساب بالذكاء الاصطناعي</span>
                    </div>
                  </div>

                  {/* جسم الشات */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '24px', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {configChatMessages.length === 0 ? (
                      <div style={{ display: 'flex', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#5E6E85', textAlign: 'center', padding: '20px', maxWidth: '500px', margin: 'auto' }}>
                        <Sparkles size={48} color="#0066FF" style={{ marginBottom: '16px' }} />
                        <h5 style={{ fontWeight: 'bold', marginBottom: '8px', color: '#0F1E36' }}>مرحباً بك في مساعد الإعداد الذكي!</h5>
                        <p style={{ fontSize: '0.85rem', lineHeight: '1.6' }}>
                          أنا هنا لمساعدتك في صياغة وتحديث قواعد البوت المساعد لزبائنك على واتساب. يمكنك إعطائي الأوامر بلغة طبيعية وسأقوم بتعديل القواعد لحظياً!
                        </p>
                        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', textAlign: 'right' }}>
                          <span style={{ fontSize: '0.8rem', backgroundColor: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                            💡 <strong>جرب أن تقول:</strong> "قول للناس إن عندنا عرض النهاردة: بيتزا عليها واحدة تانية مجاناً"
                          </span>
                          <span style={{ fontSize: '0.8rem', backgroundColor: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                            💡 <strong>أو:</strong> "لو حد سأل على الشاورما قوله للأسف خلصت اليوم"
                          </span>
                        </div>
                      </div>
                    ) : (
                      configChatMessages.map((msg, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            width: '100%',
                            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                          }}
                        >
                          <div
                            style={{
                              maxWidth: '75%',
                              padding: '12px 16px',
                              borderRadius: msg.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                              backgroundColor: msg.role === 'user' ? '#0066FF' : '#FFFFFF',
                              color: msg.role === 'user' ? '#FFFFFF' : '#0F1E36',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                              border: msg.role === 'user' ? 'none' : '1px solid rgba(0,0,0,0.05)'
                            }}
                          >
                            <p style={{ fontSize: '0.85rem', margin: 0, whiteSpace: 'pre-line', lineHeight: '1.5' }}>{msg.content}</p>
                            <span style={{ fontSize: '0.6rem', opacity: 0.7, marginTop: '4px', display: 'block', textAlign: msg.role === 'user' ? 'left' : 'right' }}>
                              {new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* شريط الإدخال */}
                  <form onSubmit={handleConfigChatSubmit} style={{ padding: '16px', borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      value={configChatInput}
                      onChange={e => setConfigChatInput(e.target.value)}
                      disabled={configLoading}
                      placeholder="اطلب من الذكاء الاصطناعي تعديل القواعد (مثال: أضف خصم 20% على البرجر اليوم)..."
                      style={{
                        flex: 1,
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0',
                        fontSize: '0.9rem',
                        outline: 'none'
                      }}
                    />
                    <button
                      type="submit"
                      disabled={configLoading || !configChatInput.trim()}
                      className="btn btn-primary"
                      style={{ padding: '0 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {configLoading ? (
                        <span className="spinner" style={{ width: 18, height: 18 }}></span>
                      ) : (
                        <Send size={18} color="#FFFFFF" style={{ transform: 'rotate(180deg)' }} />
                      )}
                    </button>
                  </form>
                </div>

                {/* القواعد والتعليمات النشطة حالياً (يسار) */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', padding: '24px' }}>
                  <h4 style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '1rem' }}>توجيهات البوت النشطة</h4>
                  <p style={{ color: '#5E6E85', fontSize: '0.75rem', marginBottom: '20px' }}>
                    هذه هي القواعد التي سيلتزم بها المساعد الذكي حالياً عند التحدث مع الزبائن على واتساب.
                  </p>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {isDirectEditing ? (
                      <>
                        <textarea
                          value={aiInstructions}
                          onChange={e => setAiInstructions(e.target.value)}
                          placeholder="اكتب التوجيهات والقواعد المخصصة هنا مباشرة..."
                          style={{
                            flex: 1,
                            width: '100%',
                            padding: '16px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            fontFamily: 'inherit',
                            fontSize: '0.85rem',
                            resize: 'none',
                            lineHeight: '1.6',
                            outline: 'none',
                            marginBottom: '16px'
                          }}
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={handleDirectInstructionsSave}
                            disabled={configLoading}
                            className="btn btn-primary"
                            style={{ flex: 1, padding: '10px' }}
                          >
                            {configLoading ? 'جاري الحفظ...' : 'حفظ'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsDirectEditing(false)}
                            className="btn btn-secondary"
                            style={{ flex: 1, padding: '10px', backgroundColor: '#E2E8F0', color: '#4A5568' }}
                          >
                            إلغاء
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          style={{
                            flex: 1,
                            backgroundColor: '#F8FAFC',
                            borderRadius: '8px',
                            padding: '16px',
                            border: '1px solid rgba(0,0,0,0.05)',
                            fontSize: '0.85rem',
                            overflowY: 'auto',
                            lineHeight: '1.6',
                            whiteSpace: 'pre-wrap',
                            color: aiInstructions ? '#0F1E36' : '#94A3B8',
                            marginBottom: '16px'
                          }}
                        >
                          {aiInstructions || 'لا توجد أي قواعد مضافة حالياً. يمكنك التحدث مع المساعد على اليمين لصياغة القواعد وحفظها تلقائياً.'}
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsDirectEditing(true)}
                          className="btn btn-secondary"
                          style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '1px dashed #0066FF', color: '#0066FF', backgroundColor: 'rgba(0,102,255,0.02)' }}
                        >
                          <Edit size={16} />
                          <span>تعديل القواعد كتابةً</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

const getDashboardStyles = (isDark: boolean): Record<string, React.CSSProperties> => {
  const bg = isDark ? '#060E1E' : '#F4F7FE';
  const cardBg = isDark ? '#0E1B33' : '#FFFFFF';
  const sidebarBg = isDark ? '#081427' : '#FFFFFF';
  const textMain = isDark ? '#FFFFFF' : '#0F1E36';
  const textMuted = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? 'rgba(0, 210, 255, 0.15)' : 'rgba(6, 18, 44, 0.08)';
  const inputBg = isDark ? '#060E1E' : '#F8FAFC';

  return {
    loadingContainer: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: bg,
      color: textMain,
    },
    errorContainer: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: bg,
      color: textMain,
      padding: '20px',
    },
    dashboardLayout: {
      display: 'flex',
      minHeight: '100vh',
      backgroundColor: bg,
      color: textMain,
    },
    sidebar: {
      width: '260px',
      backgroundColor: sidebarBg,
      color: textMain,
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 16px',
      borderLeft: `1px solid ${borderColor}`,
    },
    sidebarHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '40px',
    },
    logoCircle: {
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #0066FF 0%, #00D2FF 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#FFFFFF',
      fontWeight: '800',
    },
    sidebarTitle: {
      display: 'flex',
      flexDirection: 'column',
      textAlign: 'right',
    },
    sidebarNav: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      flex: 1,
    },
    navItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 16px',
      borderRadius: '8px',
      border: 'none',
      backgroundColor: 'transparent',
      color: textMuted,
      cursor: 'pointer',
      fontSize: '0.9rem',
      fontWeight: '600',
      textAlign: 'right',
      width: '100%',
      transition: 'all 0.2s',
    },
    navItemActive: {
      backgroundColor: 'rgba(0, 102, 255, 0.2)',
      color: isDark ? '#00D2FF' : '#0066FF',
      fontWeight: '700',
      borderRight: '4px solid #00D2FF',
    },
    sidebarFooter: {
      borderTop: `1px solid ${borderColor}`,
      paddingTop: '16px',
    },
    logoutButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 16px',
      borderRadius: '8px',
      border: 'none',
      backgroundColor: 'transparent',
      color: '#EF4444',
      cursor: 'pointer',
      width: '100%',
      textAlign: 'right',
      fontSize: '0.9rem',
      fontWeight: '700',
    },
    mainContent: {
      flex: 1,
      padding: '32px 40px',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      backgroundColor: bg,
      color: textMain,
    },
    topBar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '32px',
    },
    contentBody: {
      flex: 1,
    },
    tabContent: {
      width: '100%',
    },
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: '24px',
    },
    statCard: {
      padding: '24px',
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
      borderRadius: '16px',
      backgroundColor: cardBg,
      border: `1px solid ${borderColor}`,
      boxShadow: isDark ? '0 4px 20px rgba(0, 0, 0, 0.3)' : '0 4px 12px rgba(6, 18, 44, 0.03)',
    },
    statLabel: {
      fontSize: '0.85rem',
      color: textMuted,
      fontWeight: '600',
    },
    statVal: {
      fontSize: '1.85rem',
      fontWeight: '900',
      color: isDark ? '#00D2FF' : '#06122C',
      marginTop: '4px',
    },
    cardTitle: {
      fontSize: '1.2rem',
      fontWeight: '800',
      color: textMain,
    },
    recentList: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      marginTop: '16px',
    },
    listItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '14px',
      borderBottom: `1px solid ${borderColor}`,
      color: textMain,
    },
    menuTableContainer: {
      marginTop: '16px',
      borderRadius: '12px',
      overflow: 'hidden',
      border: `1px solid ${borderColor}`,
      backgroundColor: cardBg,
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      textAlign: 'right',
      color: textMain,
    },
    tableHeaderRow: {
      backgroundColor: isDark ? '#132647' : '#F8FAFC',
      borderBottom: `2px solid ${borderColor}`,
    },
    tableHeaderCell: {
      padding: '14px 18px',
      fontSize: '0.85rem',
      fontWeight: '700',
      color: textMuted,
    },
    tableRow: {
      borderBottom: `1px solid ${borderColor}`,
    },
    tableCell: {
      padding: '14px 18px',
      fontSize: '0.9rem',
      color: textMain,
    },
    actionIconButton: {
      border: 'none',
      backgroundColor: isDark ? 'rgba(0, 210, 255, 0.1)' : 'rgba(0, 102, 255, 0.08)',
      width: '34px',
      height: '34px',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      color: textMain,
    },
    modalOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    modal: {
      width: '100%',
      maxWidth: '520px',
      padding: '32px',
      backgroundColor: cardBg,
      color: textMain,
      borderRadius: '16px',
      border: `1px solid ${borderColor}`,
      boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
    },
    formGroup: {
      marginBottom: '16px',
      display: 'flex',
      flexDirection: 'column',
      textAlign: 'right',
    },
    formLabel: {
      fontSize: '0.85rem',
      fontWeight: '700',
      marginBottom: '6px',
      color: textMuted,
    },
    formInput: {
      padding: '12px',
      borderRadius: '8px',
      border: `1px solid ${borderColor}`,
      backgroundColor: inputBg,
      color: textMain,
      outline: 'none',
      fontSize: '0.9rem',
      textAlign: 'right',
    },
    orderCard: {
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      borderRadius: '16px',
      backgroundColor: cardBg,
      border: `1px solid ${borderColor}`,
      color: textMain,
    },
    orderCardHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    orderCardBody: {
      backgroundColor: inputBg,
      padding: '14px',
      borderRadius: '8px',
      color: textMain,
      border: `1px solid ${borderColor}`,
    },
    orderCardActions: {
      display: 'flex',
      gap: '12px',
    },
    cancelBtn: {
      padding: '10px 16px',
      borderRadius: '8px',
      border: '1px solid #EF4444',
      backgroundColor: 'transparent',
      color: '#EF4444',
      cursor: 'pointer',
      fontWeight: 'bold',
    },
    actionBtnConfirm: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      backgroundColor: '#10B981',
      color: '#FFFFFF',
      border: 'none',
      padding: '8px 14px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.85rem',
      fontWeight: '700',
    },
    actionBtnCancel: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      backgroundColor: '#EF4444',
      color: '#FFFFFF',
      border: 'none',
      padding: '8px 14px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.85rem',
      fontWeight: '700',
    },
    actionBtnComplete: {
      backgroundColor: '#0066FF',
      color: '#FFFFFF',
      border: 'none',
      padding: '8px 14px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.85rem',
      fontWeight: '700',
    },
    conversationsLayout: {
      display: 'grid',
      gridTemplateColumns: '300px 1fr',
      height: 'calc(100vh - 105px)',
      maxHeight: 'calc(100vh - 105px)',
      borderRadius: '16px',
      overflow: 'hidden',
      border: `1px solid ${borderColor}`,
      backgroundColor: cardBg,
      boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.45)' : '0 8px 32px rgba(0,0,0,0.06)',
    },
    conversationsListPane: {
      borderLeft: `1px solid ${borderColor}`,
      display: 'flex',
      flexDirection: 'column',
      textAlign: 'right',
      backgroundColor: isDark ? '#111B21' : '#F0F2F5',
      height: '100%',
      maxHeight: '100%',
      overflowY: 'auto',
    },
    conversationItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '14px 16px',
      borderBottom: `1px solid ${borderColor}`,
      cursor: 'pointer',
      transition: 'all 0.2s',
      color: textMain,
    },
    convAvatar: {
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      backgroundColor: 'rgba(0, 210, 255, 0.12)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chatPane: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      maxHeight: '100%',
      overflow: 'hidden',
      backgroundColor: isDark ? '#0B141A' : '#EFEAE2',
    },
    chatPaneHeader: {
      padding: '12px 18px',
      borderBottom: `1px solid ${borderColor}`,
      textAlign: 'right',
      backgroundColor: isDark ? '#202C33' : '#FFFFFF',
      color: textMain,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      zIndex: 2,
    },
    chatPaneBody: {
      flex: 1,
      padding: '24px 28px',
      overflowY: 'auto',
      minHeight: 0,
      maxHeight: '100%',
      backgroundColor: isDark ? '#0B141A' : '#EFEAE2',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      scrollbarWidth: 'thin',
      scrollbarColor: '#00A884 rgba(0,0,0,0.1)',
    },
    chatPaneMessageRow: {
      display: 'flex',
      width: '100%',
    },
    chatPaneBubble: {
      maxWidth: '78%',
      padding: '12px 18px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      lineHeight: '1.6',
    },
    chatPaneInputArea: {
      padding: '14px 18px',
      borderTop: `1px solid ${borderColor}`,
      display: 'flex',
      gap: '12px',
      backgroundColor: isDark ? '#202C33' : '#F0F2F5',
      alignItems: 'center',
    },
    chatPaneInput: {
      flex: 1,
      padding: '12px 16px',
      borderRadius: '24px',
      border: `1px solid ${borderColor}`,
      backgroundColor: inputBg,
      color: textMain,
      outline: 'none',
      textAlign: 'right',
      fontSize: '0.9rem',
    },
    chatPaneSendBtn: {
      width: '42px',
      height: '42px',
      borderRadius: '50%',
      border: 'none',
      backgroundColor: '#0066FF',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
    },
    selectConversationPlaceholder: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px',
      textAlign: 'center',
      color: textMuted,
    },
  };
};

export default Dashboard;
