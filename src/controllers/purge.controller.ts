import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { put, del } from '@vercel/blob';

/**
 * Controller to purge closed conversations older than 48 hours.
 * 
 * Safety Guarantees:
 * 1. Default mode is 100% DRY RUN unless explicitly requested with dryRun=false AND PURGE_EXECUTION_ENABLED=true in env.
 * 2. Mandatory Backup Export: In execution mode, full candidate JSON backup is exported and uploaded to Vercel Blob FIRST.
 * 3. Safe Cascade Deletion: Orders -> Reservations -> MediaAssets & Blobs -> Messages -> Conversation.
 */
export async function purgeClosedConversations(req: Request, res: Response): Promise<void> {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = req.headers['authorization']?.replace('Bearer ', '') || (req.query.secret as string) || req.headers['x-cron-secret'];

    // Secret token validation if configured
    if (cronSecret && providedSecret !== cronSecret) {
      res.status(401).json({ success: false, error: 'Unauthorized cron trigger token' });
      return;
    }

    // Safety Lock #1: Default mode is strictly DRY RUN
    const dryRunRequested = req.query.dryRun;
    const executionEnvEnabled = process.env.PURGE_EXECUTION_ENABLED === 'true';

    // Must explicitly request dryRun=false AND have PURGE_EXECUTION_ENABLED=true to perform actual deletes
    let isDryRun = true;
    let safetyNotice = '';

    if (dryRunRequested === 'false') {
      if (executionEnvEnabled) {
        isDryRun = false;
      } else {
        isDryRun = true;
        safetyNotice = 'Execution mode (dryRun=false) requested, but environment variable PURGE_EXECUTION_ENABLED is not true. Falling back to DRY RUN for safety.';
        console.warn(`[PurgeJob ⚠️] ${safetyNotice}`);
      }
    }

    // Cutoff: Closed conversations older than 48 hours
    const cutoffHours = 48;
    const cutoffDate = new Date(Date.now() - cutoffHours * 60 * 60 * 1000);

    // 1. Fetch candidate conversations
    const candidates = await prisma.conversation.findMany({
      where: {
        status: 'CLOSED',
        updated_at: {
          lt: cutoffDate
        }
      },
      include: {
        messages: true
      }
    });

    console.log(`[PurgeJob] Mode: ${isDryRun ? 'DRY_RUN' : 'EXECUTION'} | Found ${candidates.length} candidate conversations older than ${cutoffHours}h (${cutoffDate.toISOString()})`);

    // 2. Gather associated Orders and Reservations for candidate phone numbers & restaurants
    const candidateData: any[] = [];
    let totalMessages = 0;
    let totalOrders = 0;
    let totalReservations = 0;
    let totalBlobs = 0;

    for (const conv of candidates) {
      const messages = conv.messages || [];
      totalMessages += messages.length;

      // Find orders for this customer phone & restaurant created before cutoff
      let orders: any[] = [];
      try {
        orders = await prisma.order.findMany({
          where: {
            restaurant_id: conv.restaurant_id,
            customer_phone: conv.customer_phone,
            created_at: { lt: cutoffDate }
          }
        });
      } catch (e) {}
      totalOrders += orders.length;

      // Find reservations for this customer phone & restaurant before cutoff
      let reservations: any[] = [];
      try {
        reservations = await prisma.reservation.findMany({
          where: {
            restaurant_id: conv.restaurant_id,
            customer_phone: conv.customer_phone,
            date_time: { lt: cutoffDate }
          }
        });
      } catch (e) {}
      totalReservations += reservations.length;

      // Collect Vercel Blob URLs & media_ids
      const blobUrls: string[] = [];
      const mediaIds: string[] = [];

      for (const msg of messages) {
        if (msg.media_id) mediaIds.push(msg.media_id);
        for (const url of [msg.image_url, msg.audio_url, msg.document_url]) {
          if (url && (url.includes('blob.vercel-storage.com') || url.startsWith('http'))) {
            blobUrls.push(url);
          }
        }
      }

      if (mediaIds.length > 0) {
        try {
          const mediaAssets = await prisma.mediaAsset.findMany({
            where: { media_id: { in: mediaIds } }
          });
          for (const asset of mediaAssets) {
            if (asset.permanent_url && asset.permanent_url.includes('blob.vercel-storage.com')) {
              if (!blobUrls.includes(asset.permanent_url)) {
                blobUrls.push(asset.permanent_url);
              }
            }
          }
        } catch (e) {}
      }

      totalBlobs += blobUrls.length;

      candidateData.push({
        conversation: conv,
        orders,
        reservations,
        media_ids: mediaIds,
        blob_urls: blobUrls
      });
    }

    let backupUrl: string | null = null;

    // Safety Lock #2: Mandatory Backup Export before any actual DELETE
    if (!isDryRun && candidates.length > 0) {
      try {
        const backupFileName = `purge-backups/purge-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const backupPayload = JSON.stringify({
          exported_at: new Date().toISOString(),
          cutoff_hours: cutoffHours,
          cutoff_date: cutoffDate.toISOString(),
          total_candidates: candidates.length,
          total_messages: totalMessages,
          total_orders: totalOrders,
          total_reservations: totalReservations,
          total_blobs: totalBlobs,
          data: candidateData
        }, null, 2);

        const uploadResult = await put(backupFileName, backupPayload, {
          access: 'public',
          contentType: 'application/json'
        });

        backupUrl = uploadResult.url;
        console.log(`[PurgeJob 🔒] Mandatory Backup Export successful! Saved to: ${backupUrl}`);
      } catch (backupErr: any) {
        console.error('[PurgeJob Fatal Error 🛑] Backup export failed! Aborting purge execution immediately:', backupErr.message || backupErr);
        res.status(500).json({
          success: false,
          error: `Backup Export Failed: ${backupErr.message || backupErr}. Purge aborted for safety.`
        });
        return;
      }
    }

    // 3. Execution or Dry Run Processing
    let processedCount = 0;
    let errorCount = 0;
    const purgeAuditLog: any[] = [];

    for (const item of candidateData) {
      const { conversation: conv, orders, reservations, media_ids, blob_urls } = item;

      if (isDryRun) {
        purgeAuditLog.push({
          conversation_id: conv.id,
          customer_phone: conv.customer_phone,
          restaurant_id: conv.restaurant_id,
          updated_at: conv.updated_at,
          messages_count: conv.messages?.length || 0,
          orders_count: orders.length,
          reservations_count: reservations.length,
          blobs_count: blob_urls.length,
          status: 'WOULD_PURGE'
        });
        processedCount++;
      } else {
        // Actual Execution Mode - Safe Cascade Deletion Order
        let itemSuccess = true;

        // 1. Delete Media Blobs from Vercel Blob Storage
        for (const url of blob_urls) {
          try {
            await del(url);
          } catch (e: any) {
            console.warn(`[PurgeJob] Failed to delete blob ${url}:`, e.message || e);
          }
        }

        // 2. Delete MediaAssets
        if (media_ids.length > 0) {
          try {
            await prisma.mediaAsset.deleteMany({
              where: { media_id: { in: media_ids } }
            });
          } catch (e: any) {
            console.error(`[PurgeJob Error] Failed to delete media assets for conv ${conv.id}:`, e.message || e);
          }
        }

        // 3. Delete Orders
        if (orders.length > 0) {
          try {
            const orderIds = orders.map((o: any) => o.id);
            await prisma.order.deleteMany({
              where: { id: { in: orderIds } }
            });
          } catch (e: any) {
            console.error(`[PurgeJob Error] Failed to delete orders for conv ${conv.id}:`, e.message || e);
          }
        }

        // 4. Delete Reservations
        if (reservations.length > 0) {
          try {
            const reservationIds = reservations.map((r: any) => r.id);
            await prisma.reservation.deleteMany({
              where: { id: { in: reservationIds } }
            });
          } catch (e: any) {
            console.error(`[PurgeJob Error] Failed to delete reservations for conv ${conv.id}:`, e.message || e);
          }
        }

        // 5. Delete Messages
        try {
          await prisma.message.deleteMany({
            where: { conversation_id: conv.id }
          });
        } catch (e: any) {
          console.error(`[PurgeJob Error] Failed to delete messages for conv ${conv.id}:`, e.message || e);
        }

        // 6. Delete Conversation
        try {
          await prisma.conversation.delete({
            where: { id: conv.id }
          });
        } catch (e: any) {
          itemSuccess = false;
          console.error(`[PurgeJob Error] Failed to delete conversation ${conv.id}:`, e.message || e);
        }

        if (itemSuccess) {
          processedCount++;
          purgeAuditLog.push({
            conversation_id: conv.id,
            customer_phone: conv.customer_phone,
            messages_deleted: conv.messages?.length || 0,
            orders_deleted: orders.length,
            reservations_deleted: reservations.length,
            blobs_deleted: blob_urls.length,
            status: 'PURGED'
          });
        } else {
          errorCount++;
          purgeAuditLog.push({
            conversation_id: conv.id,
            status: 'ERROR',
            error: 'Failed to delete conversation row'
          });
        }
      }
    }

    res.json({
      success: true,
      mode: isDryRun ? 'DRY_RUN' : 'EXECUTION',
      safetyNotice: safetyNotice || undefined,
      backupUrl: backupUrl || (isDryRun ? 'N/A (Dry Run Mode)' : null),
      cutoffHours,
      cutoffDate: cutoffDate.toISOString(),
      summary: {
        totalConversationsFound: candidates.length,
        totalMessagesFound: totalMessages,
        totalOrdersFound: totalOrders,
        totalReservationsFound: totalReservations,
        totalMediaBlobsFound: totalBlobs,
        processedCount,
        errorCount
      },
      details: purgeAuditLog
    });
  } catch (error: any) {
    console.error('[PurgeJob Fatal Error]:', error.message || error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error during purge execution' });
  }
}
