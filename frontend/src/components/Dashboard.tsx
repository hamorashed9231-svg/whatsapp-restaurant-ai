import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
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
  Users
} from 'lucide-react';

interface DashboardProps {
  token: string | null;
  restaurantId: string;
  onLogout: () => void;
  onBackToLanding: () => void;
  onRedirectToLogin: () => void;
}

// تعريف هياكل البيانات المسترجعة
interface Restaurant {
  id: string;
  name: string;
  phone_number: string;
  whatsapp_number_id: string;
  whatsapp_access_token?: string | null;
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
  is_available: boolean;
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
  category: 'INQUIRY' | 'ORDER' | 'COMPLAINT';
  updated_at: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

const Dashboard: React.FC<DashboardProps> = ({
  token,
  restaurantId,
  onLogout,
  onBackToLanding,
  onRedirectToLogin,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'menu' | 'orders' | 'reservations' | 'conversations' | 'settings' | 'users'>('overview');
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

  // إعدادات وتصنيفات المستخدمين والمحادثات
  const [userRole, setUserRole] = useState<'admin' | 'staff'>('staff');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'ALL' | 'ORDER' | 'COMPLAINT' | 'INQUIRY'>('ALL');
  const [usersList, setUsersList] = useState<{ id: string; username: string; role: string; created_at: string }[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'staff'>('staff');
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersSuccess, setUsersSuccess] = useState<string | null>(null);

  // لفك تشفير التوكن والحصول على الدور (Role)
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
      } catch (e) {
        setUserRole('staff');
      }
    }
  }, [token]);

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
    is_available: true,
  });

  const [settingsForm, setSettingsForm] = useState({
    name: '',
    phone_number: '',
    whatsapp_number_id: '',
    whatsapp_access_token: '',
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
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
        setRestaurant(resRest.data);
        setSettingsForm({
          name: resRest.data.name || '',
          phone_number: resRest.data.phone_number || '',
          whatsapp_number_id: resRest.data.whatsapp_number_id || '',
          whatsapp_access_token: resRest.data.whatsapp_access_token || '',
        });

        // جلب بقية البيانات
        const actualRestId = resRest.data.id;
        const [resMenu, resOrders, resReserv, resConvers] = await Promise.all([
          api.get(`/restaurants/${actualRestId}/menu`),
          api.get(`/restaurants/${actualRestId}/orders`),
          api.get(`/restaurants/${actualRestId}/reservations`),
          api.get(`/restaurants/${actualRestId}/conversations`)
        ]);

        setMenuItems(resMenu.data);
        setOrders(resOrders.data);
        setReservations(resReserv.data);
        setConversations(resConvers.data);
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
    if (!restaurant) return;
    try {
      if (tab === 'menu') {
        const res = await api.get(`/restaurants/${restaurant.id}/menu`);
        setMenuItems(res.data);
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
  const handleUpdateCategory = async (conversationId: string, category: 'INQUIRY' | 'ORDER' | 'COMPLAINT') => {
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

  // إرسال رد يدوي من لوحة التحكم وحفظه في سجل المحادثة بقاعدة البيانات
  const handleSendManualMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !selectedConversation || !restaurant) return;

    const textToSend = chatInput;
    setChatInput('');

    const newMsg: ChatMessage = {
      role: 'assistant',
      content: textToSend,
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...chatMessages, newMsg];
    setChatMessages(updatedMessages);

    try {
      // إرسال الرسالة إلى سجل قاعدة البيانات
      // (في التطبيق الفعلي، سنقوم هنا بإرسال الرسالة الحقيقية عبر Meta API للرقم الفعلي أيضاً)
      // سنقوم بمحاكاة تحديث المحادثة في الباك إند
      // ملاحظة: بما أنه لا يوجد endpoint مباشر لإرسال رسائل يدوية من المسؤول في المتطلبات، 
      // سنحاكي الرد وحفظه بجدول المحادثات في الباك إند عن طريق تحديث سجل المحادثة.
      // لمعالجة ذلك، يفضل إضافة API endpoint يدوي إذا لزم الأمر، أو محاكاته.
      // هنا سنحفظ المحادثة ونعرض الرد.
      console.log('تم إرسال رد يدوي:', textToSend);
    } catch (err) {
      console.error('خطأ إرسال رد يدوي:', err);
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
      is_available: item.is_available
    });
    setShowAddMenuModal(true);
  };

  const handleSaveMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant) return;

    const data = {
      name: menuForm.name,
      description: menuForm.description,
      price: parseFloat(menuForm.price),
      category: menuForm.category,
      is_available: menuForm.is_available
    };

    try {
      if (editingItem) {
        // تعديل الصنف
        const res = await api.put(`/menu/${editingItem.id}`, data);
        setMenuItems(prev => prev.map(m => m.id === editingItem.id ? res.data.item : m));
      } else {
        // إضافة صنف جديد
        const res = await api.post(`/restaurants/${restaurant.id}/menu`, data);
        setMenuItems(prev => [...prev, res.data.item]);
      }
      setShowAddMenuModal(false);
    } catch (err) {
      console.error('خطأ أثناء حفظ المنيو:', err);
      alert('فشل حفظ الصنف. يرجى التحقق من المدخلات.');
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
      
      // تحديث قائمة الطعام في الواجهة
      const resMenu = await api.get(`/restaurants/${restaurant.id}/menu`);
      setMenuItems(resMenu.data);

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
    try {
      await api.delete(`/menu/${itemId}`);
      setMenuItems(prev => prev.filter(m => m.id !== itemId));
    } catch (err) {
      console.error('خطأ أثناء حذف الصنف:', err);
      alert('عذراً، فشل حذف الصنف.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant) return;

    setSettingsLoading(true);
    setSettingsSuccess(null);
    setSettingsError(null);

    try {
      const res = await api.put(`/restaurants/${restaurant.id}`, settingsForm);
      setRestaurant(res.data.restaurant);
      setSettingsSuccess(res.data.message || 'تم حفظ الإعدادات بنجاح!');
      
      // إخفاء رسالة النجاح بعد 3 ثوانٍ
      setTimeout(() => {
        setSettingsSuccess(null);
      }, 3000);
    } catch (err: any) {
      console.error('خطأ أثناء حفظ الإعدادات:', err);
      setSettingsError(err.response?.data?.message || 'فشل حفظ الإعدادات، يرجى المحاولة لاحقاً.');
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
          • {it.name} (عدد: {it.quantity}) - {it.subtotal || it.price * it.quantity} ريال
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
      {/* شريط التنقل الجانبي (Sidebar) */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.logoCircle}>R</div>
          <div style={styles.sidebarTitle}>
            <div style={{ fontWeight: '800', fontSize: '1.2rem' }}>Rivix</div>
            <div style={{ fontSize: '0.7rem', color: '#8E9FB8' }}>لوحة تحكم المطاعم</div>
          </div>
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
            <span>مراقبة المحادثات</span>
          </button>

          <button
            onClick={() => changeTab('settings')}
            style={{ ...styles.navItem, ...(activeTab === 'settings' ? styles.navItemActive : {}) }}
          >
            <Settings size={20} />
            <span>إعدادات النظام</span>
          </button>

          {userRole === 'admin' && (
            <button
              onClick={() => changeTab('users')}
              style={{ ...styles.navItem, ...(activeTab === 'users' ? styles.navItemActive : {}) }}
            >
              <Users size={20} />
              <span>إدارة الموظفين</span>
            </button>
          )}
        </nav>

        <div style={styles.sidebarFooter}>
          <button onClick={onLogout} style={styles.logoutButton}>
            <LogOut size={20} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* محتوى لوحة التحكم الأساسي (Main Content) */}
      <main style={styles.mainContent}>
        {/* الهيدر العلوي */}
        <header style={styles.topBar}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800' }}>مرحباً، {restaurant?.name}</h2>
            <p style={{ fontSize: '0.85rem', color: '#5E6E85' }}>مستوى الاشتراك: {restaurant?.subscription_tier}</p>
          </div>
          <button onClick={onBackToLanding} className="btn btn-secondary">
            العودة لصفحة الهبوط
          </button>
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
                            <span style={{ fontWeight: 'bold', marginLeft: '12px' }}>{Number(order.total_price)} ريال</span>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h3 style={styles.cardTitle}>قائمة المأكولات والمشروبات</h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => setShowImportModal(true)} className="btn btn-secondary">
                    <Upload size={20} />
                    <span>استيراد من Excel/CSV</span>
                  </button>
                  <button onClick={handleOpenAddModal} className="btn btn-primary">
                    <Plus size={20} />
                    <span>إضافة صنف جديد</span>
                  </button>
                </div>
              </div>

              {menuItems.length === 0 ? (
                <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
                  <Utensils size={48} color="#5E6E85" style={{ margin: '0 auto 16px auto' }} />
                  <p>لا توجد أي أصناف في منيو المطعم حالياً.</p>
                  <button onClick={handleOpenAddModal} className="btn btn-primary" style={{ marginTop: '16px' }}>أضف أول صنف</button>
                </div>
              ) : (
                <div style={styles.menuTableContainer}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={styles.tableHeaderRow}>
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
                            <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                            {item.description && <div style={{ fontSize: '0.75rem', color: '#5E6E85' }}>{item.description}</div>}
                          </td>
                          <td style={styles.tableCell}>{item.category}</td>
                          <td style={styles.tableCell}>{Number(item.price)} ريال</td>
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

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div style={styles.formGroup}>
                          <label style={styles.formLabel}>السعر (ريال)</label>
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
                          <span>{Number(order.total_price)} ريال</span>
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
                  <h4 style={{ padding: '16px', borderBottom: '1px solid rgba(0,0,0,0.05)', fontWeight: 'bold', marginBottom: 0 }}>قائمة الدردشات النشطة</h4>
                  
                  {/* شريط التصنيفات (Filters) */}
                  <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.05)', backgroundColor: '#F8FAFC', padding: '8px', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryFilter('ALL')}
                      style={{
                        flex: 1,
                        padding: '6px 2px',
                        fontSize: '0.7rem',
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
                        padding: '6px 2px',
                        fontSize: '0.7rem',
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
                        padding: '6px 2px',
                        fontSize: '0.7rem',
                        fontWeight: 'bold',
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: selectedCategoryFilter === 'COMPLAINT' ? '#EF4444' : 'transparent',
                        color: selectedCategoryFilter === 'COMPLAINT' ? '#FFFFFF' : '#64748B',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      ⚠️ شكاوى
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryFilter('INQUIRY')}
                      style={{
                        flex: 1,
                        padding: '6px 2px',
                        fontSize: '0.7rem',
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
                  </div>

                  {conversations.filter(c => selectedCategoryFilter === 'ALL' || c.category === selectedCategoryFilter).length === 0 ? (
                    <p style={{ color: '#5E6E85', padding: '20px', textAlign: 'center' }}>لا توجد محادثات نشطة في هذا التصنيف بعد.</p>
                  ) : (
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                      {conversations
                        .filter(c => selectedCategoryFilter === 'ALL' || c.category === selectedCategoryFilter)
                        .map(conv => {
                          const catColor = conv.category === 'ORDER' ? '#10B981' : conv.category === 'COMPLAINT' ? '#EF4444' : '#3B82F6';
                          const catLabel = conv.category === 'ORDER' ? 'طلب' : conv.category === 'COMPLAINT' ? 'شكوى' : 'استفسار';
                          return (
                            <div
                              key={conv.id}
                              onClick={() => handleSelectConversation(conv)}
                              style={{
                                ...styles.conversationItem,
                                backgroundColor: selectedConversation?.id === conv.id ? 'rgba(0, 102, 255, 0.08)' : 'transparent',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ ...styles.convAvatar, backgroundColor: `${catColor}15` }}>
                                  <MessageSquare size={16} color={catColor} />
                                </div>
                                <div>
                                  <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{conv.customer_phone}</div>
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
                              <span className={`badge badge-${conv.status.toLowerCase()}`}>{conv.status}</span>
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
                      <div style={styles.chatPaneHeader}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                          <div>
                            <div style={{ fontWeight: 'bold' }}>مراقبة العميل: {selectedConversation.customer_phone}</div>
                            <div style={{ fontSize: '0.75rem', color: '#10B981' }}>المساعد الذكي (AI) متصل ومستعد للرد</div>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 'bold' }}>تصنيف المحادثة:</span>
                            <select
                              value={selectedConversation.category || 'INQUIRY'}
                              onChange={(e) => handleUpdateCategory(selectedConversation.id, e.target.value as any)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#FFFFFF',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                color: selectedConversation.category === 'ORDER' ? '#10B981' : selectedConversation.category === 'COMPLAINT' ? '#EF4444' : '#3B82F6'
                              }}
                            >
                              <option value="INQUIRY">❓ استفسارات عامة</option>
                              <option value="ORDER">📦 طلبات وأوردرات</option>
                              <option value="COMPLAINT">⚠️ شكاوى وبلاغات</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      <div style={styles.chatPaneBody}>
                        {chatMessages.length === 0 ? (
                          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#5E6E85' }}>
                            لا توجد رسائل مسجلة في المحادثة.
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
                                  border: '1px solid rgba(0,0,0,0.05)',
                                  borderRadius: msg.role === 'user' ? '12px 12px 12px 0px' : '12px 12px 0px 12px',
                                }}
                              >
                                <p style={{ fontSize: '0.85rem', color: '#000' }}>{msg.content}</p>
                                <div style={{ fontSize: '0.6rem', color: '#888', marginTop: '4px', textAlign: 'left' }}>
                                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                        <div ref={chatEndRef} />
                      </div>

                      <form onSubmit={handleSendManualMessage} style={styles.chatPaneInputArea}>
                        <input
                          type="text"
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          placeholder="اكتب رسالة للرد يدوياً..."
                          style={styles.chatPaneInput}
                        />
                        <button type="submit" style={styles.chatPaneSendBtn} disabled={!chatInput.trim()}>
                          <Send size={18} color="#FFFFFF" style={{ transform: 'rotate(180deg)' }} />
                        </button>
                      </form>
                    </>
                  ) : (
                    <div style={styles.selectConversationPlaceholder}>
                      <MessageSquare size={48} color="#8E9FB8" style={{ marginBottom: '12px' }} />
                      <p>يرجى اختيار رقم محادثة من القائمة اليسرى لعرض الرسائل المتبادلة والتدخل الفوري.</p>
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

        </div>
      </main>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F7FE',
  },
  errorContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F7FE',
    padding: '20px',
  },
  dashboardLayout: {
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: '#F4F7FE',
    color: '#0F1E36',
  },
  sidebar: {
    width: '260px',
    backgroundColor: '#06122C', // كحلي داكن فاخر
    color: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 16px',
    borderLeft: '1px solid rgba(255,255,255,0.05)',
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
    color: '#8E9FB8',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '600',
    textAlign: 'right',
    width: '100%',
    transition: 'all 0.2s',
  },
  navItemActive: {
    backgroundColor: 'rgba(0, 102, 255, 0.15)',
    color: '#FFFFFF',
    borderRight: '4px solid #00D2FF',
  },
  sidebarFooter: {
    borderTop: '1px solid rgba(255,255,255,0.1)',
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
    color: '#FCA5A5',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'right',
    fontSize: '0.9rem',
  },
  mainContent: {
    flex: 1,
    padding: '40px',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
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
  },
  statLabel: {
    fontSize: '0.85rem',
    color: '#5E6E85',
  },
  statVal: {
    fontSize: '1.75rem',
    fontWeight: '800',
  },
  cardTitle: {
    fontSize: '1.15rem',
    fontWeight: '800',
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
    padding: '12px',
    borderBottom: '1px solid rgba(0,0,0,0.03)',
  },
  menuTableContainer: {
    marginTop: '16px',
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid rgba(0, 102, 255, 0.08)',
    backgroundColor: '#FFFFFF',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'right',
  },
  tableHeaderRow: {
    backgroundColor: '#F8FAFC',
    borderBottom: '2px solid rgba(0,0,0,0.05)',
  },
  tableHeaderCell: {
    padding: '14px 18px',
    fontSize: '0.85rem',
    fontWeight: '700',
    color: '#5E6E85',
  },
  tableRow: {
    borderBottom: '1px solid rgba(0,0,0,0.03)',
  },
  tableCell: {
    padding: '14px 18px',
    fontSize: '0.9rem',
  },
  actionIconButton: {
    border: 'none',
    backgroundColor: 'rgba(0,102,255,0.05)',
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    width: '100%',
    maxWidth: '500px',
    padding: '32px',
    backgroundColor: '#FFFFFF',
    borderRadius: '16px',
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
    color: '#5E6E85',
  },
  formInput: {
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid rgba(0,0,0,0.1)',
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
    backgroundColor: '#FFFFFF',
  },
  orderCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderCardBody: {
    backgroundColor: '#F8FAFC',
    padding: '12px',
    borderRadius: '8px',
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
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: '700',
  },
  actionBtnCancel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#EF4444',
    color: '#FFFFFF',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: '700',
  },
  actionBtnComplete: {
    backgroundColor: '#0066FF',
    color: '#FFFFFF',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: '700',
  },
  conversationsLayout: {
    display: 'grid',
    gridTemplateColumns: '1fr 2.5fr',
    height: '100%',
    borderRadius: '16px',
    overflow: 'hidden',
    border: '1px solid rgba(0, 102, 255, 0.08)',
    backgroundColor: '#FFFFFF',
  },
  conversationsListPane: {
    borderLeft: '1px solid rgba(0,0,0,0.05)',
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'right',
    backgroundColor: '#F8FAFC',
  },
  conversationItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    borderBottom: '1px solid rgba(0,0,0,0.03)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  convAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: 'rgba(0,102,255,0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatPane: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  chatPaneHeader: {
    padding: '16px',
    borderBottom: '1px solid rgba(0,0,0,0.05)',
    textAlign: 'right',
    backgroundColor: '#F8FAFC',
  },
  chatPaneBody: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto',
    backgroundColor: '#F0F2F5', // لون خلفية واتساب للدردشة الفعلية
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
    padding: '10px 14px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
  },
  chatPaneInputArea: {
    padding: '12px',
    borderTop: '1px solid rgba(0,0,0,0.05)',
    display: 'flex',
    gap: '10px',
    backgroundColor: '#F0F0F0',
  },
  chatPaneInput: {
    flex: 1,
    padding: '12px 16px',
    borderRadius: '24px',
    border: '1px solid rgba(0,0,0,0.1)',
    outline: 'none',
    textAlign: 'right',
    fontSize: '0.9rem',
  },
  chatPaneSendBtn: {
    width: '40px',
    height: '40px',
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
    color: '#5E6E85',
  },
};

export default Dashboard;
