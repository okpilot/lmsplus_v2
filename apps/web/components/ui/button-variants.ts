import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background not-disabled:active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground not-disabled:hover:bg-primary-hover not-disabled:active:bg-primary-pressed',
        outline:
          'border-border bg-background not-disabled:hover:bg-muted not-disabled:hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-muted/30 dark:not-disabled:hover:bg-muted/50',
        secondary:
          'bg-secondary text-secondary-foreground not-disabled:hover:bg-secondary-hover not-disabled:active:bg-secondary-pressed aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'not-disabled:hover:bg-muted not-disabled:hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:not-disabled:hover:bg-muted/50',
        destructive:
          'bg-destructive text-destructive-foreground not-disabled:hover:bg-destructive-hover not-disabled:active:bg-destructive-pressed focus-visible:border-destructive focus-visible:ring-destructive',
        caution:
          'bg-caution-solid text-caution-foreground not-disabled:hover:bg-caution-solid-hover not-disabled:active:bg-caution-solid-pressed',
        toggle:
          'text-muted-foreground not-disabled:hover:bg-muted not-disabled:hover:text-foreground aria-pressed:border-primary aria-pressed:bg-card aria-pressed:text-primary-text aria-pressed:not-disabled:hover:bg-muted',
        link: 'text-primary-text underline underline-offset-4 not-disabled:hover:decoration-2',
      },
      size: {
        default:
          'h-(--control-h) gap-1.5 rounded-control px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        sm: "relative h-7 gap-1 rounded-control px-2.5 text-caption after:absolute after:-inset-x-0.5 after:-inset-y-2 lg:after:hidden in-data-[slot=button-group]:rounded-control has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        icon: 'size-(--control-h) rounded-full',
        'icon-sm':
          'relative size-7 rounded-full after:absolute after:-inset-x-0.5 after:-inset-y-2 lg:after:hidden in-data-[slot=button-group]:rounded-control',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)
