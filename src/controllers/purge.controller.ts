import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { del } from '@vercel/blob';

/**
 * Controller to purge closed conversations older than 48 hours.
 * Supports Dry Run Mode (?dryRun=true or default) to safely preview candidates.
 * Secured via CRON_SECRET token or header.
 */
export async function purgeClosedConversations(req: Request, res: Response): Promise<void> {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = req.headers['authorization']?.replace('Bearer ', '') || (req.query.secret as string) || req.headers['x-cron-secret'];

    // Verification of authorization secret if CRON_SECRET is configured
    if (cronSecret && providedSecret !== cronSecret) {
      res.status(401).json({ success: false, error: 'Unauthorized cron trigger token' });
      return;
    }

    // Dry run mode defaults to true unless explicitly set to false
    const isDryRun = req.query.dryRun !== 'false' && req.headers['x-dry-run'] !== 'false';

    // Cutoff time: 48 hours ago
    const cutoffHours = 48;
    const cutoffDate = new Date(Date.now() - cutoffHours * 60 * 60 * 1000);

    // 1. Fetch candidate closed conversations older than 48h
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

    console.log(`[PurgeJob] Mode: ${isDryRun ? 'DRY_RUN' : 'EXECUTION'} | Found ${candidates.length} candidates older than ${cutoffHours}h (${cutoffDate.toISOString()})`);

    let processedCount = 0;
    let errorCount = 0;
    let totalMessagesCount = 0;
    let totalMediaBlobsCount = 0;
    const purgeAuditLog: any[] = [];

    for (const conv of candidates) {
      try {
        const messages = conv.messages || [];
        totalMessagesCount += messages.length;

        // Collect Vercel Blob URLs & media IDs associated with conversation
        const blobUrlsToDelete: string[] = [];
        const mediaIds: string[] = [];

        for (const msg of messages) {
          if (msg.media_id) mediaIds.push(msg.media_id);
          for (const url of [msg.image_url, msg.audio_url, msg.document_url]) {
            if (url && (url.includes('blob.vercel-storage.com') || url.startsWith('http'))) {
              blobUrlsToDelete.push(url);
            }
          }
        }

        // Also query MediaAsset table for these media_ids if any
        if (mediaIds.length > 0) {
          const mediaAssets = await prisma.mediaAsset.findMany({
            where: { media_id: { in: mediaIds } }
          });
          for (const asset of mediaAssets) {
            if (asset.permanent_url && asset.permanent_url.includes('blob.vercel-storage.com')) {
              if (!blobUrlsToDelete.includes(asset.permanent_url)) {
                blobUrlsToDelete.push(asset.permanent_url);
              }
            }
          }
        }

        totalMediaBlobsCount += blobUrlsToDelete.length;

        if (isDryRun) {
          // Log candidate details without making any mutations
          purgeAuditLog.push({
            conversation_id: conv.id,
            customer_phone: conv.customer_phone,
            updated_at: conv.updated_at,
            message_count: messages.length,
            blob_urls_count: blobUrlsToDelete.length,
            status: 'WOULD_PURGE'
          });
          processedCount++;
        } else {
          // Actual Execution Mode: Delete Blob files first
          for (const blobUrl of blobUrlsToDelete) {
            try {
              await del(blobUrl);
            } catch (blobErr: any) {
              console.warn(`[PurgeJob] Failed to delete blob ${blobUrl}:`, blobErr.message || blobErr);
            }
          }

          // Delete associated MediaAssets
          if (mediaIds.length > 0) {
            await prisma.mediaAsset.deleteMany({
              where: { media_id: { in: mediaIds } }
            }).catch(() => {});
          }

          // Delete associated Messages
          await prisma.message.deleteMany({
            where: { conversation_id: conv.id }
          }).catch(() => {});

          // Delete Conversation
          await prisma.conversation.delete({
            where: { id: conv.id }
          });

          purgeAuditLog.push({
            conversation_id: conv.id,
            customer_phone: conv.customer_phone,
            messages_deleted: messages.length,
            blobs_deleted: blobUrlsToDelete.length,
            status: 'PURGED'
          });
          processedCount++;
        }
      } catch (convErr: any) {
        errorCount++;
        console.error(`[PurgeJob Error] Failed to purge conversation ${conv.id}:`, convErr.message || convErr);
        purgeAuditLog.push({
          conversation_id: conv.id,
          status: 'ERROR',
          error: convErr.message || String(convErr)
        });
      }
    }

    res.json({
      success: true,
      mode: isDryRun ? 'DRY_RUN' : 'EXECUTION',
      cutoffHours,
      cutoffDate: cutoffDate.toISOString(),
      candidatesFound: candidates.length,
      processedCount,
      errorCount,
      totalMessagesPurged: totalMessagesCount,
      totalMediaBlobsPurged: totalMediaBlobsCount,
      details: purgeAuditLog
    });
  } catch (error: any) {
    console.error('[PurgeJob Fatal Error]:', error.message || error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error during purge execution' });
  }
}
