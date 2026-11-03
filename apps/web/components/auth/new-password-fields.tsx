'use client'

import { useState } from 'react'
import { PasswordToggle } from '@/components/auth/password-toggle'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function NewPasswordFields({
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmPasswordChange,
}: Readonly<{
  password: string
  confirmPassword: string
  onPasswordChange: (value: string) => void
  onConfirmPasswordChange: (value: string) => void
}>) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="At least 6 characters"
            required
            autoFocus
            className="pr-field-end"
          />
          <PasswordToggle
            shown={showPassword}
            onToggle={() => setShowPassword(!showPassword)}
            label="passwords"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => onConfirmPasswordChange(e.target.value)}
          placeholder="Repeat your password"
          required
        />
      </div>
    </>
  )
}
