import { cn } from "../../lib/utils";
import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes, forwardRef, useState, useEffect, useRef } from "react";
import { X, ChevronDown } from "lucide-react";

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-sm shadow-black/[0.04]",
        className
      )}
    >
      {children}
    </div>
  );
}
export function CardHeader({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return <div className={cn("flex flex-col space-y-1 p-5", className)}>{children}</div>;
}
export function CardTitle({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return (
    <h3 className={cn("text-sm font-semibold leading-none tracking-tight text-foreground", className)}>{children}</h3>
  );
}
export function CardContent({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return <div className={cn("p-5 pt-0", className)}>{children}</div>;
}

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeVariant = "default" | "success" | "warning" | "destructive" | "info" | "outline";
const badgeVariants: Record<BadgeVariant, string> = {
  default: "bg-secondary text-secondary-foreground border-transparent",
  success: "bg-emerald-500/10 text-emerald-800 border-emerald-500/25",
  warning: "bg-amber-500/10 text-amber-900 border-amber-500/25",
  destructive: "bg-red-500/10 text-red-700 border-red-500/25",
  info: "bg-sky-500/10 text-sky-800 border-sky-500/25",
  outline: "border-border text-foreground bg-background",
};
export function Badge({ variant = "default", className, children }: Readonly<{ variant?: BadgeVariant; className?: string; children: ReactNode }>) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors", badgeVariants[variant], className)}>
      {children}
    </span>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
type ButtonVariant = "default" | "destructive" | "outline" | "ghost" | "secondary";
type ButtonSize = "sm" | "default" | "lg" | "icon";
const btnVariants: Record<ButtonVariant, string> = {
  default:
    "bg-primary text-primary-foreground shadow-sm hover:brightness-[0.92] active:brightness-[0.86]",
  destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
  outline: "border border-[hsl(var(--input))] bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  secondary: "border border-border bg-secondary text-secondary-foreground shadow-sm hover:bg-muted",
};
const btnSizes: Record<ButtonSize, string> = {
  default: "h-9 px-4 py-2 text-sm",
  sm: "h-8 rounded-md px-3 text-xs",
  lg: "h-10 rounded-md px-8 text-sm",
  icon: "h-9 w-9",
};
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; className?: string }>(
  ({ variant = "default", size = "default", className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        btnVariants[variant],
        btnSizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);
Button.displayName = "Button";

// ─── Input ────────────────────────────────────────────────────────────────────
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { className?: string }>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--input-background))] px-3 py-1 text-sm text-foreground shadow-sm transition-colors",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[hsl(var(--placeholder))]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props} />
  )
);
Input.displayName = "Input";

// ─── Textarea ────────────────────────────────────────────────────────────────
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { className?: string }>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--input-background))] px-3 py-2 text-sm text-foreground shadow-sm transition-colors",
        "placeholder:text-[hsl(var(--placeholder))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

// ─── Select ───────────────────────────────────────────────────────────────────
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { className?: string }>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref}
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--input-background))] px-3 py-1 text-sm text-foreground shadow-sm",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-popover [&>option]:text-popover-foreground",
        className
      )}
      {...props}>
      {children}
    </select>
  )
);
Select.displayName = "Select";

// ─── Dropdown (Custom dark-themed replacement for Select) ──────────────────────
interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  className?: string;
  title?: string;
  disabled?: boolean;
}

export function Dropdown({ value, onChange, options, placeholder, className, title, disabled }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder || "Select…";

  return (
    <div ref={containerRef} className="relative" title={title}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--input-background))] px-3 py-1 text-sm text-foreground shadow-sm transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown size={14} className={cn("text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-lg shadow-black/10 overflow-hidden max-h-64 overflow-y-auto"
        >
          {options.map((opt) => (
            <div
              key={opt.value}
              role="option"
              aria-selected={value === opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={cn(
                "px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-muted text-foreground",
                value === opt.value && "bg-primary/15 font-medium"
              )}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────
export function Table({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)}>{children}</table>
    </div>
  );
}
export function TableHeader({ children }: Readonly<{ children: ReactNode }>) {
  return <thead className="[&_tr]:border-b border-border">{children}</thead>;
}
export function TableBody({ children }: Readonly<{ children: ReactNode }>) {
  return <tbody className="[&_tr:last-child]:border-0">{children}</tbody>;
}
export function TableRow({ className, children, onClick }: Readonly<{ className?: string; children?: ReactNode; onClick?: () => void }>) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-b border-border transition-colors hover:bg-muted/60 data-[state=selected]:bg-muted",
        onClick && "cursor-pointer",
        className
      )}
    >
      {children}
    </tr>
  );
}
export function TableHead({ className, children, ...props }: Readonly<{ className?: string; children?: ReactNode } & React.ThHTMLAttributes<HTMLTableCellElement>>) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 h-10 px-4 text-left align-middle font-semibold text-label text-xs uppercase tracking-wide",
        "bg-muted/90 backdrop-blur supports-[backdrop-filter]:bg-muted/80",
        "[&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}
