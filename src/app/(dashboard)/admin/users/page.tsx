'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  Plus,
  Pencil,
  UserX,
  UserCheck,
  Search,
  Users,
  Clock,
  Save,
} from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useActivateUser,
  useUserSchedule,
  useUpdateSchedule,
  type User,
  type ScheduleDay,
} from '@/hooks/use-users';

const ROLES: { value: number; label: string }[] = [
  { value: 1, label: 'Admin' },
  { value: 2, label: 'Closer' },
  { value: 3, label: 'Remote Agent' },
];

function getRoleBadge(role: number) {
  const roleMap: Record<number, { label: string; variant: 'default' | 'success' | 'warning' | 'outline' }> = {
    1: { label: 'Admin', variant: 'default' },
    2: { label: 'Closer', variant: 'success' },
    3: { label: 'Remote Agent', variant: 'warning' },
  };
  const info = roleMap[role];
  if (!info) return null; // Don't show badge for legacy roles (4=Disabled, 5=Importer)
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const DEFAULT_SCHEDULE: ScheduleDay[] = DAYS.map((day) => ({
  day,
  startTime: '09:00',
  endTime: '17:00',
}));

interface UserFormState {
  name: string;
  lastname: string;
  email: string;
  password: string;
  role: number;
  timezone: string;
  city: string;
  state: string;
  country: string;
  isPartTime: boolean;
  smsAccess: boolean;
  sendEmail: boolean;
}

const INITIAL_FORM: UserFormState = {
  name: '',
  lastname: '',
  email: '',
  password: '',
  role: 3,
  timezone: 'America/New_York',
  city: '',
  state: '',
  country: 'US',
  isPartTime: false,
  smsAccess: false,
  sendEmail: false,
};

export default function UsersPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: number })?.role;

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserFormState>(INITIAL_FORM);
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleDay[]>(DEFAULT_SCHEDULE);

  const { data: users, isLoading } = useUsers(
    debouncedSearch || undefined,
    statusFilter !== 'all' ? statusFilter : undefined,
  );
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const activateUser = useActivateUser();
  const updateSchedule = useUpdateSchedule();

  const { data: userSchedule } = useUserSchedule(editingUser?.userId ?? 0);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Populate schedule when editing
  useEffect(() => {
    if (userSchedule?.schedule?.length) {
      setSchedule(userSchedule.schedule);
    } else if (editingUser) {
      setSchedule(DEFAULT_SCHEDULE);
    }
  }, [userSchedule, editingUser]);

  const isAdmin = userRole === 1;
  const isCloser = userRole === 2;

  if (!isAdmin && !isCloser) {
    return (
      <>
        <Header title="User Management" />
        <div className="flex items-center justify-center pt-20">
          <p style={{ color: 'var(--text-secondary)' }}>
            You do not have permission to access this page.
          </p>
        </div>
      </>
    );
  }

  function openAddDialog() {
    setEditingUser(null);
    setForm(INITIAL_FORM);
    setShowSchedule(false);
    setSchedule(DEFAULT_SCHEDULE);
    setDialogOpen(true);
  }

  function openEditDialog(user: User) {
    setEditingUser(user);
    setForm({
      name: user.name,
      lastname: user.lastname,
      email: user.email,
      password: '',
      role: user.role,
      timezone: user.timezone,
      city: user.city,
      state: user.state,
      country: user.country,
      isPartTime: user.isPartTime,
      smsAccess: user.smsAccess,
      sendEmail: user.sendEmail,
    });
    setShowSchedule(false);
    setDialogOpen(true);
  }

  function openDeactivateDialog(user: User) {
    setDeactivatingUser(user);
    setDeactivateDialogOpen(true);
  }

  function updateForm(field: keyof UserFormState, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateScheduleDay(index: number, field: 'startTime' | 'endTime', value: string) {
    setSchedule((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  const [formError, setFormError] = useState<string | null>(null);

  async function handleSave() {
    if (!form.name.trim() || !form.email.trim()) return;
    setFormError(null);

    try {
      if (editingUser) {
        await updateUser.mutateAsync({
          userId: editingUser.userId,
          name: form.name.trim(),
          lastname: form.lastname.trim(),
          email: form.email.trim(),
          password: form.password || undefined,
          role: form.role,
          timezone: form.timezone,
          city: form.city.trim(),
          state: form.state.trim(),
          country: form.country.trim(),
          isPartTime: form.isPartTime,
          smsAccess: form.smsAccess,
          sendEmail: form.sendEmail,
        });
      } else {
        if (!form.password) return;
        await createUser.mutateAsync({
          name: form.name.trim(),
          lastname: form.lastname.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          timezone: form.timezone,
          city: form.city.trim(),
          state: form.state.trim(),
          country: form.country.trim(),
          isPartTime: form.isPartTime,
          sendEmail: form.sendEmail,
        });
      }

      setDialogOpen(false);
      setEditingUser(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save user');
    }
  }

  async function handleSaveSchedule() {
    if (!editingUser) return;
    await updateSchedule.mutateAsync({
      userId: editingUser.userId,
      schedule,
    });
  }

  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  async function handleDeactivate() {
    if (!deactivatingUser) return;
    setDeactivateError(null);
    try {
      await deleteUser.mutateAsync(deactivatingUser.userId);
      setDeactivateDialogOpen(false);
      setDeactivatingUser(null);
    } catch (err) {
      setDeactivateError(err instanceof Error ? err.message : 'Failed to deactivate user');
    }
  }

  async function handleActivate(user: User) {
    try {
      await activateUser.mutateAsync(user.userId);
    } catch {
      // Errors surface via react-query's error state
    }
  }

  const isSaving = createUser.isPending || updateUser.isPending;

  return (
    <>
      <Header title="User Management" />

      <div className="mx-auto max-w-6xl space-y-6 pt-6">
        {/* Top bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
              />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <Button onClick={openAddDialog}>
              <Plus className="h-4 w-4" />
              Add User
            </Button>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loading />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && (!users || users.length === 0) && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl"
                style={{ backgroundColor: 'var(--accent-subtle)' }}
              >
                <Users className="h-7 w-7" style={{ color: 'var(--accent)' }} />
              </div>
              <p
                className="mb-1 text-base font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                No users found
              </p>
              <p
                className="mb-4 text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                {search
                  ? 'Try adjusting your search query.'
                  : 'Add your first team member to get started.'}
              </p>
              {!search && (
                <Button onClick={openAddDialog} size="sm">
                  <Plus className="h-4 w-4" />
                  Add User
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* User list */}
        {users && users.length > 0 && (
          <div className="space-y-3">
            {users.map((user) => (
              <Card key={user.userId} className="group">
                <CardContent className="flex items-center gap-4 py-4">
                  {/* Avatar */}
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    style={{
                      backgroundColor: 'var(--accent-subtle)',
                      color: 'var(--accent)',
                      border: '1px solid var(--accent-subtle)',
                    }}
                  >
                    {user.name[0]}
                    {user.lastname?.[0] ?? ''}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className="truncate font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {user.name} {user.lastname}
                      </p>
                      {getRoleBadge(user.role)}
                      <Badge variant={user.isActive ? 'success' : 'destructive'}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      {user.isPartTime && (
                        <Badge variant="warning">Part-time</Badge>
                      )}
                    </div>
                    <p
                      className="truncate text-sm"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {user.email}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                    {/* Edit: admin only */}
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(user)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {/* Activate/Deactivate: admin for all, closer for remote agents only */}
                    {(isAdmin || (isCloser && (user.role === 3 || user.role === 4))) && (
                      <>
                        {user.isActive ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-[var(--danger)] hover:text-[var(--danger)]"
                            onClick={() => openDeactivateDialog(user)}
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-[var(--success)] hover:text-[var(--success)]"
                            onClick={() => handleActivate(user)}
                            disabled={activateUser.isPending}
                          >
                            <UserCheck className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? 'Edit User' : 'Add User'}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Update the user details below.'
                : 'Fill in the details to create a new user.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="user-name">First Name</Label>
                <Input
                  id="user-name"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  placeholder="John"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-lastname">Last Name</Label>
                <Input
                  id="user-lastname"
                  value={form.lastname}
                  onChange={(e) => updateForm('lastname', e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(e) => updateForm('email', e.target.value)}
                placeholder="john@example.com"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="user-password">
                Password{editingUser ? ' (leave blank to keep current)' : ''}
              </Label>
              <Input
                id="user-password"
                type="password"
                value={form.password}
                onChange={(e) => updateForm('password', e.target.value)}
                placeholder={editingUser ? '••••••••' : 'Enter password'}
              />
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={String(form.role)}
                onValueChange={(v) => updateForm('role', Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={String(r.value)}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Timezone */}
            <div className="space-y-1.5">
              <Label htmlFor="user-timezone">Timezone</Label>
              <Input
                id="user-timezone"
                value={form.timezone}
                onChange={(e) => updateForm('timezone', e.target.value)}
                placeholder="America/New_York"
              />
            </div>

            {/* Location row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="user-city">City</Label>
                <Input
                  id="user-city"
                  value={form.city}
                  onChange={(e) => updateForm('city', e.target.value)}
                  placeholder="New York"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-state">State</Label>
                <Input
                  id="user-state"
                  value={form.state}
                  onChange={(e) => updateForm('state', e.target.value)}
                  placeholder="NY"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-country">Country</Label>
                <Input
                  id="user-country"
                  value={form.country}
                  onChange={(e) => updateForm('country', e.target.value)}
                  placeholder="US"
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Part-time
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Mark this user as a part-time employee
                </p>
              </div>
              <Switch
                checked={form.isPartTime}
                onCheckedChange={(checked) => updateForm('isPartTime', checked)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  SMS Access
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Allow this user to access SMS regardless of their role
                </p>
              </div>
              <Switch
                checked={form.smsAccess}
                onCheckedChange={(checked) => updateForm('smsAccess', checked)}
              />
            </div>

            {/* Schedule Section (edit only) */}
            {editingUser && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Work Schedule
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSchedule(!showSchedule)}
                  >
                    {showSchedule ? 'Hide' : 'Show'}
                  </Button>
                </div>

                {showSchedule && (
                  <div className="space-y-3">
                    {schedule.map((day, idx) => (
                      <div
                        key={day.day}
                        className="grid grid-cols-[100px_1fr_1fr] items-center gap-3"
                      >
                        <p
                          className="text-sm font-medium"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {day.day.slice(0, 3)}
                        </p>
                        <Input
                          type="time"
                          value={day.startTime}
                          onChange={(e) =>
                            updateScheduleDay(idx, 'startTime', e.target.value)
                          }
                        />
                        <Input
                          type="time"
                          value={day.endTime}
                          onChange={(e) =>
                            updateScheduleDay(idx, 'endTime', e.target.value)
                          }
                        />
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveSchedule}
                      disabled={updateSchedule.isPending}
                    >
                      {updateSchedule.isPending ? (
                        <>
                          <Loading size="sm" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Save Schedule
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {formError && (
            <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
              {formError}
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDialogOpen(false); setFormError(null); }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                !form.name.trim() ||
                !form.email.trim() ||
                (!editingUser && !form.password) ||
                isSaving
              }
            >
              {isSaving ? (
                <>
                  <Loading size="sm" />
                  Saving...
                </>
              ) : editingUser ? (
                'Update User'
              ) : (
                'Create User'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation Dialog */}
      <Dialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate User</DialogTitle>
            <DialogDescription>
              This will prevent the user from logging in.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Are you sure you want to deactivate{' '}
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {deactivatingUser?.name} {deactivatingUser?.lastname}
            </span>
            ? They will no longer be able to access the platform.
          </p>
          {deactivateError && (
            <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
              {deactivateError}
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDeactivateDialogOpen(false); setDeactivateError(null); }}
              disabled={deleteUser.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeactivate}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? (
                <>
                  <Loading size="sm" />
                  Deactivating...
                </>
              ) : (
                'Deactivate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
