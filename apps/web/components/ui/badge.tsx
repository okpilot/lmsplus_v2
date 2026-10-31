import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'group/badge inline-flex h-chip w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-pill border border-transparent px-2 py-0.5 text-chip whitespace-nowrap transition-all focus-visible:border-ring focus-visible:outline-solid focus-visible:outline-focus focus-visible:outline-ring focus-visible:outline-offset-focus has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-invalid-ring [&>svg]:pointer-events-none [&>svg]:size-icon-sm',
  {
    variants: {
      tone: {
        neutral: '',
        info: 'bg-info-soft text-info',
        success: 'bg-success-soft text-success',
        caution: 'bg-caution-soft text-caution',
        danger: 'bg-danger-soft text-danger',
      },
      outline: {
        true: '',
        false: '',
      },
      shape: {
        default: '',
        circle: 'size-avatar justify-center rounded-pill p-0',
      },
    },
    compoundVariants: [
      { tone: 'neutral', outline: false, className: 'bg-muted text-muted-foreground' },
      {
        tone: 'neutral',
        outline: true,
        className: 'border-border bg-transparent text-muted-foreground',
      },
    ],
    defaultVariants: {
      tone: 'neutral',
      outline: false,
      shape: 'default',
    },
  },
)

type BadgeVariants = VariantProps<typeof badgeVariants>
type BadgeProps = Readonly<
  useRender.ComponentProps<'span'> &
    Pick<BadgeVariants, 'shape'> & {
      tone?: NonNullable<BadgeVariants['tone']>
      outline?: boolean
    }
>

function Badge({
  className,
  tone = 'neutral',
  outline = false,
  shape,
  render,
  ...props
}: Readonly<BadgeProps>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ tone, outline, shape }), className),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      tone,
    },
  })
}

export { Badge, badgeVariants }