export function TableCell({ className, children, ...props }: Readonly<{ className?: string; children?: ReactNode } & React.TdHTMLAttributes<HTMLTableCellElement>>) {
  return (
    <td className={cn("p-4 align-middle text-foreground [&:has([role=checkbox])]:pr-0", className)} {...props}>
      {children}
    </td>
  );
}

// ─── Modal / Dialog ───────────────────────────────────────────────────────────
type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl" | "full";
const modalSizes: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  full: "max-w-[96vw]",
};
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  size = "md",
}: Readonly<{ open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string; size?: ModalSize }>) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        className={cn(
          "relative z-10 w-full max-h-[85dvh] sm:max-h-[min(90vh,900px)] overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 sm:pb-6 shadow-xl shadow-black/10",
          "rounded-t-2xl sm:rounded-xl border border-[hsl(var(--input))] bg-card text-card-foreground",
          modalSizes[size],
          className
        )}
      >
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="text-base font-semibold text-foreground pr-2">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

// ─── Empty State ──────────────────────────────────────────────────────────────
export function Empty({ message = "No data found" }: Readonly<{ message?: string }>) {
  return <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">{message}</div>;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
export function Tabs({ value, onValueChange, children }: Readonly<{ value: string; onValueChange: (v: string) => void; children: ReactNode }>) {
  return <div className="w-full">{children}</div>;
}
export function TabsList({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1",
        className
      )}
    >
      {children}
    </div>
  );
}
export function TabsTrigger({ value, children, className }: Readonly<{ value: string; children: ReactNode; className?: string }>) {
  return (
    <button
      type="button"
      data-value={value}
      className={cn(
        "px-3 py-1.5 text-sm font-medium rounded-md transition-colors text-muted-foreground",
        "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm",
        "hover:bg-background/80 hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}
export function TabsContent({ value, children }: Readonly<{ value: string; children: ReactNode }>) {
  return <div className="mt-4">{children}</div>;
}

// ─── RouterSelect ─────────────────────────────────────────────────────────────
export function RouterSelect({
  routers,
  value,
  onChange,
  className,
}: Readonly<{
  routers: Array<{ id: string; name: string }> | undefined;
  value: string;
  onChange: (id: string) => void;
  className?: string;
}>) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={cn("w-44", className)}>
      {routers?.map((r) => (
        <option key={r.id} value={r.id}>{r.name}</option>
      ))}
    </Select>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────
export function PageHeader({
  title,
  subtitle,
  actions,
}: Readonly<{ title: string; subtitle?: string; actions?: ReactNode }>) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <p className="text-muted-foreground text-sm mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 items-center">{actions}</div>}
    </div>
  );
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────
type ConfirmVariant = "destructive" | "default" | "outline" | "secondary" | "ghost";
export function ConfirmModal({
  open, title, message, confirmLabel,
  confirmVariant = "destructive",
  onConfirm, onClose, isPending,
}: Readonly<{
  open: boolean; title: string; message: string; confirmLabel: string;
  confirmVariant?: ConfirmVariant;
  onConfirm: () => void; onClose: () => void; isPending: boolean;
}>) {
  return (
    <Modal open={open} title={title} onClose={onClose} className="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex gap-2">
          <Button variant={confirmVariant} className="flex-1" disabled={isPending} onClick={onConfirm}>
            {isPending ? "Processing…" : confirmLabel}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── OrderStatusBadge ─────────────────────────────────────────────────────────
const ORDER_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  pending: "warning", approved: "success", rejected: "destructive", refunded: "default",
};
export function OrderStatusBadge({ status }: Readonly<{ status: string }>) {
  return <Badge variant={ORDER_STATUS_VARIANTS[status] ?? "default"}>{status}</Badge>;
}

// ─── PaymentMethodBadge ───────────────────────────────────────────────────────
const METHOD_COLORS: Record<string, string> = {
  bkash: "bg-[#e2136e] text-white",
  nagad: "bg-[#f7931e] text-white",
  rocket: "bg-[#8e44ad] text-white",
  free: "bg-emerald-600 text-white",
};
export function PaymentMethodBadge({ method }: Readonly<{ method: string | null | undefined }>) {
  const m = method ?? "";
  return (
    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", METHOD_COLORS[m] ?? "bg-muted text-foreground")}>
      {m.toUpperCase() || "—"}
    </span>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  gradient: string;
}
export function StatCard({ label, value, sub, icon, gradient }: Readonly<StatCardProps>) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl p-5 text-white shadow-lg", gradient)}>
      <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-white/70 text-xs font-medium mb-1">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          {sub && <p className="text-white/60 text-xs mt-0.5">{sub}</p>}
        </div>
        <div className="p-2 bg-white/15 rounded-lg">{icon}</div>
      </div>
    </div>
  );
}
