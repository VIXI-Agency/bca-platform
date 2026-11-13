'use client';

import { useSession } from 'next-auth/react';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const { data: session } = useSession();

  const initials = session?.user?.name
    ? session.user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '??';

  return (
    <header
      className="sticky top-0 z-30 flex h-16 items-center justify-between border-b pl-14 pr-6 lg:px-6"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Left: Page title */}
      <h1
        className="text-xl font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        {title}
      </h1>

      {/* Right: user avatar */}
      <div className="flex items-center gap-4">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
          style={{
            backgroundColor: 'var(--accent-subtle)',
            color: 'var(--accent)',
            border: '1px solid rgba(0, 212, 255, 0.2)',
          }}
        >
          {initials}
        </div>
      </div>
    </header>
  );
}
