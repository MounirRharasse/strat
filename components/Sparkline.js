export default function Sparkline({ data, couleur = '#60a5fa', width = 60, height = 16 }) {
  if (!data || data.length === 0) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min

  const yFor = (v) => {
    if (range === 0) return height / 2
    return height - 1 - ((v - min) / range) * (height - 2)
  }

  const stepX = data.length > 1 ? width / (data.length - 1) : 0
  const points = data.map((v, i) => `${i * stepX},${yFor(v)}`)
  const path = 'M ' + points.join(' L ')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="inline-block">
      <path
        d={path}
        fill="none"
        stroke={couleur}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
