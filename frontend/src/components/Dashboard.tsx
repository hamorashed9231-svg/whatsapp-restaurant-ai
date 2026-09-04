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
  Download
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
  updated_at: string;
}

const getStoredDeletedIds = (): string[] => {
  try {
    const raw = localStorage.getItem('rivix_deleted_menu_items');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const getStoredUserItems = (): MenuItem[] => {
  try {
    const raw = localStorage.getItem('rivix_menu_v3');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const saveMenuItemsToStorage = (items: MenuItem[]) => {
  try {
    localStorage.setItem('rivix_menu_v3', JSON.stringify(items));
  } catch (e) {}
};

const saveDeletedIdsToStorage = (ids: string[]) => {
  try {
    localStorage.setItem('rivix_deleted_menu_items', JSON.stringify(ids));
  } catch (e) {}
};

const syncMenuItemsWithStorage = (serverItems?: MenuItem[]): MenuItem[] => {
  const deletedIds = getStoredDeletedIds();
  const storedItems = getStoredUserItems();

  const validStored = storedItems.filter(item => !deletedIds.includes(item.id));

  if (serverItems && Array.isArray(serverItems) && serverItems.length > 0) {
    const validServer = serverItems.filter(item => !deletedIds.includes(item.id));
    const mergedMap = new Map<string, MenuItem>();

    validServer.forEach(item => mergedMap.set(item.id, item));
    validStored.forEach(item => mergedMap.set(item.id, item));

    const finalResult = Array.from(mergedMap.values()).filter(item => !deletedIds.includes(item.id));
    saveMenuItemsToStorage(finalResult);
    return finalResult;
  }

  saveMenuItemsToStorage(validStored);
  return validStored;
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  image_url?: string;
  sender_name?: string;
  timestamp?: string;
}

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
  const [orders, setOrders] = useState<Order[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatImageUrl, setChatImageUrl] = useState('');

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
    logo_url: '',
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  // تصدير قائمة الطعام (المنيو) كملف إكسيل Excel (.xlsx)
  const handleExportMenuExcel = () => {
    if (!menuItems || menuItems.length === 0) {
      alert('لا توجد عناصر في المنيو لتصديرها.');
      return;
    }

    try {
      const dataToExport = menuItems.map((item, index) => ({
        'م': index + 1,
        'اسم الصنف': item.name,
        'الوصف': item.description || '',
        'السعر (ج.م)': Number(item.price),
        'التصنيف': item.category,
        'حالة التوفر': item.is_available ? 'متوفر' : 'غير متوفر',
        'رابط الصورة': item.image_url || ''
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
      XLSX.utils.book_append_sheet(workbook, worksheet, 'قائمة الطعام');

      const restName = (restaurant?.name || 'مطعم_عم_عيسى').replace(/\s+/g, '_');
      const fileName = `منيو_${restName}_${new Date().toISOString().split('T')[0]}.xlsx`;

      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error('فشل تصدير ملف الإكسيل:', err);
      alert('حدث خطأ أثناء تصدير ملف الإكسيل.');
    }
  };

  const handleChatImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setChatImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
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
          logo_url: restData.logo_url || localStorage.getItem('restaurant_logo') || '',
        });

        // جلب بقية البيانات
        const actualRestId = resRest.data.id;
        const [resMenu, resOrders, resReserv, resConvers, resAiInst] = await Promise.all([
          api.get(`/restaurants/${actualRestId}/menu`),
          api.get(`/restaurants/${actualRestId}/orders`),
          api.get(`/restaurants/${actualRestId}/reservations`),
          api.get(`/restaurants/${actualRestId}/conversations`),
          api.get(`/restaurants/${actualRestId}/ai-instructions`)
        ]);

        // فحص وحفظ الأصناف بالذاكرة المحفوفة بالدمج الذكي ومنع عودة المحذوفات
        const syncedMenu = syncMenuItemsWithStorage(resMenu?.data);
        setMenuItems(syncedMenu);

        setOrders(resOrders.data);
        setReservations(resReserv.data);
        setConversations(resConvers.data);
        setAiInstructions(resAiInst.data.instructions || '');
      } catch (err: any) {
        console.error('خطأ أثناء جلب بيانات لوحة التحكم:', err);
        setError(err.response?.data?.message || 'عذراً، فشل الاتصال بالباك إند وقاعدة البيانات. تأكد من تشغيل المخدم وتهيئة قاعدة البيانات.');
      } finally {
        setLoading(false);
      }
    };

    fetchBaseData();
  }, [restaurantId, token]);

  // تحديث التبويب النشط أو تنشيط جلب بيانات إضافية
  const changeTab = async (tab: typeof activeTab) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
    if (!restaurant) return;
    try {
      if (tab === 'menu') {
        const res = await api.get(`/restaurants/${restaurant.id}/menu`);
        const syncedMenu = syncMenuItemsWithStorage(res?.data);
        setMenuItems(syncedMenu);
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
      const updated = {
        status: newStatus,
        assigned_to: newStatus === 'UNANSWERED' ? null : (newStatus === 'IN_PROGRESS' ? currentUsername : selectedConversation?.assigned_to || currentUsername),
        closed_by: newStatus === 'CLOSED' ? currentUsername : null,
        updated_at: new Date().toISOString()
      };
      setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, ...updated } : c));
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(prev => prev ? { ...prev, ...updated } : null);
      }
    }
  };

  // أرشفة أو إلغاء أرشفة المحادثة
  const handleToggleArchive = async (conversationId: string, is_archived: boolean) => {
    try {
      await api.put(`/conversations/${conversationId}/archive`, { is_archived });
      setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, is_archived } : c));
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(prev => prev ? { ...prev, is_archived } : null);
      }
    } catch (err: any) {
      console.error('Error toggling archive:', err);
      setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, is_archived } : c));
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(prev => prev ? { ...prev, is_archived } : null);
      }
    }
  };

  // دالة تحديد الألوان والبادجات للحالات الـ 3 (غير مردود، جاري الرد، مغلقة)
  const getStatusInfo = (conv: Conversation) => {
    const s = (conv.status || 'UNANSWERED').toUpperCase();
    if (s === 'CLOSED' || s === 'ARCHIVED') {
      return {
        label: conv.closed_by ? `✅ مغلقة بواسطة: ${conv.closed_by}` : '✅ مغلقة',
        shortLabel: 'مغلقة',
        color: '#475569',
        bgColor: '#F1F5F9',
        borderColor: '#64748B',
        badgeBg: '#64748B'
      };
    }
    if (s === 'IN_PROGRESS' || s === 'ACTIVE') {
      return {
        label: conv.assigned_to ? `🔵 جاري المتابعة: ${conv.assigned_to}` : '🔵 جاري المتابعة',
        shortLabel: 'جاري المتابعة',
        color: '#1E40AF',
        bgColor: '#EFF6FF',
        borderColor: '#3B82F6',
        badgeBg: '#2563EB'
      };
    }
    return {
      label: '🟠 لم يتم الرد عليه بعد',
      shortLabel: 'لم يتم الرد',
      color: '#B45309',
      bgColor: '#FFFBEB',
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
    setSelectedConversation(conversation);
    try {
      const res = await api.get(`/conversations/${conversation.id}/messages`);
      setChatMessages(res.data || []);
      // تمرير الشات لأسفل
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      console.error('فشل جلب رسائل المحادثة:', err);
    }
  };

  // إرسال رد يدوي أو صورة من لوحة التحكم وتسجيل اسم الموظف وتغيير الحالة لـ IN_PROGRESS
  const handleSendManualMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!chatInput.trim() && !chatImageUrl.trim()) || !selectedConversation || !restaurant) return;

    const textToSend = chatInput;
    const imgToSend = chatImageUrl;
    setChatInput('');
    setChatImageUrl('');
    if (chatFileInputRef.current) chatFileInputRef.current.value = '';

    const newMsg: ChatMessage = {
      role: 'assistant',
      content: textToSend,
      image_url: imgToSend || undefined,
      sender_name: currentUsername,
      timestamp: new Date().toISOString()
    };

    setChatMessages(prev => [...prev, newMsg]);

    try {
      await api.post(`/conversations/${selectedConversation.id}/messages`, { content: textToSend, image_url: imgToSend });
      const updatedData = {
        status: 'IN_PROGRESS',
        assigned_to: selectedConversation.assigned_to || currentUsername,
        updated_at: new Date().toISOString()
      };
      setConversations(prev => prev.map(c => c.id === selectedConversation.id ? { ...c, ...updatedData } : c));
      setSelectedConversation(prev => prev ? { ...prev, ...updatedData } : null);
    } catch (err) {
      console.error('خطأ إرسال رد يدوي:', err);
      const updatedData = {
        status: 'IN_PROGRESS',
        assigned_to: selectedConversation.assigned_to || currentUsername,
        updated_at: new Date().toISOString()
      };
      setConversations(prev => prev.map(c => c.id === selectedConversation.id ? { ...c, ...updatedData } : c));
      setSelectedConversation(prev => prev ? { ...prev, ...updatedData } : null);
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




    // 1. التحديث الفوري المباشر في الـ State والـ LocalStorage (لا ينتظر الـ API)
    setMenuItems(prev => {
      let nextList: MenuItem[];
      if (editingItem) {
        nextList = prev.map(m => m.id === editingItem.id ? fullItem : m);
      } else {
        nextList = [...prev.filter(m => m.id !== targetId), fullItem];
      }
      saveMenuItemsToStorage(nextList);
      return nextList;
    });

    setShowAddMenuModal(false);

    // 2. إرسال الطلب للباك إند وتحديث الـ ID إذا تم إرجاع عنصر معتمد من DB
    try {
      if (editingItem) {
        const res = await api.put(`/menu/${editingItem.id}`, dataPayload);
        if (res.data && res.data.item) {
          const serverItem = res.data.item;
          setMenuItems(prev => {
            const nextList = prev.map(m => m.id === editingItem.id ? serverItem : m);
            saveMenuItemsToStorage(nextList);
            return nextList;
          });
        }
      } else {
        const res = await api.post(`/restaurants/${restaurant.id}/menu`, dataPayload);
        if (res.data && res.data.item) {
          const serverItem = res.data.item;
          setMenuItems(prev => {
            const nextList = prev.map(m => (m.id === targetId || m.id === serverItem.id) ? serverItem : m);
            saveMenuItemsToStorage(nextList);
            return nextList;
          });
        }
      }
    } catch (err) {
      console.warn('تنبيه: الصنف محفوظ ومستمر محلياً بالذاكرة الدائمة للنظام');
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
      
      // تحديث قائمة الطعام من السيرفر ومزامنتها
      const resMenu = await api.get(`/restaurants/${restaurant.id}/menu`);
      const syncedMenu = syncMenuItemsWithStorage(resMenu?.data);
      setMenuItems(syncedMenu);

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

  const handleDeleteMenuItem = async (itemId: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذا الصنف من قائمة الطعام نهائياً؟')) return;

    // 1. تسجيل الـ ID في المحذوفات الدائمة لمنع عودته عند أي ريفريش أو جلب من السيرفر
    const currentDeleted = getStoredDeletedIds();
    if (!currentDeleted.includes(itemId)) {
      saveDeletedIdsToStorage([...currentDeleted, itemId]);
    }

    // 2. حذف فوري من الـ State والـ localStorage لمنع التعليق
    setMenuItems(prev => {
      const nextList = prev.filter(m => m.id !== itemId);
      saveMenuItemsToStorage(nextList);
      return nextList;
    });

    // 3. إبلاغ الباك إند بالحذف
    try {
      await api.delete(`/menu/${itemId}`);
    } catch (err) {
      console.warn('تم الحذف النهائي وتثبيته في الذاكرة الدائمة للنظام');
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
            <img src="/logo.jpg" alt="RIVIX SYSTEM" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(0, 210, 255, 0.4)' }} />
            <div style={styles.sidebarTitle}>
              <div style={{ fontWeight: '800', fontSize: '1.15rem', color: darkMode ? '#FFFFFF' : '#0F1E36' }}>Rivix System</div>
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

              {menuItems.length === 0 ? (
                <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
                  <Utensils size={48} color="#00D2FF" style={{ margin: '0 auto 16px auto' }} />
                  <p style={{ color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 'bold' }}>لا توجد أي أصناف في منيو المطعم حالياً.</p>
                  <button onClick={handleOpenAddModal} className="btn btn-primary" style={{ marginTop: '16px' }}>أضف أول صنف الآن</button>
                </div>
              ) : menuViewMode === 'grid' ? (
                /* عرض كروت المأكولات الفاخرة بالصور والأسعار (Cards Grid View) */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px', marginTop: '16px' }}>
                  {menuItems.map(item => (
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
                              onClick={() => handleDeleteMenuItem(item.id)} 
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
                              <Trash size={14} />
                              <span>حذف</span>
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
                      {menuItems.map(item => (
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
                              <button onClick={() => handleDeleteMenuItem(item.id)} style={styles.actionIconButton}>
                                <Trash size={16} color="#EF4444" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

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
                          <select
                            value={menuForm.category}
                            onChange={e => setMenuForm({ ...menuForm, category: e.target.value })}
                            style={styles.formInput}
                          >
                            <option value="وجبات رئيسية">وجبات رئيسية</option>
                            <option value="مقبلات">مقبلات</option>
                            <option value="مشروبات">مشروبات</option>
                            <option value="حلويات">حلويات</option>
                          </select>
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
                  <h4 style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.05)', fontWeight: 'bold', marginBottom: 0, fontSize: '0.95rem' }}>
                    دردشات خدمة العملاء 💬
                  </h4>
                  
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
                    .filter(c => viewArchived ? Boolean(c.is_archived) : !c.is_archived)
                    .filter(c => {
                      if (selectedCategoryFilter === 'ALL') return true;
                      if (selectedCategoryFilter === 'GROUP') {
                        return c.category === 'GROUP' || Boolean(c.is_group) || c.customer_phone.includes('g.us') || c.customer_phone.includes('جروب');
                      }
                      return c.category === selectedCategoryFilter;
                    })
                    .filter(c => {
                      const s = (c.status || 'UNANSWERED').toUpperCase();
                      if (selectedStatusFilter === 'UNANSWERED') return s === 'UNANSWERED';
                      if (selectedStatusFilter === 'IN_PROGRESS') return s === 'IN_PROGRESS' || s === 'ACTIVE';
                      if (selectedStatusFilter === 'CLOSED') return s === 'CLOSED' || s === 'ARCHIVED';
                      return true;
                    }).length === 0 ? (
                    <p style={{ color: '#5E6E85', padding: '20px', textAlign: 'center', fontSize: '0.85rem' }}>
                      {viewArchived ? 'لا توجد محادثات مؤرشفة حالياً.' : 'لا توجد محادثات نشطة تطابق التصفية.'}
                    </p>
                  ) : (
                    <div style={{ overflowY: 'auto', flex: 1, padding: '6px' }}>
                      {conversations
                        .filter(c => viewArchived ? Boolean(c.is_archived) : !c.is_archived)
                        .filter(c => {
                          if (selectedCategoryFilter === 'ALL') return true;
                          if (selectedCategoryFilter === 'GROUP') {
                            return c.category === 'GROUP' || Boolean(c.is_group) || c.customer_phone.includes('g.us') || c.customer_phone.includes('جروب');
                          }
                          return c.category === selectedCategoryFilter;
                        })
                        .filter(c => {
                          const s = (c.status || 'UNANSWERED').toUpperCase();
                          if (selectedStatusFilter === 'UNANSWERED') return s === 'UNANSWERED';
                          if (selectedStatusFilter === 'IN_PROGRESS') return s === 'IN_PROGRESS' || s === 'ACTIVE';
                          if (selectedStatusFilter === 'CLOSED') return s === 'CLOSED' || s === 'ARCHIVED';
                          return true;
                        })
                        .map(conv => {
                          const isGroupConv = conv.category === 'GROUP' || Boolean(conv.is_group) || conv.customer_phone.includes('g.us') || conv.customer_phone.includes('جروب');
                          const catColor = conv.category === 'ORDER' ? '#10B981' : conv.category === 'COMPLAINT' ? '#EF4444' : isGroupConv ? '#8B5CF6' : '#3B82F6';
                          const catLabel = conv.category === 'ORDER' ? 'طلب' : conv.category === 'COMPLAINT' ? 'شكوى' : isGroupConv ? '👥 مجموعة' : 'استفسار';
                          const statusInfo = getStatusInfo(conv);
                          const isSelected = selectedConversation?.id === conv.id;

                          return (
                            <div
                              key={conv.id}
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
                                    <div style={{ fontWeight: 'bold', fontSize: '0.82rem' }}>{conv.customer_phone}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                      <span style={{ fontSize: '0.65rem', color: catColor, fontWeight: 'bold', backgroundColor: `${catColor}10`, padding: '2px 6px', borderRadius: '4px' }}>
                                        {catLabel}
                                      </span>
                                      <span style={{ fontSize: '0.65rem', color: '#8E9FB8' }}>
                                        {new Date(conv.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* الشارات الملونة لهوية الموظف والحالة الـ 3 */}
                              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* واجهة الرسائل (يمين) */}
                <div style={styles.chatPane}>
                  {selectedConversation ? (
                    <>
                      {/* هيدر الدردشة مع التحكم بالحالة واسم الموظف وزر الأرشفة */}
                      <div style={{ ...styles.chatPaneHeader, padding: '12px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '10px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: darkMode ? '#FFFFFF' : '#0F1E36' }}>
                                {selectedConversation.category === 'GROUP' || Boolean(selectedConversation.is_group) || selectedConversation.customer_phone.includes('g.us')
                                  ? `👥 مجموعة: ${selectedConversation.customer_phone}`
                                  : `📱 رقم العميل: ${selectedConversation.customer_phone}`}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(selectedConversation.customer_phone);
                                  setCopySuccess(true);
                                  setTimeout(() => setCopySuccess(false), 2000);
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

                            {(selectedConversation.status || '').toUpperCase() !== 'CLOSED' && (
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
                                  cursor: 'pointer'
                                }}
                              >
                                🔄 إعادة فتح الدردشة
                              </button>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRight: '1px solid #E2E8F0', paddingRight: '10px' }}>
                              <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 'bold' }}>التصنيف:</span>
                              <select
                                value={selectedConversation.category || (selectedConversation.customer_phone.includes('g.us') ? 'GROUP' : 'INQUIRY')}
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
                        {chatMessages.length === 0 ? (
                          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#5E6E85' }}>
                            لا توجد رسائل مسجلة في المحادثة بعد.
                          </div>
                        ) : (
                          chatMessages.map((msg, i) => (
                            <div
                              key={i}
                              style={{
                                ...styles.chatPaneMessageRow,
                                justifyContent: msg.role === 'user' ? 'flex-start' : 'flex-end', // المستخدم لليسار والردود لليمين
                              }}
                            >
                              <div
                                style={{
                                  ...styles.chatPaneBubble,
                                  backgroundColor: msg.role === 'user' ? '#EBF3FF' : '#FFFFFF',
                                  border: msg.role === 'user' ? '1px solid #BFDBFE' : '1px solid #E2E8F0',
                                  borderRadius: msg.role === 'user' ? '12px 12px 12px 0px' : '12px 12px 0px 12px',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                }}
                              >
                                {msg.sender_name && msg.role !== 'user' && (
                                  <div style={{ fontSize: '0.65rem', color: '#0066FF', fontWeight: '800', marginBottom: '4px' }}>
                                    الرد بواسطة الموظف: {msg.sender_name}
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
                                {msg.content && <p style={{ fontSize: '0.85rem', color: '#0F172A', margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</p>}
                                <div style={{ fontSize: '0.6rem', color: '#94A3B8', marginTop: '4px', textAlign: 'left' }}>
                                  {new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                        <div ref={chatEndRef} />
                      </div>

                      <form onSubmit={handleSendManualMessage} style={{ ...styles.chatPaneInputArea, flexDirection: 'column', gap: '8px' }}>
                        {/* معاينة الصورة المرفقة من الجهاز قبل الإرسال */}
                        {chatImageUrl && (
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            backgroundColor: '#EFF6FF', 
                            padding: '8px 12px', 
                            borderRadius: '10px', 
                            border: '1px solid #BFDBFE',
                            width: '100%' 
                          }}>
                            <img 
                              src={chatImageUrl} 
                              alt="معاينة الصورة" 
                              style={{ width: '44px', height: '44px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #93C5FD' }} 
                            />
                            <div style={{ flex: 1, fontSize: '0.8rem', color: '#1E40AF', fontWeight: 'bold' }}>
                              🖼️ تم اختيار صورة من الجهاز للرفع والإرسال
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setChatImageUrl('');
                                if (chatFileInputRef.current) chatFileInputRef.current.value = '';
                              }}
                              style={{
                                border: 'none',
                                backgroundColor: '#EF4444',
                                color: '#FFFFFF',
                                borderRadius: '50%',
                                width: '26px',
                                height: '26px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer'
                              }}
                              title="إلغاء الصورة المرفقة"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                          {/* مدخل مجهّز لاختيار الصور المباشرة من جهاز الكمبيوتر/الموبايل */}
                          <input
                            type="file"
                            ref={chatFileInputRef}
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleChatImageFileChange}
                          />

                          <button
                            type="button"
                            onClick={() => chatFileInputRef.current?.click()}
                            style={{
                              border: '1px solid #CBD5E1',
                              backgroundColor: chatImageUrl ? '#EFF6FF' : '#FFFFFF',
                              color: '#3B82F6',
                              borderRadius: '8px',
                              padding: '8px 14px',
                              fontSize: '0.85rem',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'all 0.2s',
                              whiteSpace: 'nowrap'
                            }}
                            title="اختيار صورة مباشرة من الجهاز"
                          >
                            <Upload size={18} />
                            <span>رفع صورة من الجهاز</span>
                          </button>

                          <input
                            type="text"
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            placeholder={`اكتب رسالة للرد كـ (${currentUsername})...`}
                            style={styles.chatPaneInput}
                          />

                          <button type="submit" style={styles.chatPaneSendBtn} disabled={!chatInput.trim() && !chatImageUrl.trim()}>
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
      gridTemplateColumns: '1fr 2.5fr',
      height: '100%',
      borderRadius: '16px',
      overflow: 'hidden',
      border: `1px solid ${borderColor}`,
      backgroundColor: cardBg,
    },
    conversationsListPane: {
      borderLeft: `1px solid ${borderColor}`,
      display: 'flex',
      flexDirection: 'column',
      textAlign: 'right',
      backgroundColor: isDark ? '#081427' : '#F8FAFC',
    },
    conversationItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px',
      borderBottom: `1px solid ${borderColor}`,
      cursor: 'pointer',
      transition: 'all 0.2s',
      color: textMain,
    },
    convAvatar: {
      width: '34px',
      height: '34px',
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
      backgroundColor: cardBg,
    },
    chatPaneHeader: {
      padding: '16px',
      borderBottom: `1px solid ${borderColor}`,
      textAlign: 'right',
      backgroundColor: isDark ? '#081427' : '#F8FAFC',
      color: textMain,
    },
    chatPaneBody: {
      flex: 1,
      padding: '20px',
      overflowY: 'auto',
      backgroundColor: inputBg,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    },
    chatPaneMessageRow: {
      display: 'flex',
      width: '100%',
    },
    chatPaneBubble: {
      maxWidth: '75%',
      padding: '12px 16px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
    },
    chatPaneInputArea: {
      padding: '14px',
      borderTop: `1px solid ${borderColor}`,
      display: 'flex',
      gap: '10px',
      backgroundColor: isDark ? '#081427' : '#F8FAFC',
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
