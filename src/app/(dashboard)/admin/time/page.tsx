'use client';

import { useSession } from 'next-auth/react';
import { Pencil, Users, FileText, History, DollarSign } from 'lucide-react';
import Header from '@/components/layout/header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { EmployeeStatusTab } from './_components/employee-status/employee-status-tab';
import { TimeHistoryTab } from './_components/time-history-tab';
import { AuditLogTab } from './_components/audit-log-tab';
import { EditTimeTab } from './_components/edit-time/edit-time-tab';
import { PaymentReportTab } from './_components/payment-report/payment-report-tab';

/* -------------------------------------------------- */
/*  Main Page                                          */
/* -------------------------------------------------- */

export default function AdminTimePage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: number })?.role;

  // Guard: Administrator only — Time Management (hours, pay rates, the
  // Payment Report) is no longer open to Closers.
  if (userRole !== 1) {
    return (
      <>
        <Header title="Time Management" />
        <div className="flex items-center justify-center pt-20">
          <p style={{ color: 'var(--text-secondary)' }}>
            You do not have permission to access this page.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Time Management" />
      <div className="mx-auto max-w-7xl space-y-6 pt-6">
        <Tabs defaultValue="status">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="status" className="gap-1.5">
              <Users className="h-4 w-4" />
              Employee Status
            </TabsTrigger>
            <TabsTrigger value="edit" className="gap-1.5">
              <Pencil className="h-4 w-4" />
              Edit Time
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-4 w-4" />
              Time History
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5">
              <FileText className="h-4 w-4" />
              Audit Log
            </TabsTrigger>
            <TabsTrigger value="report" className="gap-1.5">
              <DollarSign className="h-4 w-4" />
              Payment Report
            </TabsTrigger>
          </TabsList>

          <TabsContent value="status">
            <EmployeeStatusTab />
          </TabsContent>

          <TabsContent value="edit">
            <EditTimeTab />
          </TabsContent>

          <TabsContent value="history">
            <TimeHistoryTab />
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogTab />
          </TabsContent>

          <TabsContent value="report">
            <PaymentReportTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
