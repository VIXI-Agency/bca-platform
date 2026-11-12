import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAllPermissions } from '@/lib/permissions';
import { ALL_PERMISSION_KEYS, PERMISSION_LABELS } from '@/config/permission-keys';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role: number }).role;
    if (role !== 1) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all roles
    const roles = await prisma.role.findMany({
      where: { idRole: { in: [1, 2, 3] } },
      orderBy: { idRole: 'asc' },
    });

    // Get all permissions from DB
    const permissionMap = await getAllPermissions();

    return NextResponse.json({
      roles: roles.map((r: { idRole: number; role: string | null }) => ({ id: r.idRole, name: r.role })),
      permissions: ALL_PERMISSION_KEYS.map((key) => ({
        key,
        label: PERMISSION_LABELS[key],
      })),
      matrix: permissionMap,
    });
  } catch (error) {
    console.error('GET /api/admin/permissions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role: number }).role;
    if (role !== 1) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    // Expected: { matrix: { [roleId: string]: { [permKey: string]: boolean } } }
    const { matrix } = body;

    if (!matrix || typeof matrix !== 'object') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Update each permission
    for (const [roleIdStr, perms] of Object.entries(matrix)) {
      const roleId = Number(roleIdStr);
      if (isNaN(roleId)) continue;

      for (const [permKey, enabled] of Object.entries(perms as Record<string, boolean>)) {
        if (!ALL_PERMISSION_KEYS.includes(permKey)) continue;

        await prisma.rolePermission.upsert({
          where: {
            idRole_permissionKey: { idRole: roleId, permissionKey: permKey },
          },
          update: { enabled },
          create: { idRole: roleId, permissionKey: permKey, enabled },
        });
      }
    }

    return NextResponse.json({ success: true, message: 'Permissions updated. Users must re-login for changes to take effect.' });
  } catch (error) {
    console.error('PUT /api/admin/permissions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
