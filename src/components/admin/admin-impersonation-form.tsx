import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";

type AdminImpersonationFormProps = Omit<
  React.ComponentProps<typeof Button>,
  "children" | "type"
> & {
  children?: React.ReactNode;
  redirectTo?: string;
  userId: string;
};

export function AdminImpersonationForm({
  children,
  redirectTo = "/dashboard",
  userId,
  ...buttonProps
}: AdminImpersonationFormProps) {
  return (
    <form action="/api/admin/impersonation" method="post">
      <input type="hidden" name="intent" value="start" />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <Button type="submit" {...buttonProps}>
        {children ?? (
          <>
            <LayoutGrid className="mr-1 size-4" />
            Open Dashboard
          </>
        )}
      </Button>
    </form>
  );
}
