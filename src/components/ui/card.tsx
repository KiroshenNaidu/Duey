import * as React from "react"

import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // Flat shell — no border/shadow, and the same 1rem corners as the app's hand-rolled
      // `bg-card rounded-2xl` cards (Stats, Profile hero, Settings menu). Cards that want
      // an outline opt in with explicit `border border-*` classes. Radius overrides
      // (rounded-3xl etc.) still win through twMerge.
      "rounded-2xl bg-card text-card-foreground",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-3", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-3 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-3 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

/**
 * The app's in-card section heading: a category-coloured icon, an uppercase muted title,
 * and an optional figure pushed to the right. Every flat `bg-card rounded-2xl p-4` card
 * (Stats, Savings, Transport) opens with this row — it is the pattern those cards had
 * hand-rolled a copy of each, which is why it lives here now.
 *
 * Not CardHeader/CardTitle: those are the shadcn dialog-style header with its own padding.
 * This is a heading INSIDE a card that owns its own padding.
 */
const CardHeading = React.forwardRef<
  HTMLDivElement,
  Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> & {
    icon: React.ElementType
    title: React.ReactNode
    /** Category colour for the icon. Defaults to the accent. */
    iconClassName?: string
    /** Figure or status chip on the right — a count, a total, "3 days left". */
    aside?: React.ReactNode
    asideClassName?: string
  }
>(({ className, icon: Icon, title, iconClassName, aside, asideClassName, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center gap-2 mb-2", className)} {...props}>
    <Icon className={cn("h-4 w-4 shrink-0", iconClassName ?? "text-accent")} />
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
    {aside != null && (
      <span className={cn(
        "ml-auto shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground",
        asideClassName,
      )}>
        {aside}
      </span>
    )}
  </div>
))
CardHeading.displayName = "CardHeading"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, CardHeading }
