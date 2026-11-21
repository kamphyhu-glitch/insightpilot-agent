import { isFragmentsPlaygroundEnabled } from '@/lib/deployment-mode'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

export default function PlaygroundLayout({ children }: { children: ReactNode }) {
  if (!isFragmentsPlaygroundEnabled()) notFound()

  return children
}
