'use server'

import { cookies } from 'next/headers'

/** Clear the __vdpl cookie so subsequent requests use the latest deployment. */
export async function clearDeploymentPin() {
  const cookieStore = await cookies()
  cookieStore.delete('__vdpl')
}
