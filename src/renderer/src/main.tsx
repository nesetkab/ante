import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { surface } from './ante'
import { ChromeSurface } from './chrome/ChromeSurface'
import { OverlaySurface } from './overlay/OverlaySurface'
import { store, useLoaded } from './store'
import { ThemeRoot } from './components/ThemeRoot'
import './styles/global.css'

function App() {
  const loaded = useLoaded()
  if (!loaded) return null
  return <ThemeRoot>{surface === 'overlay' ? <OverlaySurface /> : <ChromeSurface />}</ThemeRoot>
}

document.documentElement.dataset.surface = surface
store.start()

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
