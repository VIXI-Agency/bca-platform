export interface TimeLogEntry {
  logDate: string;
  clockIn?: string;
  firstBreakOut?: string;
  firstBreakIn?: string;
  lunchOut?: string;
  lunchIn?: string;
  secondBreakOut?: string;
  secondBreakIn?: string;
  clockOut?: string;
  totalHours?: number;
}

export type ClockAction = 'clockIn' | 'clockOut' | 'firstBreakOut' | 'firstBreakIn' | 'lunchOut' | 'lunchIn' | 'secondBreakOut' | 'secondBreakIn';

export interface Disposition {
  idDisposition: number;
  disposition: string;
}

export interface Rebuttal {
  idRebuttal: number;
  title: string;
  content: string;
}

export type ClockStatus = 'not_clocked_in' | 'working' | 'first_break' | 'lunch' | 'second_break' | 'clocked_out';
