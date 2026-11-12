import { prisma } from './prisma';

export async function getAllPermissions(): Promise<Record<number, Record<string, boolean>>> {
  const all = await prisma.rolePermission.findMany();
  const result: Record<number, Record<string, boolean>> = {};

  for (const p of all) {
    if (!result[p.idRole]) result[p.idRole] = {};
    result[p.idRole][p.permissionKey] = p.enabled;
  }

  return result;
}
