// Modified for InsightPilot from E2B Fragments.
import { AnalysisWorkspace } from '@/components/analysis/workspace'
import { isLiveAnalysisEnabled } from '@/lib/deployment-mode'
import './workspace.css'

export const dynamic = 'force-dynamic'

export default function Home() {
  return <AnalysisWorkspace liveEnabled={isLiveAnalysisEnabled()} />
}
