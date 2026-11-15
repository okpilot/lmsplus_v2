import { z } from 'zod'
import { parsePageParam } from '@/lib/utils/parse-page-param'
import type { StudentFilters } from './types'

const STATUS_VALUES = ['active', 'inactive'] as const
const ROLE_VALUES = ['admin', 'instructor', 'student'] as const
const SEARCH_MAX = 200

type Params = Record<string, string | string[] | undefined>

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' ? allowed.find((a) => a === value) : undefined
}

function parseGroup(value: unknown): string | undefined {
  const parsed = z.uuid().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function parseSearch(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.trim().slice(0, SEARCH_MAX).trim() || undefined
}

export function parseFilters(params: Params): StudentFilters & { page: number } {
  return {
    status: oneOf(params.status, STATUS_VALUES),
    role: oneOf(params.role, ROLE_VALUES),
    search: parseSearch(params.search),
    group: parseGroup(params.group),
    page: parsePageParam(params.page),
  }
}
