import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const prodEnvPath = path.join(process.cwd(), '.env.production.local');
if (fs.existsSync(prodEnvPath)) {
  dotenv.config({ path: prodEnvPath });
} else {
  dotenv.config();
}

const connectionString = process.env.DB_URL || process.env.DATABASE_URL;
process.env.DB_URL = connectionString;

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: connectionString,
    },
  },
});

async function main() {
  const cutoffHours = 48;
  const cutoffDate = new Date(Date.now() - cutoffHours * 60 * 60 * 1000);

  console.log(`[DryRunAudit] Querying live DB for CLOSED conversations updated before ${cutoffDate.toISOString()}...`);

  const candidates = await prisma.conversation.findMany({
    where: {
      status: 'CLOSED',
      updated_at: {
        lt: cutoffDate
      }
    },
    include: {
      messages: true,
      restaurant: {
        select: { id: true, name: true }
      }
    }
  });

  console.log(`[DryRunAudit] Found ${candidates.length} candidate closed conversations older than ${cutoffHours}h.`);

  let totalMessages = 0;
  let totalOrders = 0;
  let totalReservations = 0;
  let totalBlobs = 0;

  const candidateDetails: any[] = [];

  for (const conv of candidates) {
    const messages = conv.messages || [];
    totalMessages += messages.length;

    const orders = await prisma.order.findMany({
      where: {
        restaurant_id: conv.restaurant_id,
        customer_phone: conv.customer_phone,
        created_at: { lt: cutoffDate }
      }
    });
    totalOrders += orders.length;

    const reservations = await prisma.reservation.findMany({
      where: {
        restaurant_id: conv.restaurant_id,
        customer_phone: conv.customer_phone,
        date_time: { lt: cutoffDate }
      }
    });
    totalReservations += reservations.length;

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
    }

    totalBlobs += blobUrls.length;

    candidateDetails.push({
      conversation_id: conv.id,
      restaurant_name: conv.restaurant?.name || 'مطعم عم عيسى',
      customer_phone: conv.customer_phone,
      closed_at: conv.updated_at,
      hours_since_closed: Math.round((Date.now() - new Date(conv.updated_at).getTime()) / (1000 * 60 * 60)),
      messages_count: messages.length,
      orders_count: orders.length,
      reservations_count: reservations.length,
      media_blobs_count: blobUrls.length,
      blob_urls: blobUrls
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    cutoff_hours: cutoffHours,
    cutoff_date: cutoffDate.toISOString(),
    summary: {
      total_conversations_to_purge: candidates.length,
      total_messages_to_purge: totalMessages,
      total_orders_to_purge: totalOrders,
      total_reservations_to_purge: totalReservations,
      total_media_blobs_to_purge: totalBlobs
    },
    candidates: candidateDetails
  };

  console.log('--- DRY RUN REPORT START ---');
  console.log(JSON.stringify(report, null, 2));
  console.log('--- DRY RUN REPORT END ---');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error running Dry Run Audit:', err);
  process.exit(1);
});
