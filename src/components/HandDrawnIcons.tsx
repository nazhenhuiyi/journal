import type { ComponentType, ReactNode, SVGProps } from 'react'

export type HandDrawnIconProps = Omit<SVGProps<SVGSVGElement>, 'height' | 'width'> & {
  size?: number | string
  strokeWidth?: number | string
}

export type HandDrawnIcon = ComponentType<HandDrawnIconProps>

type IconFrameProps = HandDrawnIconProps & {
  children: ReactNode
}

function mergeClassName(className?: string) {
  return ['journal-doodle-icon', className].filter(Boolean).join(' ')
}

function IconFrame({ children, className, size = 24, strokeWidth = 2.35, ...props }: IconFrameProps) {
  return (
    <svg
      className={mergeClassName(className)}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke">
        {children}
      </g>
    </svg>
  )
}

export function BookOpen(props: HandDrawnIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4.05 5.72c2.35-.66 5.04-.18 7.15 1.5v11.12c-1.92-1.22-4.55-1.72-7.42-.95-.16-3.78-.08-7.86.27-11.67Z" />
      <path d="M19.95 5.98c-2.55-.78-5.34-.3-7.55 1.24v11.12c2.08-1.25 4.63-1.58 7.2-.78.32-3.55.36-7.7.35-11.58Z" />
      <path d="M6.15 8.62c1.05-.16 2.22.04 3.28.54" opacity="0.62" />
      <path d="M14.65 8.92c1.02-.38 2.12-.46 3.12-.22" opacity="0.62" />
      <path d="M6.18 11.92c1.12-.18 2.22.02 3.1.48" opacity="0.46" />
      <path d="M14.7 12.18c1.02-.4 2.05-.47 2.92-.2" opacity="0.46" />
    </IconFrame>
  )
}

export function CalendarDays(props: HandDrawnIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M6.42 4.2v2.58" />
      <path d="M17.48 4.05v2.72" />
      <path d="M4.02 6.72c4.58-.34 10.64-.3 15.9.04.36 3.4.34 8.52-.08 12.15-4.55.52-10.52.48-15.58-.08-.38-3.72-.42-8.42-.24-12.1Z" />
      <path d="M4.28 10.08c4.46.22 10.62.2 15.25-.08" />
      <path d="M7.58 13.72h.08" />
      <path d="M12 13.58h.08" />
      <path d="M16.38 13.84h.08" />
      <path d="M7.48 17.02h.08" />
      <path d="M12 16.9h.08" />
    </IconFrame>
  )
}

export function Image(props: HandDrawnIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4.08 5.32c4.5-.46 10.62-.38 15.72.12.42 3.55.4 8.34-.02 12.42-4.42.44-10.55.34-15.56-.16-.34-3.85-.42-8.32-.14-12.38Z" />
      <path d="M5.98 16.45c1.52-1.5 3.04-3.08 4.58-4.38.52-.44.98-.35 1.48.12l2.22 2.12" />
      <path d="M13.78 14.12c.78-.82 1.54-1.5 2.28-2.05.48-.36.94-.26 1.32.12.72.72 1.42 1.52 2.08 2.32" />
      <path d="M8.42 8.28c.58-.1 1.16.3 1.24.86.1.64-.3 1.14-.9 1.24-.66.1-1.16-.28-1.26-.88-.08-.58.34-1.1.92-1.22Z" />
    </IconFrame>
  )
}

export function PenLine(props: HandDrawnIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4.4 19.18c2.28-.08 4.62-.32 7.12-.72" opacity="0.64" />
      <path d="M5.12 16.55c3.2-3.92 7.14-8.02 10.92-11.42.76-.7 1.72-.54 2.32.22l.52.66c.56.72.42 1.56-.28 2.18-3.78 3.3-7.7 7.1-11.26 10.98l-2.95.48.73-3.1Z" />
      <path d="M14.72 6.08c1.06.72 1.92 1.58 2.55 2.58" opacity="0.58" />
      <path d="M6.45 16.28c.58.3 1.02.76 1.32 1.34" opacity="0.44" />
    </IconFrame>
  )
}

