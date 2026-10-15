'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/ui/loading';

interface RateEditorProps {
  payRateInput: string;
  setPayRateInput: (value: string) => void;
  otPayRateInput: string;
  setOtPayRateInput: (value: string) => void;
  payRate: number | null;
  rateIsDirty: boolean;
  handleSaveRate: () => void;
  updatePayRate: { isPending: boolean; error: Error | null };
}

/** Pay and OT rate inputs (hidden in print). */
export function RateEditor({
  payRateInput,
  setPayRateInput,
  otPayRateInput,
  setOtPayRateInput,
  payRate,
  rateIsDirty,
  handleSaveRate,
  updatePayRate,
}: RateEditorProps) {
  return (
    <div
      className="no-print flex flex-wrap items-end gap-3 rounded-lg border p-3"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
    >
      <div className="space-y-1">
        <Label htmlFor="report-pay-rate" className="text-xs">Pay Rate ($/hr)</Label>
        <Input
          id="report-pay-rate"
          type="number"
          min="0"
          step="0.01"
          className="h-8 w-28"
          value={payRateInput}
          onChange={(e) => setPayRateInput(e.target.value)}
          placeholder="8.00"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="report-ot-rate" className="text-xs">OT Rate ($/hr)</Label>
        <Input
          id="report-ot-rate"
          type="number"
          min="0"
          step="0.01"
          className="h-8 w-28"
          value={otPayRateInput}
          onChange={(e) => setOtPayRateInput(e.target.value)}
          placeholder="12.00"
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleSaveRate}
        disabled={!rateIsDirty || updatePayRate.isPending}
      >
        {updatePayRate.isPending ? (
          <Loading size="sm" />
        ) : rateIsDirty ? (
          'Save Rate'
        ) : (
          'Saved'
        )}
      </Button>
      {payRate == null && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Enter a rate to calculate payment for this period.
        </p>
      )}
      {updatePayRate.error && (
        <p className="w-full text-xs text-red-500">{updatePayRate.error.message}</p>
      )}
    </div>
  );
}
