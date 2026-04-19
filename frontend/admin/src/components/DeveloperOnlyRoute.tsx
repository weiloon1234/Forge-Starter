import { canAccessObservability } from "@/adminAccess";
import { auth } from "@/auth";
import { NotFoundPage } from "@/pages/NotFoundPage";

interface DeveloperOnlyRouteProps {
  children: React.ReactNode;
}

export function DeveloperOnlyRoute({ children }: DeveloperOnlyRouteProps) {
  const { user } = auth.useAuth();

  if (!canAccessObservability(user)) {
    return <NotFoundPage />;
  }

  return <>{children}</>;
}
