import { useEffect } from 'react'
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import { ThemeProvider } from './components/theme-provider'
import { TooltipProvider } from '@multica/ui/components/ui/tooltip'
import { Toaster } from './components/toaster'
import Layout from './pages/layout'
import HomePage from './pages/home'
import ChatPage from './pages/chat'
import ToolsPage from './pages/tools'
import SkillsPage from './pages/skills'
import ChannelsPage from './pages/channels'
import CronsPage from './pages/crons'
import OnboardingPage from './pages/onboarding'
import { useOnboardingStore } from './stores/onboarding'
import { useProviderStore } from './stores/provider'
import { useChannelsStore } from './stores/channels'
import { useSkillsStore } from './stores/skills'
import { useToolsStore } from './stores/tools'
import { useCronJobsStore } from './stores/cron-jobs'

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const completed = useOnboardingStore((s) => s.completed)
  if (!completed) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

const router = createHashRouter([
  {
    path: '/onboarding',
    element: <OnboardingPage />,
  },
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: (
          <OnboardingGuard>
            <HomePage />
          </OnboardingGuard>
        ),
      },
      { path: 'chat', element: <ChatPage /> },
      { path: 'tools', element: <ToolsPage /> },
      { path: 'skills', element: <SkillsPage /> },
      { path: 'channels', element: <ChannelsPage /> },
      { path: 'crons', element: <CronsPage /> },
    ],
  },
])

export default function App() {
  useEffect(() => {
    // Prefetch global data at app startup
    useProviderStore.getState().fetch()
    useChannelsStore.getState().fetch()
    useSkillsStore.getState().fetch()
    useToolsStore.getState().fetch()
    useCronJobsStore.getState().fetch()
  }, [])

  return (
    <ThemeProvider defaultTheme="system" storageKey="multica-theme">
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  )
}
