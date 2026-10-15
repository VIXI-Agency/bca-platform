'use client';

import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/ui/loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Employee } from '@/hooks/use-admin-time';

interface ReportSelectorsProps {
  selectedUserId: string;
  setSelectedUserId: (value: string) => void;
  selectedWeek: string;
  setSelectedWeek: (value: string) => void;
  empSearch: string;
  setEmpSearch: (value: string) => void;
  empLoading: boolean;
  filteredEmployees: Employee[];
  weekOptions: { value: string; label: string }[];
  navigateWeek: (direction: -1 | 1) => void;
}

/** Employee and pay-period pickers, plus the print button (hidden in print). */
export function ReportSelectors({
  selectedUserId,
  setSelectedUserId,
  selectedWeek,
  setSelectedWeek,
  empSearch,
  setEmpSearch,
  empLoading,
  filteredEmployees,
  weekOptions,
  navigateWeek,
}: ReportSelectorsProps) {
  return (
    <Card className="no-print">
      <CardContent className="py-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[240px] flex-1 space-y-2">
            <Label>Employee</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee..." />
              </SelectTrigger>
              <SelectContent>
                <div className="px-2 pb-2">
                  <Input
                    placeholder="Search..."
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    className="h-8"
                  />
                </div>
                {empLoading && (
                  <div className="flex justify-center py-4">
                    <Loading size="sm" />
                  </div>
                )}
                {filteredEmployees.map((emp) => (
                  <SelectItem key={emp.userId} value={String(emp.userId)}>
                    {emp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[280px] flex-1 space-y-2">
            <Label>Pay Period</Label>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => navigateWeek(-1)}
                disabled={weekOptions.findIndex((w) => w.value === selectedWeek) >= weekOptions.length - 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period..." />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions.map((w) => (
                    <SelectItem key={w.value} value={w.value}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => navigateWeek(1)}
                disabled={weekOptions.findIndex((w) => w.value === selectedWeek) <= 0}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {selectedUserId && (
            <Button variant="outline" onClick={() => window.print()} className="gap-1.5">
              <Printer className="h-4 w-4" />
              Print / Save as PDF
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