export function Settings(props: HandDrawnIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 3.78c.62 1.55 1.18 2.9 1.62 4.18 1.25-.66 2.58-1.28 4.02-1.86-.48 1.48-1.12 2.78-1.84 4.02 1.42.45 2.76 1.04 4 1.78-1.32.7-2.72 1.26-4.08 1.72.7 1.24 1.32 2.56 1.8 4.05-1.4-.58-2.75-1.2-4-1.88-.46 1.36-.98 2.7-1.6 4.08-.62-1.4-1.15-2.75-1.58-4.08-1.25.7-2.6 1.32-4.02 1.9.5-1.48 1.14-2.82 1.86-4.05-1.42-.46-2.78-1.02-4.02-1.72 1.28-.76 2.62-1.34 3.96-1.78-.72-1.25-1.36-2.6-1.84-4.08 1.48.6 2.84 1.22 4.06 1.9.45-1.28 1-2.65 1.66-4.2Z" />
      <path d="M12 9.48c1.42-.02 2.45.94 2.48 2.34.02 1.48-.92 2.55-2.34 2.58-1.52.02-2.56-.95-2.6-2.38-.02-1.46.94-2.52 2.46-2.54Z" />
    </IconFrame>
  )
}

export function Sparkles(props: HandDrawnIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12.08 3.9c.74 2.72 1.84 4.62 4.7 5.64-2.78 1.06-4.05 2.92-4.72 5.88-.82-2.92-1.98-4.78-4.86-5.84 2.9-1 4.06-2.88 4.88-5.68Z" />
      <path d="M5.45 14.75c.3 1.24.92 2.1 2.12 2.54-1.24.42-1.9 1.28-2.22 2.58-.34-1.28-.92-2.16-2.2-2.58 1.24-.48 1.88-1.3 2.3-2.54Z" />
      <path d="M18.2 14.35c.24.96.74 1.6 1.68 1.96-.96.34-1.5.98-1.78 1.98-.28-1-.76-1.64-1.72-1.96.96-.38 1.48-1 1.82-1.98Z" />
    </IconFrame>
  )
}

export function ArrowRight(props: HandDrawnIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4.22 12.12c4.46-.05 9.3-.16 15.2-.16" />
      <path d="M14.72 6.88c1.54 1.52 3.02 3.06 4.72 5.06-1.68 1.78-3.18 3.42-4.82 5.15" />
      <path d="M5.28 13.42c3.22-.15 6.75-.2 10.54-.1" opacity="0.36" />
    </IconFrame>
  )
}

export function Camera(props: HandDrawnIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M5.02 8.12c1.1-.1 2.08-.18 2.98-.2.36-.92.78-1.74 1.28-2.46 1.74-.18 3.55-.16 5.44.08.44.72.82 1.52 1.14 2.36 1.02.03 2.1.1 3.22.22.4 2.92.38 6.54-.04 9.42-4.42.54-9.92.48-14.08-.12-.42-2.78-.42-6.42.06-9.3Z"
        fill="currentColor"
        fillOpacity="0.2"
      />
      <path d="M5.02 8.12c1.1-.1 2.08-.18 2.98-.2.36-.92.78-1.74 1.28-2.46 1.74-.18 3.55-.16 5.44.08.44.72.82 1.52 1.14 2.36 1.02.03 2.1.1 3.22.22.4 2.92.38 6.54-.04 9.42-4.42.54-9.92.48-14.08-.12-.42-2.78-.42-6.42.06-9.3Z" />
      <path d="M12.1 10.08c1.58-.03 2.86 1.05 2.94 2.56.08 1.7-1.12 3-2.8 3.05-1.76.04-3.04-1.12-3.08-2.76-.04-1.6 1.18-2.82 2.94-2.85Z" />
      <path d="M17.78 9.6h.1" />
    </IconFrame>
  )
}

export function MessageSquareText(props: HandDrawnIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M4.65 5.92c4.22-.5 10.44-.44 14.72.02.45 2.75.42 5.94-.08 8.56-2.35.36-5.3.46-8.48.28-1.18 1.18-2.52 2.12-4.02 2.82.22-1.08.34-2.02.36-2.86-.88-.08-1.72-.18-2.52-.3-.44-2.54-.44-5.82.02-8.52Z"
        fill="currentColor"
        fillOpacity="0.14"
      />
      <path d="M4.65 5.92c4.22-.5 10.44-.44 14.72.02.45 2.75.42 5.94-.08 8.56-2.35.36-5.3.46-8.48.28-1.18 1.18-2.52 2.12-4.02 2.82.22-1.08.34-2.02.36-2.86-.88-.08-1.72-.18-2.52-.3-.44-2.54-.44-5.82.02-8.52Z" />
      <path d="M7.52 9.55c2.4-.16 5.55-.14 8.7.04" opacity="0.62" />
      <path d="M7.58 12.28c2.1-.08 4.25-.04 6.55.1" opacity="0.52" />
    </IconFrame>
  )
}

