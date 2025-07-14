import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

export function useAuth() {
  const { data: user, isLoading, refetch } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Check for stored tokens on mount
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token && !user) {
      // Token exists but user not loaded, try to fetch user
      refetch();
    }
  }, [user, refetch]);

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', {
        method: 'POST'
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear stored tokens
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('rememberMe');
      localStorage.removeItem('userEmail');
      
      // Reload page to clear all state
      window.location.href = '/';
    }
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout,
  };
}
