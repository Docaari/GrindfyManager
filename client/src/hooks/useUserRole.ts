/**
 * useUserRole — Sprint TS-3 (RF-05)
 *
 * Thin wrapper sobre useAuth para expor isAdmin + role. Permite mocks limpos
 * em testes de paginas admin sem precisar mockar useAuth inteiro.
 */

import { useAuth } from "@/contexts/AuthContext";

export function useUserRole(): { isAdmin: boolean; role: string } {
  const { isAdmin } = useAuth();
  return {
    isAdmin: !!isAdmin,
    role: isAdmin ? "admin" : "user",
  };
}
