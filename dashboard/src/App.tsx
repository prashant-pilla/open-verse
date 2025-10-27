import { useEffect, useMemo, useState } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { Aurora } from './components/Aurora'
import { FloatingParticles } from './components/FloatingParticles'
import { CursorTrail } from './components/CursorTrail'
import { MagneticCard } from './components/MagneticCard'
import { Tooltip } from './components/Tooltip'
import { Logo } from './components/Logo'
import { Skeleton } from './components/Skeleton'
import { GlassCard } from './components/ui/Card'
import { Badge } from './components/ui/Badge'
import { ThemeToggle } from './components/ThemeToggle'
import { AnimatedCounter } from './components/AnimatedCounter'
import { TrendingUp, BadgeDollarSign, Activity, Zap, Info } from 'lucide-react'
import { Sparkline } from './components/Sparkline'

type LeaderboardRow = { model: string; equity_usd: number; ts: number }
type OrdersRow = { ts: number; model: string; symbol: string; side: string; notional_usd: number; status: string }

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'https://open-verse.onrender.com').replace(/\/+$/, '')

async function fetchJSON<T>(path: string): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function useSpx() {
  const [data, setData] = useState<{ prices: number[]; timestamps: number[]; changePct: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const d = await fetchJSON<{ prices: number[]; timestamps: number[]; changePct: number }>(`/spx`)
        if (mounted) setData(d)
      } catch (e) {
        if (mounted) setError('failed')
      }
    }
    load()
    const id = setInterval(load, 30000)
    return () => { mounted = false; clearInterval(id) }
  }, [])
  return { data, error }
}

function useArenaData(refreshMs: number) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [pnl, setPnl] = useState<Record<string, number>>({})
  const [orders, setOrders] = useState<OrdersRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        setError(null)
        const [lb, pn, od] = await Promise.all([
          fetchJSON<{ rows: LeaderboardRow[] }>('/leaderboard'),
          fetchJSON<{ realized: Record<string, number> }>('/pnl'),
          fetchJSON<{ rows: OrdersRow[] }>('/orders'),
        ])
        if (!mounted) return
        setLeaderboard(lb.rows || [])
        setPnl(pn.realized || {})
        setOrders(od.rows || [])
        setLoading(false)
      } catch (e: any) {
        if (!mounted) return
        setError(e?.message || 'Failed to load')
        setLoading(false)
      }
    }
    load()
    const id = setInterval(load, refreshMs)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [refreshMs])

  return { leaderboard, pnl, orders, loading, error }
}

