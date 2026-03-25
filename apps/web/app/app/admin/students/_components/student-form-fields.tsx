'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Props = {
  isEdit: boolean
  isPending: boolean
  email: string
  fullName: string
  role: string
  tempPassword: string
  onEmailChange: (value: string) => void
  onFullNameChange: (value: string) => void
  onRoleChange: (value: string) => void
  onTempPasswordChange: (value: string) => void
}

export function StudentFormFields({
  isEdit,
  isPending,
  email,
  fullName,
  role,
  tempPassword,
  onEmailChange,
  onFullNameChange,
  onRoleChange,
  onTempPasswordChange,
}: Readonly<Props>) {
  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          disabled={isEdit || isPending}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => onFullNameChange(e.target.value)}
          disabled={isPending}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="role">Role</Label>
        <Select
          value={role}
          onValueChange={(v) => {
            if (v) onRoleChange(v)
          }}
          disabled={isPending}
          items={[
            ...(isEdit ? [{ value: 'admin', label: 'Admin' }] : []),
            { value: 'instructor', label: 'Instructor' },
            { value: 'student', label: 'Student' },
          ]}
        >
          <SelectTrigger id="role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {isEdit && <SelectItem value="admin">Admin</SelectItem>}
            <SelectItem value="instructor">Instructor</SelectItem>
            <SelectItem value="student">Student</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isEdit && (
        <div className="grid gap-2">
          <Label htmlFor="tempPassword">Temporary password</Label>
          <Input
            id="tempPassword"
            type="text"
            value={tempPassword}
            onChange={(e) => onTempPasswordChange(e.target.value)}
            disabled={isPending}
            minLength={6}
            required
          />
        </div>
      )}
    </div>
  )
}
