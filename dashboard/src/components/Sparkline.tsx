type Props = {
  data: number[]
  width?: number
  height?: number
  stroke?: string
  color?: string
}

export function Sparkline({ data, width = 120, height = 32, stroke = 'currentColor', color }: Props) {
  if (!data || data.length === 0) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const stepX = width / Math.max(1, data.length - 1)
  const points = data.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  })
  const d = `M ${points[0]} L ${points.slice(1).join(' ')}`
  const last = data[data.length - 1]
  const first = data[0]
  const up = last - first >= 0
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={d} fill="none" stroke={color ?? stroke} strokeWidth={1.8} opacity={0.9} />
      <circle cx={width} cy={height - ((last - min) / range) * height} r={2} fill={color ?? (up ? '#10B981' : '#F43F5E')} />
    </svg>
  )
}


