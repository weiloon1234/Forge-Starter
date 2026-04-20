import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { PagesPage } from "@/pages/PagesPage";

export function PageFormPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isCreateRoute = location.pathname.endsWith("/pages/new");

  useEffect(() => {
    if (!isCreateRoute && !id) {
      navigate("/pages", { replace: true });
    }
  }, [id, isCreateRoute, navigate]);

  if (!isCreateRoute && !id) {
    return null;
  }

  const modalRouteIntent = isCreateRoute
    ? { kind: "create" as const }
    : id
      ? { kind: "target" as const, id }
      : undefined;

  if (!modalRouteIntent) {
    return null;
  }

  return (
    <PagesPage
      modalRouteIntent={modalRouteIntent}
      onRouteModalClose={() => navigate("/pages", { replace: true })}
    />
  );
}
