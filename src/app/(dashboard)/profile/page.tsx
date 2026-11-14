'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Save, Lock, Calendar, User, CheckCircle2, AlertCircle } from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ScheduleEntry {
  day: string;
  startTime: string;
  endTime: string;
}

interface ProfileData {
  userId: number;
  name: string;
  lastname: string;
  email: string;
  role: number;
  roleName: string;
  timezone: string;
  city: string;
  state: string;
  country: string;
  photo: string | null;
  schedule: ScheduleEntry[];
}

interface Toast {
  message: string;
  type: 'success' | 'error';
}

function ToastNotification({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border px-5 py-3 shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        borderColor: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
        color: 'var(--text-primary)',
      }}
    >
      {toast.type === 'success' ? (
        <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: 'var(--success)' }} />
      ) : (
        <AlertCircle className="h-5 w-5 shrink-0" style={{ color: 'var(--danger)' }} />
      )}
      <span className="text-sm font-medium">{toast.message}</span>
    </div>
  );
}

const TIMEZONES = [
  { value: 'PST', label: 'Pacific (PST)' },
  { value: 'MST', label: 'Mountain (MST)' },
  { value: 'CST', label: 'Central (CST)' },
  { value: 'EST', label: 'Eastern (EST)' },
];

async function fetchProfile(): Promise<ProfileData> {
  const res = await fetch('/api/profile');
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}

function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;

        if (w > maxSize || h > maxSize) {
          if (w > h) {
            h = Math.round((h * maxSize) / w);
            w = maxSize;
          } else {
            w = Math.round((w * maxSize) / h);
            h = maxSize;
          }
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<Toast | null>(null);

  // Profile form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  }, []);

  const { data: profile, isLoading } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  });

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      setFirstName(profile.name);
      setLastName(profile.lastname);
      setTimezone(profile.timezone);
      setCity(profile.city);
      setState(profile.state);
      setCountry(profile.country);
    }
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: async (data: Record<string, string | undefined>) => {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const text = await res.text();
        try {
          const err = JSON.parse(text);
          throw new Error(err.error || 'Failed to update profile');
        } catch {
          throw new Error('Failed to update profile');
        }
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      showToast('Profile updated successfully!', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const uploadPhoto = useMutation({
    mutationFn: async (photo: string) => {
      const res = await fetch('/api/profile/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo }),
      });
      if (!res.ok) {
        const text = await res.text();
        try {
          const err = JSON.parse(text);
          throw new Error(err.error || 'Failed to upload photo');
        } catch {
          throw new Error('Failed to upload photo');
        }
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      showToast('Photo updated!', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await resizeImage(file, 200);
      uploadPhoto.mutate(base64);
    } catch {
      showToast('Failed to process image.', 'error');
    }

    // Reset so the same file can be selected again
    e.target.value = '';
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate({
      name: firstName,
      lastname: lastName,
      timezone,
      city,
      state,
      country,
    });
  };

  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword) {
      showToast('Current password is required.', 'error');
      return;
    }
    if (!newPassword) {
      showToast('New password is required.', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('New password must be at least 6 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match.', 'error');
      return;
    }

    updateProfile.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        },
      },
    );
  };

  const initials = profile
    ? `${(profile.name?.[0] ?? '').toUpperCase()}${(profile.lastname?.[0] ?? '').toUpperCase()}`
    : session?.user?.name
      ? session.user.name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : '??';

  if (isLoading) {
    return (
      <>
        <Header title="My Profile" />
        <div className="flex items-center justify-center p-16">
          <Loading size="lg" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="My Profile" />

      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              {/* Photo */}
              <button
                type="button"
                onClick={handlePhotoClick}
                className="group relative flex h-[120px] w-[120px] shrink-0 items-center justify-center overflow-hidden rounded-full border-2 transition-colors"
                style={{
                  borderColor: 'var(--accent)',
                  backgroundColor: 'var(--accent-subtle)',
                }}
              >
                {profile?.photo ? (
                  <img
                    src={profile.photo}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span
                    className="text-3xl font-bold"
                    style={{ color: 'var(--accent)' }}
                  >
                    {initials}
                  </span>
                )}
                {/* Hover overlay */}
                <div
                  className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                >
                  <Camera className="h-6 w-6 text-white" />
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Name & info */}
              <div className="min-w-0 flex-1">
                <h2
                  className="text-2xl font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {profile?.name} {profile?.lastname}
                </h2>
                <p
                  className="mt-1 text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {profile?.email}
                </p>
                <div className="mt-2">
                  <Badge variant="default">{profile?.roleName}</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="mb-5 flex items-center gap-2">
              <User className="h-5 w-5" style={{ color: 'var(--accent)' }} />
              <h3
                className="text-lg font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Personal Information
              </h3>
            </div>

            <form onSubmit={handleSaveProfile}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="firstName" className="mb-1.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>
                    First Name
                  </Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName" className="mb-1.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Last Name
                  </Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                  />
                </div>
                <div>
                  <Label htmlFor="timezone" className="mb-1.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Timezone
                  </Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="city" className="mb-1.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>
                    City
                  </Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                  />
                </div>
                <div>
                  <Label htmlFor="state" className="mb-1.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>
                    State
                  </Label>
                  <Input
                    id="state"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="State"
                  />
                </div>
                <div>
                  <Label htmlFor="country" className="mb-1.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Country
                  </Label>
                  <Input
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Country"
                  />
                </div>
              </div>

              <div className="mt-5">
                <Button
                  type="submit"
                  disabled={updateProfile.isPending}
                >
                  <Save className="h-4 w-4" />
                  {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="mb-5 flex items-center gap-2">
              <Lock className="h-5 w-5" style={{ color: 'var(--accent)' }} />
              <h3
                className="text-lg font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Change Password
              </h3>
            </div>

            <form onSubmit={handleSavePassword}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="currentPassword" className="mb-1.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Current Password
                  </Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                  />
                </div>
                <div>
                  <Label htmlFor="newPassword" className="mb-1.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>
                    New Password
                  </Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                  />
                </div>
                <div>
                  <Label htmlFor="confirmPassword" className="mb-1.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Confirm New Password
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>

              <div className="mt-5">
                <Button
                  type="submit"
                  disabled={updateProfile.isPending}
                >
                  <Lock className="h-4 w-4" />
                  {updateProfile.isPending ? 'Saving...' : 'Save Password'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="mb-5 flex items-center gap-2">
              <Calendar className="h-5 w-5" style={{ color: 'var(--accent)' }} />
              <h3
                className="text-lg font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                My Schedule
              </h3>
            </div>

            {profile?.schedule && profile.schedule.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      className="border-b"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <th
                        className="px-4 py-3 text-left font-semibold"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Day
                      </th>
                      <th
                        className="px-4 py-3 text-left font-semibold"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Start Time
                      </th>
                      <th
                        className="px-4 py-3 text-left font-semibold"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        End Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.schedule.map((entry) => (
                      <tr
                        key={entry.day}
                        className="border-b last:border-b-0"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <td
                          className="px-4 py-3 font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {entry.day}
                        </td>
                        <td
                          className="px-4 py-3"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {entry.startTime}
                        </td>
                        <td
                          className="px-4 py-3"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {entry.endTime}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <Calendar
                  className="mb-3 h-10 w-10"
                  style={{ color: 'var(--text-muted)' }}
                />
                <p
                  className="text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  No schedule assigned yet. Contact your admin.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {toast && (
        <ToastNotification toast={toast} onClose={() => setToast(null)} />
      )}
    </>
  );
}
