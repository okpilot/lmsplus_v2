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

const BASE_ROLE_ITEMS = [
  { value: 'instructor', label: 'Instructor' },
  { value: 'student', label: 'Student' },
]

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
  const roleItems = isEdit
    ? [{ value: 'admin', label: 'Admin' }, ...BASE_ROLE_ITEMS]
    : BASE_ROLE_ITEMS

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
          items={roleItems}
        >
          <SelectTrigger id="role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roleItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
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
