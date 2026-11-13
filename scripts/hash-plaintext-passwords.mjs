/**
 * One-time bcrypt of leftover plaintext Users.Password values (cost 12).
 * Writes nothing unless --apply is passed.
 *
 *   node scripts/hash-plaintext-passwords.mjs
 *   node scripts/hash-plaintext-passwords.mjs --apply
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const apply = process.argv.includes('--apply') && !process.argv.includes('--dry-run');

const nonBcrypt = {
  AND: [
    { password: { not: null } },
    { NOT: { password: { startsWith: '$2a$' } } },
    { NOT: { password: { startsWith: '$2b$' } } },
  ],
};

const alreadyBcrypt = {
  OR: [{ password: { startsWith: '$2a$' } }, { password: { startsWith: '$2b$' } }],
};

let prisma;
try {
  prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });

  const [total, plaintext, hashed] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: nonBcrypt }),
    prisma.user.count({ where: alreadyBcrypt }),
  ]);

  console.log(`total users: ${total}`);
  console.log(`non-bcrypt: ${plaintext}`);
  console.log(`already-bcrypt: ${hashed}`);

  let updated = 0;
  if (apply) {
    const rows = await prisma.user.findMany({
      where: nonBcrypt,
      select: { idUser: true, password: true },
    });
    for (const row of rows) {
      if (!row.password) continue;
      const next = await bcrypt.hash(row.password, 12);
      const result = await prisma.$transaction((tx) =>
        tx.user.updateMany({
          where: { idUser: row.idUser, password: row.password },
          data: { password: next },
        }),
      );
      updated += result.count;
    }
  }
  console.log(`updated: ${updated}`);
} catch {
  console.error('failed');
  process.exitCode = 1;
} finally {
  try {
    await prisma?.$disconnect();
  } catch {
    process.exitCode = 1;
  }
}
