import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();

const sql = readFileSync('prisma/migrations/20261008_payroll_report_fields.sql', 'utf-8');
const statements = sql
  .split(/\n\s*\n/)
  .map((s) => s.trim())
  .filter(Boolean);

for (const stmt of statements) {
  console.log('Running:', stmt.split('\n')[0]);
  await prisma.$executeRawUnsafe(stmt);
}

console.log('Migration applied.');
await prisma.$disconnect();
