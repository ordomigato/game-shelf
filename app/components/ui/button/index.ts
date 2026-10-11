import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

export const buttonVariants = cva(
  'focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-(--btn-radius) border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-3 aria-invalid:ring-3 active:not-aria-[haspopup]:translate-y-px [&_svg:not([class*=size-])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Raised: colours, edges and glows come from the --btn-* variables
        // in tailwind.css.
        default: 'bg-linear-to-b from-(--btn-primary-from) to-(--btn-primary-to) border-(--btn-primary-border) text-primary-foreground shadow-(--btn-primary-shadow) hover:not-aria-[haspopup]:-translate-y-px hover:shadow-(--btn-primary-shadow-hover) active:not-aria-[haspopup]:translate-y-0',
        outline: 'bg-linear-to-b from-(--btn-neutral-from) to-(--btn-neutral-to) border-border text-foreground shadow-(--btn-neutral-shadow) hover:border-foreground/25 aria-expanded:border-foreground/25',
        secondary: 'bg-linear-to-b from-(--btn-tonal-from) to-(--btn-tonal-to) border-border/60 text-secondary-foreground shadow-(--btn-neutral-shadow) hover:border-foreground/20 aria-expanded:border-foreground/20',
        ghost: 'hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 aria-expanded:bg-muted aria-expanded:text-foreground',
        destructive: 'bg-linear-to-b from-(--btn-danger-from) to-(--btn-danger-to) border-(--btn-danger-border) text-destructive shadow-(--btn-neutral-shadow) focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 focus-visible:border-destructive/40 hover:border-destructive/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        'default': 'h-9 gap-1.5 px-2.5 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        'xs': 'h-6 gap-1 rounded-(--btn-radius-sm) px-2 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*=size-])]:size-3',
        'sm': 'h-8 gap-1 rounded-(--btn-radius-sm) px-2.5 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5',
        'lg': 'h-10 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        'icon': 'size-9',
        'icon-xs': 'size-6 rounded-(--btn-radius-sm) in-data-[slot=button-group]:rounded-md [&_svg:not([class*=size-])]:size-3',
        'icon-sm': 'size-8 rounded-(--btn-radius-sm) in-data-[slot=button-group]:rounded-md',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)
export type ButtonVariants = VariantProps<typeof buttonVariants>
