'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { ChevronDown, LogOut, Sun, Moon, Menu, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import { navigation, adminNavigation, type NavItem } from '@/config/navigation';

function NavLink({ item, pathname, onClick }: { item: NavItem; pathname: string; onClick?: () => void }) {
  const isActive =
    item.href === '/'
      ? pathname === '/'
      : pathname === item.href || pathname.startsWith(item.href + '/');

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      )}
      style={{
        color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
        backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = 'var(--accent)';
          e.currentTarget.style.backgroundColor = 'rgba(0, 212, 255, 0.05)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = 'var(--text-secondary)';
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      <item.icon className="h-[18px] w-[18px] shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

function CollapsibleNav({
  item,
  pathname,
  permissions,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  permissions: string[];
  onNavigate?: () => void;
}) {
  const isChildActive = item.children?.some(
    (child) =>
      pathname === child.href || pathname.startsWith(child.href + '/'),
  );
  const [open, setOpen] = useState(!!isChildActive);

  const hasPermissions = permissions.length > 0;
  const filteredChildren = hasPermissions
    ? (item.children?.filter((child) => permissions.includes(child.permissionKey)) ?? [])
    : (item.children ?? []);

  if (filteredChildren.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
        style={{
          color: isChildActive ? 'var(--accent)' : 'var(--text-secondary)',
        }}
        onMouseEnter={(e) => {
          if (!isChildActive) {
            e.currentTarget.style.color = 'var(--accent)';
            e.currentTarget.style.backgroundColor = 'rgba(0, 212, 255, 0.05)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isChildActive) {
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        <item.icon className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l pl-3" style={{ borderColor: 'var(--border)' }}>
          {filteredChildren.map((child) => (
            <NavLink key={child.href} item={child} pathname={pathname} onClick={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const userName = session?.user?.name ?? 'User';
  const userRole = (session?.user as { role?: number })?.role;
  const userPermissions = (session?.user as { permissions?: string[] })?.permissions ?? [];
  const hasPermissions = userPermissions.length > 0;

  const { data: profile } = useQuery<{ photo: string | null }>({
    queryKey: ['profile-photo'],
    queryFn: async () => {
      const res = await fetch('/api/profile');
      if (!res.ok) return { photo: null };
      return res.json();
    },
    enabled: !!session?.user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: unreadSmsData } = useQuery<number>({
    queryKey: ['sms-unread-count'],
    queryFn: async () => {
      const res = await fetch('/api/sms');
      if (!res.ok) return 0;
      const convs = await res.json();
      return Array.isArray(convs) ? convs.reduce((sum: number, c: { unread: number }) => sum + (c.unread ?? 0), 0) : 0;
    },
    refetchInterval: 15_000,
    enabled: !!session?.user,
  });
  const unreadSmsCount = unreadSmsData ?? 0;

  const { data: pendingData } = useQuery<{ count: number }>({
    queryKey: ['pending-accounts'],
    queryFn: async () => {
      const res = await fetch('/api/users?status=pending');
      if (!res.ok) return { count: 0 };
      const users = await res.json();
      return { count: Array.isArray(users) ? users.length : 0 };
    },
    enabled: hasPermissions ? userPermissions.includes('admin_users') : userRole === 1,
    staleTime: 60 * 1000,
  });
  const pendingCount = pendingData?.count ?? 0;

  const filteredNav = hasPermissions
    ? navigation.filter((item) => userPermissions.includes(item.permissionKey))
    : navigation;
  const filteredAdmin = hasPermissions
    ? adminNavigation.filter((item) => userPermissions.includes(item.permissionKey))
    : userRole === 1
      ? adminNavigation
      : [];

  const closeMobile = () => setMobileOpen(false);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b px-5" style={{ borderColor: 'var(--border)' }}>
        <Image src="/pulse-icon.png" alt="PulseBC" width={28} height={28} />
        <span
          className="text-xl font-bold tracking-wide"
          style={{ color: 'var(--accent)' }}
        >
          Pulse<span style={{ color: 'var(--text-primary)' }}>BC</span>
        </span>
        {/* Close button on mobile */}
        <button
          onClick={closeMobile}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg lg:hidden"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-0.5">
          {filteredNav.map((item) =>
            item.children ? (
              <CollapsibleNav
                key={item.label}
                item={item}
                pathname={pathname}
                permissions={userPermissions}
                onNavigate={closeMobile}
              />
            ) : (
              <div key={item.href} className="relative">
                <NavLink item={item} pathname={pathname} onClick={closeMobile} />
                {item.href === '/sms' && unreadSmsCount > 0 && (
                  <span
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
                    style={{ backgroundColor: '#ef4444' }}
                  >
                    {unreadSmsCount > 99 ? '99+' : unreadSmsCount}
                  </span>
                )}
              </div>
            ),
          )}
        </div>

        {/* Admin section */}
        {filteredAdmin.length > 0 && (
          <>
            <div className="my-4 flex items-center gap-2 px-3">
              <span
                className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: 'var(--text-muted)' }}
              >
                Admin
              </span>
              <div
                className="h-px flex-1"
                style={{ backgroundColor: 'var(--border)' }}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              {filteredAdmin.map((item) =>
                item.children ? (
                  <CollapsibleNav
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    permissions={userPermissions}
                    onNavigate={closeMobile}
                  />
                ) : (
                  <div key={item.href} className="relative">
                    <NavLink item={item} pathname={pathname} onClick={closeMobile} />
                    {item.href === '/admin/users' && pendingCount > 0 && (
                      <span
                        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
                        style={{ backgroundColor: '#ef4444' }}
                      >
                        {pendingCount}
                      </span>
                    )}
                  </div>
                ),
              )}
            </div>
          </>
        )}
      </nav>

      {/* User info + logout */}
      <div
        className="flex items-center gap-3 border-t px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <Link href="/profile" onClick={closeMobile} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 -mx-1 transition-colors hover:bg-[var(--accent-subtle)]">
          {profile?.photo ? (
            <img
              src={profile.photo}
              alt={userName}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              style={{
                backgroundColor: 'var(--accent-subtle)',
                color: 'var(--accent)',
              }}
            >
              {userName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </div>
          )}
          <span
            className="flex-1 truncate text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            {userName}
          </span>
        </Link>
        <button
          onClick={toggleTheme}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent)';
            e.currentTarget.style.backgroundColor = 'var(--accent-subtle)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--danger)';
            e.currentTarget.style.backgroundColor = 'var(--danger-subtle)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg border lg:hidden print:hidden"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden print:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar - always visible on lg+, slide-in on mobile. print:hidden is
          load-bearing, not cosmetic: a fixed-position element isn't removed
          from print pagination by visibility:hidden alone (Chromium can
          still reserve/repeat space for it per page), which was silently
          forcing a blank second page on every printed report regardless of
          how little content that report had. */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-[260px] flex-col border-r transition-transform duration-300 print:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
