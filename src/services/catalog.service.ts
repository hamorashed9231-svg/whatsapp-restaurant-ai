import axios from 'axios';
import { prisma } from './prisma.service';

const GRAPH_API_VERSION = 'v18.0';
const DEFAULT_PRODUCT_IMAGE = 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80';

/**
 * جلب بيانات المطعم مع التحقق من وجود catalog_id و whatsapp_access_token
 */
/**
 * جلب بيانات المطعم أو الفرع مع التحقق من وجود catalog_id و whatsapp_access_token
 */
async function getRestaurantCatalogCredentials(restaurantId: string, branchId?: string) {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId }
    });

    if (!restaurant) return null;

    let branch = null;
    if (branchId) {
      branch = await prisma.branch.findUnique({
        where: { id: branchId }
      });
    }

    const catalogId = branch?.catalog_id || (restaurant as any).catalog_id || process.env.META_CATALOG_ID;
    const token = restaurant.whatsapp_access_token || process.env.WHATSAPP_ACCESS_TOKEN;

    if (!catalogId || !token) {
      return null;
    }

    return { 
      catalogId, 
      token, 
      restaurantName: restaurant.name,
      branchName: branch?.name 
    };
  } catch (err) {
    console.error('[CatalogService] Error fetching restaurant/branch catalog credentials:', err);
    return null;
  }
}

/**
 * مزامنة صنف واحد مع كتالوج Meta Commerce Catalog تلقائياً (إضافة / تعديل)
 */
export async function syncMenuItemToMetaCatalog(restaurantId: string, item: any, branchId?: string): Promise<boolean> {
  const creds = await getRestaurantCatalogCredentials(restaurantId, branchId);
  if (!creds) {
    console.log(`[CatalogService] Meta Catalog ID or Token missing for restaurant ${restaurantId} (Branch: ${branchId || 'main'}). Sync skipped.`);
    return false;
  }

  const { catalogId, token, restaurantName } = creds;

  let finalPrice = Number(item.price || 0);
  let isAvailable = item.is_available !== false;

  if (branchId) {
    try {
      const branchPrice = await prisma.branchMenuItemPrice.findUnique({
        where: {
          branch_id_menu_item_id: {
            branch_id: branchId,
            menu_item_id: item.id
          }
        }
      });
      if (branchPrice) {
        finalPrice = Number(branchPrice.price);
        isAvailable = branchPrice.is_available;
      }
    } catch (e) {
      console.warn(`[CatalogService] Could not fetch branch price for item ${item.id} branch ${branchId}, fallback to default.`);
    }
  }

  const imageUrl = (item.image_url && item.image_url.startsWith('http')) 
    ? item.image_url 
    : DEFAULT_PRODUCT_IMAGE;

  const productData = {
    allow_upsert: true,
    requests: [
      {
        method: 'UPDATE',
        retailer_id: String(item.id),
        data: {
          name: item.name,
          description: item.description || item.name,
          availability: isAvailable ? 'in stock' : 'out of stock',
          condition: 'new',
          price: `${finalPrice} EGP`,
          currency: 'EGP',
          image_url: imageUrl,
          url: imageUrl,
          brand: restaurantName || 'مطعم'
        }
      }
    ]
  };

  try {
    const response = await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${catalogId}/batch`,
      productData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`[CatalogService] Successfully synced item "${item.name}" (ID: ${item.id}) to Meta Catalog ${catalogId}:`, response.data?.handles || response.status);
    
    // تحديث حالة المزامنة في قاعدة البيانات إلى SUCCESS
    await prisma.menuItem.update({
      where: { id: item.id },
      data: {
        last_meta_sync_status: 'SUCCESS',
        last_meta_sync_at: new Date(),
        last_meta_sync_error: null
      }
    }).catch(e => console.error(`[CatalogService] Failed updating SUCCESS status in DB for item ${item.id}:`, e));

    return true;
  } catch (err: any) {
    const errorMsg = err.response?.data?.error?.message || err.message || 'فشل الاتصال بـ Meta Catalog API';
    console.error(`[CatalogService] Failed to sync item ${item.id} to Meta Catalog:`, err.response?.data || err.message);
    
    // تحديث حالة المزامنة في قاعدة البيانات إلى FAILED مع حفظ رسالة الخطأ
    await prisma.menuItem.update({
      where: { id: item.id },
      data: {
        last_meta_sync_status: 'FAILED',
        last_meta_sync_at: new Date(),
        last_meta_sync_error: errorMsg
      }
    }).catch(e => console.error(`[CatalogService] Failed updating FAILED status in DB for item ${item.id}:`, e));

    return false;
  }
}

/**
 * حذف صنف من كتالوج Meta Commerce Catalog
 */
export async function deleteMenuItemFromMetaCatalog(restaurantId: string, itemId: string, branchId?: string): Promise<boolean> {
  const creds = await getRestaurantCatalogCredentials(restaurantId, branchId);
  if (!creds) return false;

  const { catalogId, token } = creds;

  const deletePayload = {
    requests: [
      {
        method: 'DELETE',
        retailer_id: String(itemId)
      }
    ]
  };

  try {
    await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${catalogId}/batch`,
      deletePayload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`[CatalogService] Successfully deleted item ID ${itemId} from Meta Catalog ${catalogId}`);
    return true;
  } catch (err: any) {
    console.error(`[CatalogService] Failed to delete item ID ${itemId} from Meta Catalog:`, err.response?.data || err.message);
    return false;
  }
}