function App() {
  const { leaderboard, pnl, orders, loading, error } = useArenaData(5000)
  const { data: spx } = useSpx()
  const { scrollYProgress } = useScroll()
  const headerY = useTransform(scrollYProgress, [0, 0.1], [0, -10])
  const headerOpacity = useTransform(scrollYProgress, [0, 0.1], [1, 0.8])

  const totalModels = leaderboard.length
  const totalEquity = useMemo(() => leaderboard.reduce((s, r) => s + (r.equity_usd || 0), 0), [leaderboard])

  return (
    <div className="min-h-screen bg-black noise-overlay">
      <Aurora />
      <FloatingParticles />
      <CursorTrail />
      <motion.header 
        className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-black/80 border-b border-neutral-800/50"
        style={{ y: headerY, opacity: headerOpacity }}
      >
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <Logo size={22} />
            <div className="text-lg font-semibold text-neutral-100">Open‑Verse Arena</div>
            <Badge variant="success" className="hidden sm:inline-flex">
              <Zap className="w-3 h-3 mr-1" />
              Live
            </Badge>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            {spx && (
              <div className="hidden md:flex items-center gap-3 mr-4">
                <div className={`font-mono text-xs ${spx.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  S&P: {spx.changePct >= 0 ? '+' : ''}{spx.changePct.toFixed(2)}%
                </div>
                <div className="w-32 h-6 opacity-80">
                  <Sparkline data={spx.prices.slice(-50)} color={spx.changePct >= 0 ? '#34d399' : '#f87171'} />
                </div>
              </div>
            )}
            <div className="text-sm text-neutral-500 hidden sm:block font-mono text-xs">PAPER TRADING</div>
            <ThemeToggle />
          </motion.div>
        </div>
      </motion.header>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-100">Leaderboard</h1>
          <p className="text-neutral-500 text-sm mt-1 font-mono">Comparing LLM models and baselines in real time</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          <MagneticCard>
            <GlassCard>
              <div className="flex items-center justify-between p-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-neutral-500 uppercase tracking-wider font-mono">
                    Models
                    <Tooltip content="Number of active trading models">
                      <Info className="w-3 h-3 cursor-help" />
                    </Tooltip>
                  </div>
                  <AnimatedCounter value={totalModels} decimals={0} className="text-3xl font-bold text-emerald-400 mt-1" />
                </div>
                <TrendingUp className="w-8 h-8 text-emerald-500/20" />
              </div>
            </GlassCard>
          </MagneticCard>
          <MagneticCard>
            <GlassCard>
              <div className="flex items-center justify-between p-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-neutral-500 uppercase tracking-wider font-mono">
                    Total Equity
                    <Tooltip content="Combined equity across all models">
                      <Info className="w-3 h-3 cursor-help" />
                    </Tooltip>
                  </div>
                  <AnimatedCounter value={totalEquity} decimals={2} prefix="$" className="text-3xl font-bold text-cyan-400 mt-1" />
                </div>
                <BadgeDollarSign className="w-8 h-8 text-cyan-500/20" />
              </div>
            </GlassCard>
          </MagneticCard>
          <MagneticCard>
            <GlassCard>
              <div className="flex items-center justify-between p-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-neutral-500 uppercase tracking-wider font-mono">
                    Orders
                    <Tooltip content="Recent orders placed by all models">
                      <Info className="w-3 h-3 cursor-help" />
                    </Tooltip>
                  </div>
                  <AnimatedCounter value={orders.length} decimals={0} className="text-3xl font-bold text-neutral-200 mt-1" />
                </div>
                <Activity className="w-8 h-8 text-neutral-700/50" />
              </div>
            </GlassCard>
          </MagneticCard>
        </motion.div>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <GlassCard
              title={<div className="flex items-center gap-2 text-neutral-200"><TrendingUp className="size-4 text-emerald-500/70"/> Equity by Model</div>}
              right={<>{loading && <div className="text-xs text-neutral-500 font-mono">Loading…</div>}{error && <div className="text-xs text-red-400">{error}</div>}</>}
            >
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800/50">
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider font-mono">Model</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider font-mono">Equity</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider font-mono">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td className="px-4 py-2" colSpan={3}><Skeleton className="h-6" /></td>
                    </tr>
                  )}
                  {!loading && leaderboard.map((r, idx) => (
                    <motion.tr 
                      key={r.model} 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="hover:bg-neutral-900/30 transition-colors group"
                    >
                      <td className="px-4 py-2 font-medium text-neutral-300 group-hover:text-emerald-400 transition-colors">{r.model}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-3">
                          <AnimatedCounter value={r.equity_usd} decimals={2} prefix="$" className="font-mono text-neutral-200" />
                          <span className="text-neutral-700">·</span>
                          <Sparkline data={[r.equity_usd*0.98, r.equity_usd*0.99, r.equity_usd*1.01, r.equity_usd]} />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-neutral-500 text-xs font-mono">{new Date(r.ts).toLocaleTimeString()}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
            </GlassCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <GlassCard title={<div className="flex items-center gap-2 text-neutral-200"><BadgeDollarSign className="size-4 text-cyan-500/70"/> Realized PnL</div>}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800/50">
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider font-mono">Model</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider font-mono">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td className="px-4 py-2" colSpan={2}><Skeleton className="h-6" /></td>
                    </tr>
                  )}
                  {!loading && Object.entries(pnl).map(([model, value], idx) => (
                    <motion.tr 
                      key={model} 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="hover:bg-neutral-900/30 transition-colors group"
                    >
                      <td className="px-4 py-2 font-medium text-neutral-300 group-hover:text-cyan-400 transition-colors">{model}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <AnimatedCounter 
                            value={Math.abs(value)} 
                            decimals={2} 
                            prefix={value >= 0 ? '+$' : '-$'} 
                            className={`font-mono font-semibold ${value >= 0 ? 'text-emerald-400' : 'text-red-400'}`} 
                          />
                          <Badge variant={value >= 0 ? 'success' : 'error'} className="text-xs">
                            {value >= 0 ? '↑' : '↓'}
                          </Badge>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
            </GlassCard>
          </motion.div>
        </section>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard title={<div className="flex items-center gap-2 text-neutral-200"><Activity className="size-4 text-neutral-500"/> Recent Orders</div>}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800/50">
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider font-mono">Time</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider font-mono">Model</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider font-mono">Symbol</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider font-mono">Side</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider font-mono">Notional</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider font-mono">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="px-4 py-2" colSpan={6}><Skeleton className="h-6" /></td>
                  </tr>
                )}
                {!loading && orders.map((o, i) => {
                  const statusVariant = o.status === 'filled' ? 'success' : o.status === 'pending' ? 'warning' : o.status === 'rejected' ? 'error' : 'default'
                  return (
                    <motion.tr 
                      key={i} 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="hover:bg-neutral-900/30 transition-colors group"
                    >
                      <td className="px-4 py-2 text-neutral-500 text-xs font-mono">{new Date(o.ts).toLocaleTimeString()}</td>
                      <td className="px-4 py-2 font-medium text-sm text-neutral-300 group-hover:text-emerald-400 transition-colors">{o.model}</td>
                      <td className="px-4 py-2 font-mono text-sm text-neutral-400">{o.symbol}</td>
                      <td className="px-4 py-2">
                        <Badge variant={o.side.toLowerCase() === 'buy' ? 'success' : 'error'} className="text-xs">
                          {o.side.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 font-mono text-sm text-neutral-300">${o.notional_usd.toFixed(2)}</td>
                      <td className="px-4 py-2">
                        <Badge variant={statusVariant} className="text-xs">
                          {o.status}
                        </Badge>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </GlassCard>
        </motion.div>
      </main>

      <footer className="mt-12 border-t border-neutral-800/50 bg-black/60 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3"
            >
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                />
                <span className="text-sm text-neutral-500 font-mono text-xs">SYSTEM ONLINE</span>
              </div>
              <span className="text-neutral-700">•</span>
              <span className="text-xs text-neutral-600 font-mono">REFRESH 5s</span>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-neutral-600 font-mono"
            >
              REACT • TAILWIND • FRAMER
            </motion.div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
