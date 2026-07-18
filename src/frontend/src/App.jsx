import { useRef, useEffect } from 'react'
import StatusBar from './components/StatusBar'

export default function App() {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return
    const updateDimensions = () => {
      if (!containerRef.current) return
      const height = containerRef.current.scrollHeight
      const width = containerRef.current.scrollWidth
      window.electronAPI?.updateContentDimensions?.({ width, height })
    }
    const ro = new ResizeObserver(updateDimensions)
    ro.observe(containerRef.current)
    updateDimensions()
    const mo = new MutationObserver(updateDimensions)
    mo.observe(containerRef.current, { childList: true, subtree: true, attributes: true, characterData: true })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [])

  return (
    <div ref={containerRef} className="min-h-0 select-none">
      <StatusBar />
    </div>
  )
}
