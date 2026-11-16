import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
)
const shellMock = vi.hoisted(() => vi.fn((_props: unknown) => null))
const getStudentsPage = vi.hoisted(() => vi.fn())
const getCourses = vi.hoisted(() => vi.fn())
const getGroupOptions = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('./students-page-shell', () => ({ StudentsPageShell: shellMock }))
vi.mock('../queries', () => ({
  PAGE_SIZE: 25,
  getStudentsPage,
  getCourses,
  getGroupOptions,
}))

import { StudentsContent } from './students-content'

const GROUP = '3f2b8c1e-5a4d-4e7b-9c6a-1d2e3f4a5b6c'

describe('StudentsContent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    redirectMock.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`)
    })
    getCourses.mockResolvedValue([])
    getGroupOptions.mockResolvedValue([])
  })

  it('redirects to the last page preserving every filter when page exceeds total pages', async () => {
    getStudentsPage.mockResolvedValue({ rows: [], totalCount: 60 })
    await expect(
      StudentsContent({
        filters: {
          status: 'active',
          role: 'student',
          group: GROUP,
          search: 'ann',
          page: 9,
        },
        tab: 'students',
      }),
    ).rejects.toThrow(
      `NEXT_REDIRECT:/app/admin/students?status=active&role=student&group=${GROUP}&search=ann&page=3`,
    )
  })

  it('redirects to the bare list without a page param when there are no results', async () => {
    getStudentsPage.mockResolvedValue({ rows: [], totalCount: 0 })
    await expect(StudentsContent({ filters: { page: 2 }, tab: 'students' })).rejects.toThrow(
      'NEXT_REDIRECT:/app/admin/students?',
    )
  })

  it('keeps tab=groups in the past-end redirect', async () => {
    getStudentsPage.mockResolvedValue({ rows: [], totalCount: 60 })
    await expect(
      StudentsContent({ filters: { status: 'active', page: 9 }, tab: 'groups' }),
    ).rejects.toThrow('NEXT_REDIRECT:/app/admin/students?tab=groups&status=active&page=3')
  })

  it('renders the shell with fetched data when page is within range', async () => {
    getStudentsPage.mockResolvedValue({ rows: [{ id: 'u1' }], totalCount: 25 })
    getGroupOptions.mockResolvedValue([{ id: GROUP, name: 'G' }])
    render(await StudentsContent({ filters: { page: 1 }, tab: 'students' }))
    expect(redirectMock).not.toHaveBeenCalled()
    expect(shellMock.mock.calls[0]?.[0]).toMatchObject({
      students: [{ id: 'u1' }],
      groups: [{ id: GROUP, name: 'G' }],
      page: 1,
      totalCount: 25,
      pageSize: 25,
    })
  })
})
