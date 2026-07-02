/**
 * Renders an image that opens its full-resolution source in a new browser tab
 * when activated. Implemented as a real anchor, so it is keyboard-focusable and
 * Enter-activates; `rel="noopener noreferrer"` prevents tab-nabbing / opener
 * leaks on the Supabase Storage URLs.
 *
 * Named `ZoomableImage` for historical reasons — it previously opened an in-page
 * zoom overlay; #863 switched it to open in a new tab instead. The name and
 * props are kept so existing call sites are unchanged.
 */
type ZoomableImageProps = {
  src: string
  alt: string
  className?: string
}

export function ZoomableImage({ src, alt, className }: Readonly<ZoomableImageProps>) {
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open image in new tab: ${alt}`}
      className="inline-block cursor-zoom-in"
    >
      {/* biome-ignore lint/performance/noImgElement: raw img — Next.js Image requires known dimensions */}
      <img
        src={src}
        // Presentational: the anchor's aria-label is the link's accessible name,
        // so the image must not double-announce its own alt text.
        alt=""
        aria-hidden="true"
        className={`rounded-md border border-border object-contain ${className ?? ''}`}
      />
    </a>
  )
}
