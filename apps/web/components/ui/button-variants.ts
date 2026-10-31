import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding text-label whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-disabled aria-invalid:border-invalid-border aria-invalid:ring-3 aria-invalid:ring-invalid-ring [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-icon",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed',
        outline:
          'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-field-fill dark:hover:bg-foreground/(--state-hover)',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary-hover active:bg-secondary-pressed aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-foreground/(--state-hover)',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive-hover active:bg-destructive-pressed focus-visible:border-destructive focus-visible:ring-destructive',
        caution:
          'bg-caution-solid text-caution-foreground hover:bg-caution-solid-hover active:bg-caution-solid-pressed',
        toggle:
          'text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:border-primary aria-pressed:bg-card aria-pressed:text-primary-text aria-pressed:hover:bg-muted',
        segment:
          'text-muted-foreground hover:text-foreground aria-pressed:border-primary aria-pressed:bg-card aria-pressed:text-primary-text',
        link: 'text-primary-text underline underline-offset-4 hover:decoration-2',
      },
      size: {
        default:
          'h-(--control-h) gap-1.5 rounded-control px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        sm: "relative h-7 gap-1 rounded-control px-2.5 text-caption-strong after:absolute after:-inset-x-0.5 after:-inset-y-tap-y lg:after:hidden in-data-[slot=button-group]:rounded-control has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-icon-sm",
        icon: 'size-(--control-h) rounded-pill',
        segment:
          'relative h-8 rounded-inner px-1 after:absolute after:-inset-x-0.5 after:-inset-y-1.5 md:px-3 lg:after:hidden',
        'icon-sm':
          'relative size-7 rounded-pill after:absolute after:-inset-x-0.5 after:-inset-y-tap-y lg:after:hidden in-data-[slot=button-group]:rounded-control',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)
