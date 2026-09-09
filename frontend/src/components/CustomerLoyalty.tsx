import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiUrl } from '../utils/api';
import {
  Users,
  UserCheck,
  UserPlus,
  Search,
  Calendar,
  Clock,
  MessageSquare,
  ShieldCheck,
  X,
  History,
  RotateCcw
} from 'lucide-react';

interface CustomerLoyaltyProps {
  token: string | null;
  restaurantId: string;
  darkMode?: boolean;
}

interface CustomerLog {
  id: string;
  customer_id: string;
  conversation_id: string;
  started_at: string;
  closed_at: string;
  is_purged: boolean;
  created_at: string;
}

interface CustomerItem {
  id: string;
  restaurant_id: string;
  customer_phone: string;
  total_conversations_count: number;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  conversation_logs?: CustomerLog[];
  _count?: {
    conversation_logs: number;
  };
}

interface DailyStats {
  date: string;
  stats: {
    new_customers_count: number;
    returning_customers_count: number;
    total_active_customers_today: number;
    active_conversations_count: number;
  };
}

export const CustomerLoyalty: React.FC<CustomerLoyaltyProps> = ({
  token,
  restaurantId,
  darkMode = true
}) => {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [totalCustomers, setTotalCustomers] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [statsLoading, setStatsLoading] = useState<boolean>(false);

  // حالة الشاشة الجانبية للتفاصيل والـ Timeline
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [timelineLogs, setTimelineLogs] = useState<CustomerLog[]>([]);
  const [timelineLoading, setTimelineLoading] = useState<boolean>(false);

  // إعداد Axios API instance مع Bearer token
  const getAuthHeaders = () => ({
    headers: {
      Authorization: token ? `Bearer ${token}` : ''
    }
  });

  // جلب قائمة العملاء
  const fetchCustomers = async (searchQuery = search) => {
    setLoading(true);
    try {
      const url = `${getApiUrl()}/restaurants/${restaurantId}/customers?search=${encodeURIComponent(searchQuery)}&limit=100`;
      const res = await axios.get(url, getAuthHeaders());
      if (res.data?.success || res.data?.status === 'success') {
        setCustomers(res.data.customers || []);
        setTotalCustomers(res.data.total || (res.data.customers || []).length);
      }
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  };

  // جلب الإحصائيات اليومية لليوم المختار
  const fetchDailyStats = async (dateStr = selectedDate) => {
    setStatsLoading(true);
    try {
      const url = `${getApiUrl()}/restaurants/${restaurantId}/customer-stats?date=${dateStr}`;
      const res = await axios.get(url, getAuthHeaders());
      if (res.data?.success || res.data?.status === 'success') {
        setDailyStats(res.data);
      }
    } catch (err) {
      console.error('Error fetching daily stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  // جلب الـ Timeline لعميل محدد
  const fetchCustomerTimeline = async (customer: CustomerItem) => {
    setSelectedCustomer(customer);
    setTimelineLoading(true);
    try {
      const url = `${getApiUrl()}/restaurants/${restaurantId}/customers/${customer.id}`;
      const res = await axios.get(url, getAuthHeaders());
      if (res.data?.success || res.data?.status === 'success') {
        const custData = res.data.customer;
        setTimelineLogs(custData?.conversation_logs || []);
      }
    } catch (err) {
      console.error('Error fetching timeline:', err);
      setTimelineLogs(customer.conversation_logs || []);
    } finally {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers('');
  }, [restaurantId]);

  useEffect(() => {
    fetchDailyStats(selectedDate);
  }, [restaurantId, selectedDate]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    fetchCustomers(val);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'غير محدد';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'غير محدد';
      return d.toLocaleString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateStr;
    }
  };

  const calcDuration = (startStr: string, endStr: string) => {
    try {
      const s = new Date(startStr).getTime();
      const e = new Date(endStr).getTime();
      const diffMs = e - s;
      if (isNaN(diffMs) || diffMs <= 0) return 'أقل من دقيقة';
      const mins = Math.round(diffMs / 60000);
      if (mins < 60) return `${mins} دقيقة`;
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hours} ساعة ${remMins > 0 ? `و ${remMins} دقيقة` : ''}`;
    } catch (e) {
      return 'غير محدد';
    }
  };

  const bgCard = darkMode ? '#1E293B' : '#FFFFFF';
  const textPrimary = darkMode ? '#F8FAFC' : '#0F172A';
  const textSecondary = darkMode ? '#94A3B8' : '#64748B';
  const borderColor = darkMode ? '#334155' : '#E2E8F0';

  return (
    <div style={{ padding: '24px', color: textPrimary }}>
      {/* 🟢 الهيدر والعنوان الرئيسي */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users color="#0066FF" size={28} />
            سجل العملاء والولاء (Customer Loyalty Log)
          </h1>
          <p style={{ color: textSecondary, fontSize: '0.9rem', marginTop: '4px' }}>
            سجل دائم لأرقام الهواتف والتفاعلات مع المطعم متوافق مع سياسة التطهير التلقائي بعد 48 ساعة
          </p>
        </div>

        {/* محدد التاريخ للإحصائيات اليومية */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: bgCard, padding: '8px 16px', borderRadius: '10px', border: `1px solid ${borderColor}` }}>
          <Calendar size={18} color="#0066FF" />
          <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>تاريخ الإحصائية:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              backgroundColor: 'transparent',
              color: textPrimary,
              border: 'none',
              outline: 'none',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          />
        </div>
      </div>

      {/* 📊 بطاقات الملخص والإحصائيات اليومية */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {/* بطاقة عملاء جدد */}
        <div style={{ backgroundColor: bgCard, padding: '20px', borderRadius: '14px', border: `1px solid ${borderColor}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ color: textSecondary, fontSize: '0.85rem', fontWeight: 'bold' }}>🟢 عملاء جدد اليوم</span>
            <div style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)', padding: '8px', borderRadius: '10px' }}>
              <UserPlus color="#22C55E" size={20} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#22C55E' }}>
            {statsLoading ? '...' : (dailyStats?.stats?.new_customers_count ?? 0)}
          </div>
          <div style={{ fontSize: '0.75rem', color: textSecondary, marginTop: '4px' }}>
            أول تواصل لهم مع المطعم في {selectedDate}
          </div>
        </div>

        {/* بطاقة عملاء قدامى رجعوا */}
        <div style={{ backgroundColor: bgCard, padding: '20px', borderRadius: '14px', border: `1px solid ${borderColor}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ color: textSecondary, fontSize: '0.85rem', fontWeight: 'bold' }}>🔵 عملاء قدامى رجعوا</span>
            <div style={{ backgroundColor: 'rgba(0, 102, 255, 0.15)', padding: '8px', borderRadius: '10px' }}>
              <RotateCcw color="#0066FF" size={20} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0066FF' }}>
            {statsLoading ? '...' : (dailyStats?.stats?.returning_customers_count ?? 0)}
          </div>
          <div style={{ fontSize: '0.75rem', color: textSecondary, marginTop: '4px' }}>
            عملاء سابقون تواصلوا مجدداً في {selectedDate}
          </div>
        </div>

        {/* بطاقة إجمالي العملاء */}
        <div style={{ backgroundColor: bgCard, padding: '20px', borderRadius: '14px', border: `1px solid ${borderColor}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ color: textSecondary, fontSize: '0.85rem', fontWeight: 'bold' }}>⭐ إجمالي سجل العملاء الدائم</span>
            <div style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)', padding: '8px', borderRadius: '10px' }}>
              <UserCheck color="#A855F7" size={20} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#A855F7' }}>
            {totalCustomers}
          </div>
          <div style={{ fontSize: '0.75rem', color: textSecondary, marginTop: '4px' }}>
            إجمالي الهواتف المسجلة في السجل الدائم
          </div>
        </div>
      </div>

      {/* 🔍 شريط البحث في العملاء */}
      <div style={{ backgroundColor: bgCard, padding: '16px', borderRadius: '14px', border: `1px solid ${borderColor}`, marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: darkMode ? '#0F172A' : '#F1F5F9', padding: '10px 14px', borderRadius: '10px' }}>
          <Search size={20} color={textSecondary} />
          <input
            type="text"
            placeholder="ابحث برقم الهاتف (مثال: 01000000000)..."
            value={search}
            onChange={handleSearchChange}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: textPrimary,
              width: '100%',
              fontSize: '0.9rem'
            }}
          />
          {search && (
            <button
              onClick={() => { setSearch(''); fetchCustomers(''); }}
              style={{ background: 'none', border: 'none', color: textSecondary, cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* 📋 جدول العملاء */}
      <div style={{ backgroundColor: bgCard, borderRadius: '14px', border: `1px solid ${borderColor}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
          <thead>
            <tr style={{ backgroundColor: darkMode ? '#0F172A' : '#F8FAFC', borderBottom: `1px solid ${borderColor}`, color: textSecondary, fontSize: '0.85rem' }}>
              <th style={{ padding: '14px 16px' }}>رقم هاتف العميل</th>
              <th style={{ padding: '14px 16px' }}>عدد المحادثات والتفاعلات</th>
              <th style={{ padding: '14px 16px' }}>أول تواصل</th>
              <th style={{ padding: '14px 16px' }}>آخر تواصل</th>
              <th style={{ padding: '14px 16px', textAlign: 'center' }}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: textSecondary }}>
                  جاري تحميل سجل العملاء... ⏳
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: textSecondary }}>
                  لم يتم العثور على أي عميل ينطبق عليه البحث.
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${borderColor}`, fontSize: '0.9rem' }}>
                  <td style={{ padding: '14px 16px', fontWeight: 'bold', color: '#0066FF', direction: 'ltr', textAlign: 'right' }}>
                    {c.customer_phone}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ backgroundColor: 'rgba(0, 102, 255, 0.1)', color: '#0066FF', padding: '4px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '0.85rem' }}>
                      💬 {c.total_conversations_count} محادثة
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', color: textSecondary, fontSize: '0.85rem' }}>
                    {formatDate(c.first_seen_at || c.created_at)}
                  </td>
                  <td style={{ padding: '14px 16px', color: textSecondary, fontSize: '0.85rem' }}>
                    {formatDate(c.last_seen_at || c.updated_at)}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <button
                      onClick={() => fetchCustomerTimeline(c)}
                      style={{
                        backgroundColor: '#0066FF',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <History size={15} />
                      عرض الـ Timeline
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 🖼️ النافذة الجانبية / الموديل لـ Timeline العميل */}
      {selectedCustomer && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '520px',
            backgroundColor: bgCard,
            height: '100%',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* الهيدر */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: `1px solid ${borderColor}`, paddingBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: textPrimary, direction: 'ltr', textAlign: 'right' }}>
                  {selectedCustomer.customer_phone}
                </h3>
                <span style={{ fontSize: '0.8rem', color: textSecondary }}>
                  سجل التفاعلات والـ Timeline الكامل
                </span>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                style={{ background: 'none', border: 'none', color: textSecondary, cursor: 'pointer' }}
              >
                <X size={24} />
              </button>
            </div>

            {/* ملاحظة الأمان والخصوصية */}
            <div style={{ backgroundColor: 'rgba(0, 102, 255, 0.08)', border: '1px solid rgba(0, 102, 255, 0.2)', padding: '12px 14px', borderRadius: '10px', marginBottom: '20px', fontSize: '0.8rem', color: textPrimary, lineHeight: '1.5', display: 'flex', gap: '10px' }}>
              <ShieldCheck size={24} color="#0066FF" style={{ flexShrink: 0 }} />
              <div>
                <strong>سياسة حماية الخصوصية:</strong> يتم تطهير نصوص الرسائل والوسائط تلقائياً بعد 48 ساعة من إغلاق المحادثة. السجل أدناه يحفظ التواريخ الدائمة لبداية ونهاية كل تواصل.
              </div>
            </div>

            {/* تفاصيل سريعة */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div style={{ backgroundColor: darkMode ? '#0F172A' : '#F8FAFC', padding: '12px', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: textSecondary }}>إجمالي المحادثات:</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#0066FF', marginTop: '2px' }}>
                  {selectedCustomer.total_conversations_count} محادثة
                </div>
              </div>
              <div style={{ backgroundColor: darkMode ? '#0F172A' : '#F8FAFC', padding: '12px', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: textSecondary }}>أول تواصل:</span>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '2px' }}>
                  {formatDate(selectedCustomer.first_seen_at)}
                </div>
              </div>
            </div>

            {/* قائمة الـ Timeline */}
            <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={16} color="#0066FF" />
              الـ Timeline الزمني للمحادثات ({timelineLogs.length})
            </h4>

            <div style={{ flex: 1 }}>
              {timelineLoading ? (
                <div style={{ padding: '30px', textAlign: 'center', color: textSecondary }}>جاري تحميل الـ Timeline...</div>
              ) : timelineLogs.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: textSecondary }}>
                  لا توجد سجلات محادثات أفقية مؤرشفة حتى الآن لهذا العميل.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {timelineLogs.map((log, idx) => (
                    <div
                      key={log.id || idx}
                      style={{
                        backgroundColor: darkMode ? '#0F172A' : '#F8FAFC',
                        borderRadius: '10px',
                        padding: '14px',
                        borderRight: '4px solid #0066FF',
                        borderTop: `1px solid ${borderColor}`,
                        borderLeft: `1px solid ${borderColor}`,
                        borderBottom: `1px solid ${borderColor}`
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: textSecondary, fontFamily: 'monospace' }}>
                          ID: #{log.conversation_id ? log.conversation_id.substring(0, 8) : 'N/A'}
                        </span>
                        {log.is_purged ? (
                          <span style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
                            🔒 مطهر ومؤرشف (48h)
                          </span>
                        ) : (
                          <span style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22C55E', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
                            ✅ محادثة مغلقة
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.85rem', marginBottom: '4px' }}>
                        📅 <strong>بدء المحادثة:</strong> {formatDate(log.started_at)}
                      </div>
                      <div style={{ fontSize: '0.85rem', marginBottom: '6px' }}>
                        🏁 <strong>إغلاق المحادثة:</strong> {formatDate(log.closed_at)}
                      </div>

                      <div style={{ fontSize: '0.75rem', color: textSecondary, borderTop: `1px dashed ${borderColor}`, paddingTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>⏱️ المدة المستغرقة: {calcDuration(log.started_at, log.closed_at)}</span>
                        <span>تم التوثيق: {formatDate(log.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
