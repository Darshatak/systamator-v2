import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './styles/index.css'
import { agentSeedDefaults, dbStatus } from './lib/api'

// Boot-time housekeeping: when Postgres is reachable, ensure the default
// agent roster is seeded. Idempotent (ON CONFLICT DO UPDATE), so safe on
// every cold start. Best-effort — failures are logged, not fatal.
;(async () => {
  try {
    const s = await dbStatus()
    if (s.connected) {
      const n = await agentSeedDefaults()
      console.log(`[boot] seeded ${n} agents`)
    } else {
      console.warn('[boot] Postgres not connected:', s.message)
    }
  } catch (e) { console.warn('[boot] seed skipped:', e) }
})()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