/**
 * مزامنة قائمة الطعام الكاملة (المنيو) مع كتالوج Meta Commerce Catalog دفعة واحدة
 */
export async function syncFullMenuToMetaCatalog(restaurantId: string, branchId?: string, menuItems?: any[]): Promise<{ success: boolean; syncedCount: number; error?: string }> {
  const creds = await getRestaurantCatalogCredentials(restaurantId, branchId);
  if (!creds) {
    return { success: false, syncedCount: 0, error: 'لم يتم إدخال معرف الكتالوج (Catalog ID) أو التوكن الخاص بـ Meta في الإعدادات.' };
  }

  const { catalogId, token, restaurantName } = creds;

  let itemsToSync = menuItems;
  if (!itemsToSync || itemsToSync.length === 0) {
    try {
      itemsToSync = await prisma.menuItem.findMany({
        where: { restaurant_id: restaurantId }
      });
    } catch (e) {
      itemsToSync = [];
    }
  }

  if (!itemsToSync || itemsToSync.length === 0) {
    return { success: true, syncedCount: 0 };
  }

  let branchPricesMap: Record<string, { price: number; is_available: boolean }> = {};
  if (branchId) {
    try {
      const bPrices = await prisma.branchMenuItemPrice.findMany({
        where: { branch_id: branchId }
      });
      bPrices.forEach(bp => {
        branchPricesMap[bp.menu_item_id] = {
          price: Number(bp.price),
          is_available: bp.is_available
        };
      });
    } catch (e) {
      console.warn(`[CatalogService] Could not fetch branch prices map for branch ${branchId}`);
    }
  }

  const requests = itemsToSync.map(item => {
    const imageUrl = (item.image_url && item.image_url.startsWith('http')) 
      ? item.image_url 
      : DEFAULT_PRODUCT_IMAGE;

    const branchOverride = branchPricesMap[item.id];
    const finalPrice = branchOverride ? branchOverride.price : Number(item.price || 0);
    const isAvailable = branchOverride ? branchOverride.is_available : (item.is_available !== false);

    return {
      method: 'UPDATE',
      retailer_id: String(item.id),
      data: {
        name: item.name,
        description: item.description || item.name,
        availability: isAvailable ? 'in stock' : 'out of stock',
        condition: 'new',
        price: `${finalPrice} EGP`,
        currency: 'EGP',
        image_url: imageUrl,
        url: imageUrl,
        brand: restaurantName || 'مطعم'
      }
    };
  });

  const batchPayload = {
    allow_upsert: true,
    requests
  };

  try {
    const response = await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${catalogId}/batch`,
      batchPayload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`[CatalogService] Full menu batch sync completed for catalog ${catalogId}. Synced ${itemsToSync.length} items.`);

    const itemIds = itemsToSync.map(i => i.id);
    await prisma.menuItem.updateMany({
      where: { id: { in: itemIds } },
      data: {
        last_meta_sync_status: 'SUCCESS',
        last_meta_sync_at: new Date(),
        last_meta_sync_error: null
      }
    }).catch(e => console.error('[CatalogService] Failed updating batch SUCCESS status in DB:', e));

    return { success: true, syncedCount: itemsToSync.length };
  } catch (err: any) {
    const errorMsg = err.response?.data?.error?.message || err.message || 'فشل الاتصال بـ Meta Catalog API';
    console.error(`[CatalogService] Full menu batch sync failed for catalog ${catalogId}:`, err.response?.data || err.message);
    
    const itemIds = itemsToSync.map(i => i.id);
    await prisma.menuItem.updateMany({
      where: { id: { in: itemIds } },
      data: {
        last_meta_sync_status: 'FAILED',
        last_meta_sync_at: new Date(),
        last_meta_sync_error: errorMsg
      }
    }).catch(e => console.error('[CatalogService] Failed updating batch FAILED status in DB:', e));

    return { 
      success: false, 
      syncedCount: 0, 
      error: errorMsg 
    };
  }
}

/**
 * مزامنة جميع الفروع المفعلة الخاصة بالمطعم مع كتالوجاتها على Meta
 */
export async function syncAllBranchesCatalogs(restaurantId: string): Promise<{ branchId: string; branchName: string; success: boolean; syncedCount: number }[]> {
  const branches = await prisma.branch.findMany({
    where: { restaurant_id: restaurantId, is_active: true }
  });

  const results = [];
  for (const branch of branches) {
    const res = await syncFullMenuToMetaCatalog(restaurantId, branch.id);
    results.push({
      branchId: branch.id,
      branchName: branch.name,
      success: res.success,
      syncedCount: res.syncedCount
    });
  }
  return results;
}
