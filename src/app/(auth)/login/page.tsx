'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@/lib/validators';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onSubmit(data: LoginInput) {
    setError(null);

    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        if (result.code === 'account-pending') {
          setError('Your account is pending activation. Please contact an admin.');
        } else if (result.code === 'rate-limited') {
          setError('Too many failed attempts. Please wait a few minutes and try again.');
        } else {
          setError('Invalid email or password');
        }
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('An unexpected error occurred. Please try again.');
    }
  }

  return (
    <div className="w-full max-w-md px-4">
      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8"
        style={{
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/pulse-icon.png" alt="PulseBC" width={64} height={64} className="mb-3" />
          <h1 className="text-4xl font-bold tracking-tight text-[var(--accent)]">
            Pulse<span className="text-[var(--text-primary)]">BC</span>
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Sign in to your account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              disabled={isSubmitting}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50"
              {...register('email')}
            />
            {errors.email && (
              <p className="mt-1.5 text-xs text-red-400">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]"
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                className="mb-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              disabled={isSubmitting}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50"
              {...register('password')}
            />
            {errors.password && (
              <p className="mt-1.5 text-xs text-red-400">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Server error */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3.5 py-2.5">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] transition-all hover:bg-[var(--accent-hover)] hover:shadow-lg hover:shadow-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-card)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {/* Create account */}
        <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-medium text-[var(--accent)] hover:underline">
            Create one
          </Link>
        </p>

        {/* Footer */}
        <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
          Benjamin Chaise &amp; Associates
        </p>
      </div>
    </div>
  );
}
