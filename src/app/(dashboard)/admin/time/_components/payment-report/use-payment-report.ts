import { useState, useEffect, useMemo, useRef } from 'react';
import {
  useEmployeeList,
  useEmployeeTimesheet,
  useDisconnections,
  useUpdatePayRate,
  useBonus,
  useSaveBonus,
  BONUS_FIELDS,
  type BonusFieldKey,
} from '@/hooks/use-admin-time';
import { payPeriodOptions } from '@/lib/time';
import { computeReportTotals } from './totals';
import { nextSeed, type SeedKey } from './seed';

/** State, data and save handlers behind the Payment Report tab. */
export function usePaymentReport() {
  const { data: employees, isLoading: empLoading } = useEmployeeList();
  const updatePayRate = useUpdatePayRate();
  const saveBonus = useSaveBonus();

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [empSearch, setEmpSearch] = useState('');
  const [payRateInput, setPayRateInput] = useState('');
  const [otPayRateInput, setOtPayRateInput] = useState('');
  const [bonusInputs, setBonusInputs] = useState<Record<BonusFieldKey, string>>(
    () => Object.fromEntries(BONUS_FIELDS.map((key) => [key, ''])) as Record<BonusFieldKey, string>,
  );

  const weekOptions = useMemo(() => payPeriodOptions(24), []);

  useEffect(() => {
    if (!selectedWeek && weekOptions.length > 0) {
      setSelectedWeek(weekOptions[0].value);
    }
  }, [weekOptions, selectedWeek]);

  const userId = selectedUserId ? parseInt(selectedUserId, 10) : 0;
  const { data: timesheet, isLoading: timesheetLoading } = useEmployeeTimesheet(userId, selectedWeek);
  const { data: disconnections, isLoading: disconnectionsLoading } = useDisconnections(userId, selectedWeek);
  const { data: bonus, isLoading: bonusLoading } = useBonus(userId, selectedWeek);

  const employee = useMemo(
    () => employees?.find((e) => e.userId === userId),
    [employees, userId],
  );

  // Fill the editors from saved values once per selection — never again on a
  // refetch of the same selection (after Save, for one), which used to
  // overwrite whatever the admin typed meanwhile. See nextSeed.
  const rateSeed = useRef<SeedKey>(null);
  const bonusSeed = useRef<SeedKey>(null);

  // The rate is the employee's standing rate: seeded per employee.
  useEffect(() => {
    const next = nextSeed(rateSeed.current, String(userId), employee);
    if (!next) return;
    rateSeed.current = next.key;
    setPayRateInput(next.from?.payRate != null ? String(next.from.payRate) : '');
    setOtPayRateInput(next.from?.otPayRate != null ? String(next.from.otPayRate) : '');
  }, [userId, employee]);

  // Bonuses are per employee + pay period: seeded per that pair.
  useEffect(() => {
    const next = nextSeed(bonusSeed.current, `${userId}|${selectedWeek}`, bonus);
    if (!next) return;
    bonusSeed.current = next.key;
    setBonusInputs(
      Object.fromEntries(
        BONUS_FIELDS.map((key) => [key, next.from?.[key] != null ? String(next.from[key]) : '']),
      ) as Record<BonusFieldKey, string>,
    );
  }, [userId, selectedWeek, bonus]);

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    if (!empSearch) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(empSearch.toLowerCase()));
  }, [employees, empSearch]);

  function navigateWeek(direction: -1 | 1) {
    const idx = weekOptions.findIndex((w) => w.value === selectedWeek);
    const newIdx = idx - direction;
    if (newIdx >= 0 && newIdx < weekOptions.length) {
      setSelectedWeek(weekOptions[newIdx].value);
    }
  }

  const isLoading = timesheetLoading || disconnectionsLoading;
  const dayLogs = timesheet?.data ?? [];
  const totals = timesheet?.weekTotals;

  const { payRate, otPayRate, regularPay, otRateMissing, otPay, bonusAmounts, totalPay } = computeReportTotals({
    totals,
    payRateInput,
    otPayRateInput,
    bonusInputs,
  });
  const periodLabel = weekOptions.find((w) => w.value === selectedWeek)?.label ?? '';

  const rateIsDirty =
    employee != null &&
    (payRate !== (employee.payRate ?? null) || otPayRate !== (employee.otPayRate ?? null));
  const bonusIsDirty = BONUS_FIELDS.some((key) => bonusAmounts[key] !== (bonus?.[key] ?? 0));

  // Errors (e.g. a locked period) are shown next to each Save button from the
  // mutation's own error state.
  async function handleSaveRate() {
    if (!employee) return;
    try {
      // null clears a rate the admin emptied; undefined would be dropped
      // from the request and leave the old rate in place.
      await updatePayRate.mutateAsync({ userId: employee.userId, payRate, otPayRate });
    } catch {
      /* shown from updatePayRate.error */
    }
  }

  async function handleSaveBonus() {
    if (!userId || !selectedWeek) return;
    try {
      await saveBonus.mutateAsync({ userId, week: selectedWeek, ...bonusAmounts });
    } catch {
      /* shown from saveBonus.error */
    }
  }

  return {
    selectedUserId, setSelectedUserId, selectedWeek, setSelectedWeek, empSearch, setEmpSearch,
    empLoading, filteredEmployees, weekOptions, navigateWeek,
    isLoading, timesheet, dayLogs, totals, disconnections, employee, periodLabel,
    payRateInput, setPayRateInput, otPayRateInput, setOtPayRateInput, rateIsDirty, handleSaveRate, updatePayRate,
    bonusInputs, setBonusInputs, bonusIsDirty, bonusLoading, handleSaveBonus, saveBonus,
    payRate, otPayRate, regularPay, otPay, otRateMissing, bonusAmounts, totalPay,
  };
}