export function MoreHorizontal(props: HandDrawnIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M5.9 11.72c.52-.05.92.28.98.78.07.55-.28.95-.8 1.02-.55.08-.98-.27-1.04-.78-.05-.52.32-.95.86-1.02Z" fill="currentColor" />
      <path d="M11.78 11.55c.55-.06.96.3 1.02.82.06.52-.3.94-.85 1-.54.06-.98-.27-1.04-.78-.05-.54.32-.98.87-1.04Z" fill="currentColor" />
      <path d="M17.78 11.72c.56-.06.98.3 1.04.84.06.52-.3.92-.86.98-.55.05-.98-.28-1.04-.8-.06-.5.3-.95.86-1.02Z" fill="currentColor" />
    </IconFrame>
  )
}

export function Feather(props: HandDrawnIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M5.18 19.08c2.22-5.2 5.62-10.12 10.42-14.12 1.36-1.14 3.02-.78 3.62.7.62 1.56.02 3.56-1.54 5.18-2.7 2.82-6.42 4.92-10.8 6.08" />
      <path d="M8.8 16.2c2.45-2.22 4.92-4.62 7.44-7.18" />
      <path d="M11.3 8.85c1.5-.16 2.72-.06 3.82.32" opacity="0.42" />
      <path d="M8.58 12.98c1.32-.02 2.52.1 3.58.42" opacity="0.42" />
    </IconFrame>
  )
}

export function MapPin(props: HandDrawnIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M12.05 3.82c3.35.05 5.92 2.42 5.98 5.8.08 4.18-3.6 7.6-5.9 10.7-2.35-3.18-6-6.34-6.14-10.54-.12-3.45 2.42-6 6.06-5.96Z"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path d="M12.05 3.82c3.35.05 5.92 2.42 5.98 5.8.08 4.18-3.6 7.6-5.9 10.7-2.35-3.18-6-6.34-6.14-10.54-.12-3.45 2.42-6 6.06-5.96Z" />
      <path d="M11.98 7.95c1.14-.02 2.04.78 2.1 1.86.06 1.18-.75 2.06-1.92 2.12-1.2.08-2.12-.74-2.18-1.9-.06-1.14.8-2.06 2-2.08Z" />
    </IconFrame>
  )
}

export function Stamp(props: HandDrawnIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M5.12 4.9c3.82-.34 9.45-.32 13.7.06l-.12 2 1.72.72-.76 1.72 1.2 1.48-1.22 1.45.76 1.82-1.74.68.12 2.15c-3.95.42-9.38.42-13.58.04l.14-2.15-1.72-.7.7-1.78-1.18-1.45 1.2-1.48-.72-1.78 1.64-.72-.14-2.06Z"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path d="M5.12 4.9c3.82-.34 9.45-.32 13.7.06l-.12 2 1.72.72-.76 1.72 1.2 1.48-1.22 1.45.76 1.82-1.74.68.12 2.15c-3.95.42-9.38.42-13.58.04l.14-2.15-1.72-.7.7-1.78-1.18-1.45 1.2-1.48-.72-1.78 1.64-.72-.14-2.06Z" />
      <path d="M8.08 8.35c2.12-.18 5.25-.16 7.82.04.26 1.58.22 3.7-.1 5.42-2.35.2-5.1.18-7.55-.04-.28-1.72-.32-3.72-.17-5.42Z" />
      <path d="M9.82 11.36c1.2-.1 2.75-.08 4.3.05" opacity="0.46" />
    </IconFrame>
  )
}

export function StickyNote(props: HandDrawnIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M5.02 4.9c4.05-.4 9.38-.34 13.92.08.42 3.35.4 8.45-.04 12.28-1.32 1.06-2.72 1.98-4.26 2.78-3.05.1-6.38.02-9.44-.24-.44-4.14-.5-10.02-.18-14.9Z"
        fill="currentColor"
        fillOpacity="0.14"
      />
      <path d="M5.02 4.9c4.05-.4 9.38-.34 13.92.08.42 3.35.4 8.45-.04 12.28-1.32 1.06-2.72 1.98-4.26 2.78-3.05.1-6.38.02-9.44-.24-.44-4.14-.5-10.02-.18-14.9Z" />
      <path d="M14.45 19.78c-.03-1.48.03-2.8.18-4.1 1.4-.04 2.76.02 4.1.18" />
      <path d="M7.75 8.85c1.85-.14 4.65-.12 7.58.04" opacity="0.52" />
      <path d="M7.68 12.02c1.52-.1 3.48-.08 5.6.06" opacity="0.42" />
    </IconFrame>
  )
}
