import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireWorkerAuth } from '@/lib/scrape-auth';
import { classifyLead, type RawLead } from '@/lib/leads';
import { loadBlocklists, findByPhoneDigits, createLead } from '@/lib/leads-db';

const bodySchema = z.object({
  runId: z.number().int().positive(),
  taskId: z.number().int().positive(),
  listings: z
    .array(
      z.object({
        businessName: z.string().default(''),
        phone: z.string().default(''),
        address: z.string().default(''),
        location: z.string().default(''),
      }),
    )
    .max(500),
});

export async function POST(request: NextRequest) {
  const denied = requireWorkerAuth(request);
  if (denied) return denied;

  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }
    const { runId, taskId, listings } = parsed.data;

    const task = await prisma.scrapeTask.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: 'Unknown task' }, { status: 404 });
    }

    // Idempotent by task. A worker that posts successfully but loses the
    // response retries; without this the run counters double-count and the
    // daily email stops reconciling against Businesses.
    if (task.status === 'done') {
      // imported is 0, not the stored count: this call imported nothing, and
      // the worker adds the value to its progress toward DAILY_TARGET. Echoing
      // the original count would let phantom leads end the run early.
      return NextResponse.json({
        imported: 0,
        duplicates: 0,
        blacklisted: 0,
        invalid: 0,
        previouslyImported: task.importedCount ?? 0,
        alreadyRecorded: true,
      });
    }

    // Runs every rule and reports real counts, but writes no leads. Without it
    // there is no way to exercise this endpoint against the shared production
    // database, which is also the QA database.
    const dryRun = process.env.SCRAPE_DRY_RUN === '1';

    const blocklists = await loadBlocklists();
    let imported = 0;
    let duplicates = 0;
    let blacklisted = 0;
    let invalid = 0;
    const seenInBatch = new Set<string>();

    for (const listing of listings) {
      // Industry and timezone come from the task, never from the payload: the
      // worker fetches whatever URL it was told to and does not get a say in
      // how the lead is classified.
      const lead: RawLead = {
        businessName: listing.businessName,
        phone: listing.phone,
        address: listing.address,
        location: listing.location,
        industry: task.industry,
        timeZone: task.timeZone,
      };

      const verdict = classifyLead(lead, blocklists);
      if (!verdict.ok) {
        const blocked =
          verdict.reason.kind === 'blocked-area-code' || verdict.reason.kind === 'blocked-name';
        if (blocked) blacklisted++;
        else invalid++;
        continue;
      }

      if (seenInBatch.has(verdict.digits) || (await findByPhoneDigits(verdict.digits))) {
        duplicates++;
        continue;
      }

      if (dryRun) {
        seenInBatch.add(verdict.digits);
        imported++;
        continue;
      }

      try {
        await createLead(lead, verdict.formatted);
        seenInBatch.add(verdict.digits);
        imported++;
      } catch (err) {
        // UX_Businesses_PhoneDigits fired, so another writer won the race.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          duplicates++;
        } else {
          throw err;
        }
      }
    }

    // A dry run must not mark the task done. Coverage is global and permanent:
    // a 25-task dry batch would otherwise retire 25 industry-city pairs that
    // were never scraped, and nothing in the product can re-queue them.
    if (dryRun) {
      return NextResponse.json({ imported, duplicates, blacklisted, invalid, dryRun });
    }

    await prisma.$transaction([
      prisma.scrapeTask.update({
        where: { id: taskId },
        data: {
          status: 'done',
          idRun: runId,
          completedAt: new Date(),
          foundCount: listings.length,
          importedCount: imported,
        },
      }),
      prisma.scrapeRun.update({
        where: { id: runId },
        data: {
          tasksDone: { increment: 1 },
          leadsFound: { increment: listings.length },
          leadsImported: { increment: imported },
          duplicates: { increment: duplicates },
          blacklisted: { increment: blacklisted },
          invalid: { increment: invalid },
        },
      }),
    ]);

    return NextResponse.json({ imported, duplicates, blacklisted, invalid, dryRun });
  } catch (error) {
    console.error('POST /api/scrape/worker/results error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
