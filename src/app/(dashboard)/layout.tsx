import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import Sidebar from '@/components/layout/sidebar';
import AuthSessionProvider from '@/components/layout/session-provider';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  return (
    <AuthSessionProvider session={session}>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:ml-[260px] lg:p-6">
          {children}
        </main>
      </div>
    </AuthSessionProvider>
  );
}
