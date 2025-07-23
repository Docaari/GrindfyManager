import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { ProfileState } from '@shared/schema';

export interface ProfileStateData {
  dayOfWeek: number;
  activeProfile: 'A' | 'B' | 'C' | null; // Permite null para ambos inativos
  profileAData?: Record<string, any>;
  profileBData?: Record<string, any>;
}

export function useProfileStates() {
  return useQuery<ProfileState[]>({
    queryKey: ['/api/profile-states'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/profile-states');
    },
  });
}

export function useUpdateProfileState() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dayOfWeek, activeProfile, profileAData, profileBData }: ProfileStateData) => {
      return await apiRequest('PUT', `/api/profile-states/${dayOfWeek}`, {
        activeProfile,
        profileAData,
        profileBData
      });
    },
    onSuccess: (data, variables) => {
      console.log('✅ PROFILE UPDATE SUCCESS - Day:', variables.dayOfWeek, 'New profile:', variables.activeProfile);
      queryClient.invalidateQueries({ queryKey: ['/api/profile-states'] });
      queryClient.invalidateQueries({ queryKey: ['/api/planned-tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/by-site'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/by-category'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/by-speed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/by-buyin-range'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/by-month'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/final-table'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/by-field'] });
    },
    onError: (error, variables) => {
      console.error('❌ PROFILE UPDATE ERROR - Day:', variables.dayOfWeek, 'Profile:', variables.activeProfile, 'Error:', error);
    },
  });
}