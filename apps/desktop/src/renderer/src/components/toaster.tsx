import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  Alert02Icon,
  MultiplicationSignCircleIcon,
  Loading03Icon,
} from '@hugeicons/core-free-icons'
import { useTheme } from './theme-provider'

export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps['theme']}
      className="toaster group"
      icons={{
        success: (
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            strokeWidth={2}
            className="size-4 text-emerald-500"
          />
        ),
        info: (
          <HugeiconsIcon
            icon={InformationCircleIcon}
            strokeWidth={2}
            className="size-4 text-blue-500"
          />
        ),
        warning: (
          <HugeiconsIcon
            icon={Alert02Icon}
            strokeWidth={2}
            className="size-4 text-amber-500"
          />
        ),
        error: (
          <HugeiconsIcon
            icon={MultiplicationSignCircleIcon}
            strokeWidth={2}
            className="size-4 text-red-500"
          />
        ),
        loading: (
          <HugeiconsIcon
            icon={Loading03Icon}
            strokeWidth={2}
            className="size-4 text-muted-foreground animate-spin"
          />
        ),
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}
