import { type RefObject, useEffect, useRef } from "react"

/**
 * Auto-scrolls a scroll container to the bottom when its inner content grows,
 * as long as the user hasn't scrolled up to read older content.
 *
 * Observes child element size changes via ResizeObserver on all children,
 * plus MutationObserver for added/removed nodes. Works for new messages,
 * history loads, streaming updates, and image loads.
 */
export function useAutoScroll(ref: RefObject<HTMLElement | null>) {
  const stickRef = useRef(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const scrollToBottom = () => {
      el.scrollTo({ top: el.scrollHeight })
    }

    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      stickRef.current = scrollHeight - scrollTop - clientHeight < 50
    }

    const onContentChange = () => {
      if (stickRef.current) {
        scrollToBottom()
      }
    }

    // Watch child element resizes (content growth, image loads, streaming)
    const ro = new ResizeObserver(onContentChange)
    for (const child of el.children) {
      ro.observe(child)
    }

    // Watch for added/removed child nodes (new messages rendered)
    const mo = new MutationObserver((mutations) => {
      // Also observe newly added elements
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            ro.observe(node)
          }
        }
      }
      onContentChange()
    })
    mo.observe(el, { childList: true, subtree: true })

    el.addEventListener("scroll", onScroll, { passive: true })

    // Initial scroll to bottom
    scrollToBottom()

    return () => {
      el.removeEventListener("scroll", onScroll)
      ro.disconnect()
      mo.disconnect()
    }
  }, [ref])
}
