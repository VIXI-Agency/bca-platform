'use client';

import { useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useValidateImport,
  useImportLeads,
  type ImportRow,
  type ColumnMapping,
  type ValidationResult,
  type ImportResult,
} from '@/hooks/use-import';

const TARGET_FIELDS: { key: keyof ColumnMapping; label: string }[] = [
  { key: 'businessName', label: 'Business Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
  { key: 'location', label: 'Location' },
  { key: 'industry', label: 'Industry' },
  { key: 'timezone', label: 'Timezone' },
];

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote ("") → literal "
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSV(text: string): { headers: string[]; rows: ImportRow[] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCSVLine(lines[0]);
  const rows: ImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: ImportRow = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? '';
    });
    // Skip rows where all values are empty
    if (Object.values(row).every((v) => v.trim() === '')) continue;
    rows.push(row);
  }

  return { headers, rows };
}

type Step = 'upload' | 'mapping' | 'preview' | 'validate' | 'import' | 'done';

export default function ImportPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: number })?.role;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [originalFileContent, setOriginalFileContent] = useState('');
  const [originalFileType, setOriginalFileType] = useState('text/csv');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    businessName: '',
    phone: '',
    address: '',
    location: '',
    industry: '',
    timezone: '',
  });
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const validateImport = useValidateImport();
  const importLeads = useImportLeads();

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      alert('Please upload a .csv file');
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setOriginalFileContent(text);
      setOriginalFileType(file.type || 'text/csv');
      const parsed = parseCSV(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);

      // Auto-map columns by fuzzy matching
      const autoMapping: ColumnMapping = {
        businessName: '',
        phone: '',
        address: '',
        location: '',
        industry: '',
        timezone: '',
      };

      const headerLower = parsed.headers.map((h) => h.toLowerCase());
      const matchMap: Record<keyof ColumnMapping, string[]> = {
        businessName: ['business', 'name', 'company', 'businessname', 'business_name', 'business name'],
        phone: ['phone', 'tel', 'telephone', 'number', 'phone_number'],
        address: ['address', 'street', 'addr'],
        location: ['location', 'city', 'loc', 'city_state', 'city/state'],
        industry: ['industry', 'sector', 'type', 'category'],
        timezone: ['timezone', 'tz', 'time_zone', 'time zone'],
      };

      for (const [field, keywords] of Object.entries(matchMap)) {
        const matchIndex = headerLower.findIndex((h) =>
          keywords.some((kw) => h.includes(kw))
        );
        if (matchIndex !== -1) {
          (autoMapping as unknown as Record<string, string>)[field] =
            parsed.headers[matchIndex];
        }
      }

      setMapping(autoMapping);
      setStep('mapping');
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  function updateMapping(field: keyof ColumnMapping, value: string) {
    setMapping((prev) => ({ ...prev, [field]: value }));
  }

  async function handleValidate() {
    const result = await validateImport.mutateAsync({ rows, mapping });
    setValidationResult(result);
    setStep('validate');
  }

  async function handleImport() {
    const result = await importLeads.mutateAsync({
      rows,
      mapping,
      originalFile: originalFileContent
        ? { name: fileName, content: originalFileContent, type: originalFileType }
        : undefined,
    });
    setImportResult(result);
    setStep('done');
  }

  function handleReset() {
    setStep('upload');
    setFileName('');
    setOriginalFileContent('');
    setOriginalFileType('text/csv');
    setHeaders([]);
    setRows([]);
    setMapping({
      businessName: '',
      phone: '',
      address: '',
      location: '',
      industry: '',
      timezone: '',
    });
    setValidationResult(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const previewRows = rows.slice(0, 10);
  const mappedFields = TARGET_FIELDS.filter((f) => mapping[f.key]);
  const allMapped = TARGET_FIELDS.every((f) => mapping[f.key]);

  if (userRole !== 1) {
    return (
      <>
        <Header title="Import Leads" />
        <div className="flex items-center justify-center pt-20">
          <p style={{ color: 'var(--text-secondary)' }}>
            You do not have permission to access this page.
          </p>
        </div>
      </>
    );
  }

  const steps: { key: Step; label: string; number: number }[] = [
    { key: 'upload', label: 'Upload', number: 1 },
    { key: 'mapping', label: 'Map Columns', number: 2 },
    { key: 'preview', label: 'Preview', number: 3 },
    { key: 'validate', label: 'Validate', number: 4 },
    { key: 'import', label: 'Import', number: 5 },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <>
      <Header title="Import Leads" />

      <div className="mx-auto max-w-5xl space-y-6 pt-6">
        {/* Step indicator */}
        {step !== 'done' && (
          <div className="flex items-center justify-center gap-2">
            {steps.map((s, idx) => (
              <div key={s.key} className="flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor:
                      idx <= currentStepIndex
                        ? 'var(--accent)'
                        : 'var(--bg-secondary)',
                    color:
                      idx <= currentStepIndex ? 'var(--accent-contrast)' : 'var(--text-muted)',
                  }}
                >
                  {s.number}
                </div>
                <span
                  className="hidden text-xs font-medium sm:inline"
                  style={{
                    color:
                      idx <= currentStepIndex
                        ? 'var(--accent)'
                        : 'var(--text-muted)',
                  }}
                >
                  {s.label}
                </span>
                {idx < steps.length - 1 && (
                  <div
                    className="h-px w-8"
                    style={{
                      backgroundColor:
                        idx < currentStepIndex
                          ? 'var(--accent)'
                          : 'var(--border)',
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <Card>
            <CardContent className="py-8">
              <div
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
                  dragOver ? 'border-[var(--accent)]' : 'border-[var(--border)]'
                }`}
                style={{
                  backgroundColor: dragOver
                    ? 'var(--accent-subtle)'
                    : 'transparent',
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <div
                  className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl"
                  style={{ backgroundColor: 'var(--accent-subtle)' }}
                >
                  <Upload className="h-8 w-8" style={{ color: 'var(--accent)' }} />
                </div>
                <p
                  className="mb-1 text-base font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Drag and drop your CSV file here
                </p>
                <p
                  className="mb-4 text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  or click to browse. Only .csv files are accepted.
                </p>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Choose File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Column Mapping */}
        {step === 'mapping' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet
                  className="h-5 w-5"
                  style={{ color: 'var(--accent)' }}
                />
                Column Mapping
              </CardTitle>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                File: {fileName} ({rows.length} rows detected). Map each column
                to a target field.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {TARGET_FIELDS.map((field) => (
                <div
                  key={field.key}
                  className="grid grid-cols-[200px_1fr] items-center gap-4"
                >
                  <Label className="text-right">{field.label}</Label>
                  <Select
                    value={mapping[field.key] || 'unmapped'}
                    onValueChange={(v) =>
                      updateMapping(field.key, v === 'unmapped' ? '' : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select column..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unmapped">-- Not Mapped --</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={handleReset}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={() => setStep('preview')}
                  disabled={!allMapped}
                >
                  Preview
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Preview */}
        {step === 'preview' && (
          <Card>
            <CardHeader>
              <CardTitle>Preview (First 10 Rows)</CardTitle>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Verify the data looks correct before validating.
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--bg-secondary)]">
                      <tr className="border-b border-[var(--border)]">
                        <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          #
                        </th>
                        {mappedFields.map((f) => (
                          <th
                            key={f.key}
                            className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
                          >
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-[var(--bg-card)]">
                      {previewRows.map((row, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-elevated)]"
                        >
                          <td className="px-4 py-3 text-[var(--text-muted)]">
                            {idx + 1}
                          </td>
                          {mappedFields.map((f) => (
                            <td
                              key={f.key}
                              className="px-4 py-3 text-[var(--text-primary)]"
                            >
                              {row[mapping[f.key]] || '\u2014'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep('mapping')}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={handleValidate}
                  disabled={validateImport.isPending}
                >
                  {validateImport.isPending ? (
                    <>
                      <Loading size="sm" />
                      Validating...
                    </>
                  ) : (
                    <>
                      Validate
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Validation Results */}
        {step === 'validate' && validationResult && (
          <Card>
            <CardHeader>
              <CardTitle>Validation Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div
                  className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-4"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <CheckCircle2
                    className="h-6 w-6 shrink-0"
                    style={{ color: 'var(--success)' }}
                  />
                  <div>
                    <p
                      className="text-2xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {validationResult.validRows}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Valid rows
                    </p>
                  </div>
                </div>

                <div
                  className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-4"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <AlertTriangle
                    className="h-6 w-6 shrink-0"
                    style={{ color: 'var(--warning)' }}
                  />
                  <div>
                    <p
                      className="text-2xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {validationResult.invalidRows}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Skipped / Duplicates
                    </p>
                  </div>
                </div>

                <div
                  className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-4"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <XCircle
                    className="h-6 w-6 shrink-0"
                    style={{ color: 'var(--danger)' }}
                  />
                  <div>
                    <p
                      className="text-2xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {validationResult.errors.length}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Errors
                    </p>
                  </div>
                </div>
              </div>

              {validationResult.errors.length > 0 && (
                <div className="space-y-2">
                  <p
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Error Details
                  </p>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                    {validationResult.errors.map((err, idx) => (
                      <p
                        key={idx}
                        className="text-xs"
                        style={{ color: 'var(--danger)' }}
                      >
                        Row {err.row}: {err.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep('preview')}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={
                    validationResult.validRows === 0 || importLeads.isPending
                  }
                >
                  {importLeads.isPending ? (
                    <>
                      <Loading size="sm" />
                      Importing...
                    </>
                  ) : (
                    <>
                      Import {validationResult.validRows} Leads
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Done */}
        {step === 'done' && importResult && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}
              >
                <CheckCircle2
                  className="h-8 w-8"
                  style={{ color: 'var(--success)' }}
                />
              </div>
              <p
                className="mb-2 text-xl font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Import Complete
              </p>

              <div className="mb-6 flex items-center gap-6">
                <div className="text-center">
                  <p
                    className="text-3xl font-bold"
                    style={{ color: 'var(--success)' }}
                  >
                    {importResult.imported}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Imported
                  </p>
                </div>
                <div className="text-center">
                  <p
                    className="text-3xl font-bold"
                    style={{ color: 'var(--warning)' }}
                  >
                    {importResult.skipped}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Skipped
                  </p>
                </div>
                <div className="text-center">
                  <p
                    className="text-3xl font-bold"
                    style={{ color: 'var(--danger)' }}
                  >
                    {importResult.errors.length}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Errors
                  </p>
                </div>
              </div>

              <p
                className="mb-4 text-sm"
                style={{ color: importResult.emailSent ? 'var(--success)' : 'var(--warning)' }}
              >
                {importResult.emailSent
                  ? 'Summary email sent to support@benjaminchaise.com'
                  : 'Import finished, but the summary email was not sent. Check SendGrid configuration/logs.'}
              </p>

              {importResult.errors.length > 0 && (
                <div className="mb-6 w-full max-w-md">
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                    {importResult.errors.map((err, idx) => (
                      <p
                        key={idx}
                        className="text-xs"
                        style={{ color: 'var(--danger)' }}
                      >
                        {err}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={handleReset}>
                <RotateCcw className="h-4 w-4" />
                Import Another
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
