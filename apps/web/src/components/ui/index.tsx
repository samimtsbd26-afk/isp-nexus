import { cn } from "../../lib/utils";
import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, forwardRef } from "react";
import { X } from "lucide-react";

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return <div className={cn("rounded-xl border border-border bg-card text-card-foreground shadow-sm", className)}>{children}</div>;
}
export function CardHeader({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return <div className={cn("flex flex-col space-y-1 p-5", className)}>{children}</div>;
}
export function CardTitle({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return <h3 className={cn("text-sm font-semibold leading-none tracking-tight", className)}>{children}</h3>;
}
export function CardContent({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return <div className={cn("p-5 pt-0", className)}>{children}</div>;
}

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeVariant = "default" | "success" | "warning" | "destructive" | "info" | "outline";
const badgeVariants: Record<BadgeVariant, string> = {
  default: "bg-secondary text-secondary-foreground border-transparent",
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  destructive: "bg-red-500/15 text-red-400 border-red-500/20",
  info: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  outline: "border-border text-foreground",
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
  default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
  destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
  outline: "border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
};
const btnSizes: Record<ButtonSize, string> = {
  default: "h-9 px-4 py-2 text-sm",
  sm: "h-8 rounded-md px-3 text-xs",
  lg: "h-10 rounded-md px-8 text-sm",
  icon: "h-9 w-9",
};
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; className?: string }>(
  ({ variant = "default", size = "default", className, children, ...props }, ref) => (
    <button ref={ref} className={cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer", btnVariants[variant], btnSizes[size], className)} {...props}>
      {children}
    </button>
  )
);
Button.displayName = "Button";

// ─── Input ────────────────────────────────────────────────────────────────────
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { className?: string }>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type}
      className={cn("flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50", className)}
      {...props} />
  )
);
Input.displayName = "Input";

// ─── Select ───────────────────────────────────────────────────────────────────
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { className?: string }>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref}
      className={cn("flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50", className)}
      {...props}>
      {children}
    </select>
  )
);
Select.displayName = "Select";

// ─── Table ────────────────────────────────────────────────────────────────────
export function Table({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return <div className="w-full overflow-auto"><table className={cn("w-full caption-bottom text-sm", className)}>{children}</table></div>;
}
export function TableHeader({ children }: Readonly<{ children: ReactNode }>) {
  return <thead className="[&_tr]:border-b">{children}</thead>;
}
export function TableBody({ children }: Readonly<{ children: ReactNode }>) {
  return <tbody className="[&_tr:last-child]:border-0">{children}</tbody>;
}
export function TableRow({ className, children, onClick }: Readonly<{ className?: string; children?: ReactNode; onClick?: () => void }>) {
  return <tr onClick={onClick} className={cn("border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", onClick && "cursor-pointer", className)}>{children}</tr>;
}
export function TableHead({ className, children, ...props }: Readonly<{ className?: string; children?: ReactNode } & React.ThHTMLAttributes<HTMLTableCellElement>>) {
  return <th className={cn("h-10 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", className)} {...props}>{children}</th>;
}
export function TableCell({ className, children, ...props }: Readonly<{ className?: string; children?: ReactNode } & React.TdHTMLAttributes<HTMLTableCellElement>>) {
  return <td className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props}>{children}</td>;
}

// ─── Modal / Dialog ───────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, className }: Readonly<{ open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string }>) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative z-10 bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-md", className)}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18} /></button>
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
  return <div className={cn("flex gap-1 border-b border-border pb-1", className)}>{children}</div>;
}
export function TabsTrigger({ value, children, className }: Readonly<{ value: string; children: ReactNode; className?: string }>) {
  return (
    <button
      type="button"
      className={cn(
        "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
        "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
        "hover:bg-muted",
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
