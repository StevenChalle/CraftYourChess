import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { formatDate, formatGameCount, formatNumber, formatSigned } from '@/lib/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { peakPoint, type RatingPoint } from './history'

const HEIGHT = 180
/** Room for the rating labels on the left, and for the last point on the right */
const PAD_LEFT = 40
const PAD_RIGHT = 10
/** Room above the curve, and below it for the dates */
const PAD_TOP = 12
const PAD_BOTTOM = 22
/** Beyond this many days played, no dots: the curve alone */
const MAX_DOTS = 200
/** Smallest span of ratings shown, so a few points of change do not look like a cliff */
const MIN_SPAN = 40

/** Rounded bounds around the ratings, a little room above and below. */
function ratingScale(points: RatingPoint[]) {
  const ratings = points.map((point) => point.rating)
  let low = Math.min(...ratings)
  let high = Math.max(...ratings)
  if (high - low < MIN_SPAN) {
    const middle = (low + high) / 2
    low = middle - MIN_SPAN / 2
    high = middle + MIN_SPAN / 2
  }
  const room = (high - low) * 0.1
  return { low: Math.floor((low - room) / 10) * 10, high: Math.ceil((high + room) / 10) * 10 }
}

/**
 * The player's rating day by day over [from, to], in the style of the evaluation chart: one curve
 * in the accent color over the field, a dot per day played (up to MAX_DOTS), three rating lines,
 * the period's dates below. Hovering shows the nearest day (its rating, the change since the day
 * played before it, its number of games when known); on a phone, a tap or a sliding finger does.
 */
export function RatingChart({
  points,
  from,
  to,
}: {
  points: RatingPoint[]
  from: number
  to: number
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | undefined>(undefined)
  const touching = useRef(false)

  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const { low, high } = ratingScale(points)
  const span = Math.max(to - from, 1)
  const x = (time: number) => PAD_LEFT + ((time - from) / span) * (width - PAD_LEFT - PAD_RIGHT)
  const y = (rating: number) =>
    PAD_TOP + ((high - rating) / (high - low)) * (HEIGHT - PAD_TOP - PAD_BOTTOM)
  const bottom = HEIGHT - PAD_BOTTOM
  const curve = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.day)} ${y(point.rating)}`)
    .join(' ')
  const first = points[0]
  const last = points.at(-1)
  const area =
    first && last ? `${curve} L${x(last.day)} ${bottom} L${x(first.day)} ${bottom} Z` : ''
  const levels = [high, Math.round((high + low) / 2), low]
  const peak = peakPoint(points)

  /** The point nearest to the pointer, by date. */
  const nearest = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const time =
      from + ((event.clientX - box.left - PAD_LEFT) / (box.width - PAD_LEFT - PAD_RIGHT)) * span
    let best = 0
    points.forEach((point, index) => {
      if (Math.abs(point.day - time) < Math.abs(points[best]!.day - time)) best = index
    })
    return best
  }

  const point = active === undefined ? undefined : points[active]
  const previous = active === undefined || active === 0 ? undefined : points[active - 1]
  // The tooltip sits on the side of the point with the most room.
  const tipOnLeft = point !== undefined && x(point.day) > width / 2

  return (
    <div ref={wrapRef} className="relative">
      <svg
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={m.rating_chart_label()}
        className="block cursor-crosshair touch-pan-y rounded-md border border-border bg-field select-none"
        onPointerMove={(event) => {
          if (event.pointerType === 'mouse' || touching.current) setActive(nearest(event))
        }}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse') return
          touching.current = true
          setActive(nearest(event))
        }}
        onPointerUp={() => (touching.current = false)}
        onPointerCancel={() => (touching.current = false)}
        onPointerLeave={(event) => event.pointerType === 'mouse' && setActive(undefined)}
      >
        {width > 0 && (
          <>
            {levels.map((level) => (
              <g key={level}>
                <line
                  x1={PAD_LEFT}
                  x2={width - PAD_RIGHT}
                  y1={y(level)}
                  y2={y(level)}
                  className="stroke-border"
                />
                <text
                  x={PAD_LEFT - 6}
                  y={y(level) + 3}
                  textAnchor="end"
                  className="num fill-muted-foreground text-[10px]"
                >
                  {formatNumber(level)}
                </text>
              </g>
            ))}
            <text x={PAD_LEFT} y={HEIGHT - 6} className="fill-muted-foreground text-[10px]">
              {formatDate(new Date(from))}
            </text>
            <text
              x={width - PAD_RIGHT}
              y={HEIGHT - 6}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {formatDate(new Date(to))}
            </text>
            <path d={area} className="fill-primary/10" />
            <path
              d={curve}
              fill="none"
              strokeWidth={1.5}
              strokeLinejoin="round"
              className="stroke-primary"
            />
            {/* A dot per day, while they stay apart: a whole career would blur the curve. */}
            {points.length <= MAX_DOTS &&
              points.map((item) => (
                <circle
                  key={item.day}
                  cx={x(item.day)}
                  cy={y(item.rating)}
                  r={points.length > 120 ? 2 : 3}
                  className="fill-primary"
                />
              ))}
            {/* The period's peak: a ring around its point */}
            {peak && (
              <circle
                cx={x(peak.day)}
                cy={y(peak.rating)}
                r={5.5}
                strokeWidth={1.5}
                className="fill-none stroke-primary"
              />
            )}
            {point && (
              <>
                <line
                  x1={x(point.day)}
                  x2={x(point.day)}
                  y1={PAD_TOP}
                  y2={bottom}
                  className="stroke-text-strong/40"
                />
                <circle
                  cx={x(point.day)}
                  cy={y(point.rating)}
                  r={4}
                  strokeWidth={2}
                  className="fill-primary stroke-field"
                />
              </>
            )}
          </>
        )}
      </svg>
      {point && width > 0 && (
        <div
          className="pointer-events-none absolute top-2 z-10 w-max rounded-md border border-border bg-popover p-2 shadow-pop"
          style={tipOnLeft ? { right: width - x(point.day) + 12 } : { left: x(point.day) + 12 }}
        >
          <p className="text-xs text-muted-foreground">{formatDate(new Date(point.day))}</p>
          <p className="num flex items-baseline gap-2 text-sm">
            <span className="font-medium text-text-strong">{formatNumber(point.rating)}</span>
            {previous && point.rating !== previous.rating && (
              <span className={cn(point.rating > previous.rating ? 'text-win' : 'text-loss')}>
                {formatSigned(point.rating - previous.rating)}
              </span>
            )}
          </p>
          {point.games !== undefined && (
            <p className="text-xs text-muted-foreground">{formatGameCount(point.games)}</p>
          )}
        </div>
      )}
    </div>
  )
}
