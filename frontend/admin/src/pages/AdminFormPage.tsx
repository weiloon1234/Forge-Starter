import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AdminsPage } from "@/pages/AdminsPage";

export function AdminFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  useEffect(() => {
    if (!id) {
      navigate("/admins", { replace: true });
    }
  }, [id, navigate]);

  if (!id) {
    return null;
  }

  return (
    <AdminsPage
      modalRouteIntent={
        id === "new" ? { kind: "create" } : { kind: "target", id }
      }
      onRouteModalClose={() => navigate("/admins", { replace: true })}
    />
  );
}
