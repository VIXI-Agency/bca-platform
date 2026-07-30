import { prisma } from '@/lib/prisma';
import { NEW_LEAD_STATUS, type Blocklists, type RawLead } from '@/lib/leads';

export async function loadBlocklists(): Promise<Blocklists> {
  const [blockedNames, blockedAreaCodes] = await Promise.all([
    prisma.blockedName.findMany({ select: { keyword: true } }),
    prisma.blockedAreaCode.findMany({ select: { areaCode: true } }),
  ]);
  return {
    keywords: blockedNames.map((n) => n.keyword.toLowerCase()),
    areaCodes: new Set(blockedAreaCodes.map((c) => c.areaCode)),
  };
}

export async function findByPhoneDigits(digits: string) {
  return prisma.business.findFirst({ where: { phoneDigits: digits } });
}

/** PhoneDigits is a computed column on SQL Server, so it is never written here. */
export async function createLead(lead: RawLead, formatted: string) {
  return prisma.business.create({
    data: {
      businessName: lead.businessName,
      phone: formatted,
      address: lead.address,
      location: lead.location,
      industry: lead.industry,
      timeZone: lead.timeZone,
      idStatus: NEW_LEAD_STATUS,
    },
  });
}
