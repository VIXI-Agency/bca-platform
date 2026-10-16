'use client';

import { DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { LockedPeriodNotice } from '../locked-period-notice';
import { AuditTable } from '../audit-table';
import { usePaymentReport } from './use-payment-report';
import { ReportSelectors } from './report-selectors';
import { ReportLetterhead, EmployeeHeader } from './report-header';
import { RateEditor } from './rate-editor';
import { BonusEditor } from './bonus-editor';
import { ReportTable } from './report-table';
import { DisconnectionsSummary } from './disconnections-summary';
import { PaymentSummary } from './payment-summary';

/* ================================================== */
/*  TAB 5: Payment Report                              */
/* ================================================== */

export function PaymentReportTab() {
  const {
    selectedUserId, setSelectedUserId, selectedWeek, setSelectedWeek, empSearch, setEmpSearch,
    empLoading, filteredEmployees, weekOptions, navigateWeek,
    isLoading, timesheet, dayLogs, totals, disconnections, employee, periodLabel,
    payRateInput, setPayRateInput, otPayRateInput, setOtPayRateInput, rateIsDirty, handleSaveRate, updatePayRate,
    bonusInputs, setBonusInputs, countInputs, setCountInputs, notesInput, setNotesInput, bonusIsDirty, bonusLoading, handleSaveBonus, saveBonus, bonusEntries,
    payRate, otPayRate, regularPay, otPay, otRateMissing, bonusAmounts, bonusCounts, totalPay,
  } = usePaymentReport();

  const userId = selectedUserId ? parseInt(selectedUserId, 10) : 0;
  const locked = timesheet?.payRunStatus === 'approved' || timesheet?.payRunStatus === 'paid';
  // Dated bonuses can go on any workday of the period that has already happened.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const bonusDays = dayLogs.map((d) => d.date).filter((d) => d <= today);

  return (
    <div className="space-y-6 pt-4">
      {/* Selectors */}
      <ReportSelectors
        selectedUserId={selectedUserId}
        setSelectedUserId={setSelectedUserId}
        selectedWeek={selectedWeek}
        setSelectedWeek={setSelectedWeek}
        empSearch={empSearch}
        setEmpSearch={setEmpSearch}
        empLoading={empLoading}
        filteredEmployees={filteredEmployees}
        weekOptions={weekOptions}
        navigateWeek={navigateWeek}
      />

      {!selectedUserId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <DollarSign className="mb-4 h-10 w-10" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Select an employee and pay period to generate a payment report.
            </p>
          </CardContent>
        </Card>
      )}

      {selectedUserId && isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loading />
        </div>
      )}

      {selectedUserId && !isLoading && timesheet && (
        <div className="print-area space-y-6 print:space-y-2">
          {/* Letterhead: print only */}
          <ReportLetterhead />

          <Card>
            <CardContent className="space-y-6 py-6 print:space-y-2 print:py-2">
              <LockedPeriodNotice status={timesheet.payRunStatus} />
              {/* Header */}
              <EmployeeHeader
                employee={employee}
                periodLabel={periodLabel}
                payRate={payRate}
                otPayRate={otPayRate}
                rateIsDirty={rateIsDirty}
              />

              {/* Rate editor — typing here recalculates the totals below
                  immediately; Save persists it to the employee's profile. */}
              <RateEditor
                payRateInput={payRateInput}
                setPayRateInput={setPayRateInput}
                otPayRateInput={otPayRateInput}
                setOtPayRateInput={setOtPayRateInput}
                payRate={payRate}
                rateIsDirty={rateIsDirty}
                handleSaveRate={handleSaveRate}
                updatePayRate={updatePayRate}
              />

              {/* Bonus/incentive categories — manual per-period amounts, separate
                  from the hourly rate, added straight into the total below and
                  shown as their own line items on the printed report. */}
              <BonusEditor
                bonusInputs={bonusInputs}
                setBonusInputs={setBonusInputs}
                countInputs={countInputs}
                setCountInputs={setCountInputs}
                notesInput={notesInput}
                setNotesInput={setNotesInput}
                bonusIsDirty={bonusIsDirty}
                bonusLoading={bonusLoading}
                handleSaveBonus={handleSaveBonus}
                saveBonus={saveBonus}
                userId={userId}
                bonusEntries={bonusEntries}
                bonusDays={bonusDays}
                locked={locked}
              />

              {/* Timesheet table */}
              <ReportTable dayLogs={dayLogs} totals={totals} />

              {/* Disconnections summary */}
              {disconnections && disconnections.data.length > 0 && (
                <DisconnectionsSummary disconnections={disconnections} totals={totals} />
              )}

              {/* Modifications: every manual edit behind this period's numbers, so the
                  report doesn't silently hide an adjustment or a missing reason. */}
              {timesheet.audits.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold print:mb-1 print:text-[10px]" style={{ color: 'var(--text-primary)' }}>
                    Modifications This Period
                  </p>
                  <AuditTable audits={timesheet.audits} showEmployee={false} />
                </div>
              )}

              {/* Payment summary */}
              {totalPay != null && (
                <PaymentSummary
                  totals={totals}
                  payRate={payRate}
                  otPayRate={otPayRate}
                  regularPay={regularPay}
                  otPay={otPay}
                  otRateMissing={otRateMissing}
                  bonusAmounts={bonusAmounts}
                  bonusEntries={bonusEntries}
                  bonusCounts={bonusCounts}
                  notes={notesInput}
                  totalPay={totalPay}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
