import type { DayStats } from './types';

interface DayCardProps {
  day: { id: number; name: string; short: string };
  getActiveProfile: (dayOfWeek: number) => 'A' | 'B' | 'C' | null;
  setActiveProfile: (dayOfWeek: number, profile: 'A' | 'B' | 'C') => void;
  getProfileStats: (dayId: number, profile: 'A' | 'B') => DayStats;
  getTournamentsForProfile: (dayId: number, profile: 'A' | 'B') => any[];
  onOpenDialog: (dayId: number, profile: 'A' | 'B') => void;
}

export function DayCard({
  day,
  getActiveProfile,
  setActiveProfile,
  getProfileStats,
  getTournamentsForProfile,
  onOpenDialog,
}: DayCardProps) {
  const profiles: Array<{ profileId: string; profileName: string; profileType: 'A' | 'B' | 'C'; isMainProfile: boolean }> = [
    { profileId: `${day.id}-A`, profileName: "Perfil A", profileType: 'A', isMainProfile: true },
    { profileId: `${day.id}-B`, profileName: "Perfil B", profileType: 'B', isMainProfile: false },
    { profileId: `${day.id}-C`, profileName: "Dia OFF", profileType: 'C', isMainProfile: false }
  ];

  const currentActiveProfile = getActiveProfile(day.id);

  return (
    <div className="day-column">
      {profiles.map((profile) => {
        const profileStats = profile.profileType === 'C'
          ? { count: 0, totalBuyIn: 0, avgBuyIn: 0, startTime: null, endTime: null, durationHours: 0, vanillaPercentage: 0, pkoPercentage: 0, mysteryPercentage: 0, normalPercentage: 0, turboPercentage: 0, hyperPercentage: 0 }
          : getProfileStats(day.id, profile.profileType);

        const isProfileActive = currentActiveProfile === profile.profileType;

        return (
          <div
            key={profile.profileId}
            className={`weekly-summary-card day-card profile-card ${
              profile.profileType === 'A' ? 'main-profile' :
              profile.profileType === 'B' ? 'secondary-profile' : 'day-off-profile'
            } ${isProfileActive ? 'active' : 'inactive'} ${profile.profileType === 'C' ? 'cursor-default' : 'cursor-pointer'}`}
            onClick={() => {
              if (profile.profileType === 'C') return;
              onOpenDialog(day.id, profile.profileType as 'A' | 'B');
            }}
          >
            {profile.profileType === 'C' ? (
              <>
                <div className="day-header">
                  <div className="day-name">{day.name} {profile.profileName}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveProfile(day.id, profile.profileType);
                    }}
                    className={`radio-btn ${isProfileActive ? 'active' : 'inactive'}`}
                    title={isProfileActive ? 'Perfil ativo' : `Ativar ${profile.profileName}`}
                  >
                    <div className={`radio-dot ${isProfileActive ? 'active' : ''}`}></div>
                  </button>
                </div>
                <div className="empty-day-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                  <div className="empty-message" style={{ fontSize: '1rem', fontWeight: '600' }}>
                    {isProfileActive ? '🟡 Dia OFF Ativo' : '⚪ Dia OFF'}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="day-header">
                  <div className="day-name">{day.name} {profile.profileName}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveProfile(day.id, profile.profileType);
                    }}
                    className={`radio-btn ${isProfileActive ? 'active' : 'inactive'}`}
                    title={isProfileActive ? 'Perfil ativo' : `Ativar ${profile.profileName}`}
                  >
                    <div className={`radio-dot ${isProfileActive ? 'active' : ''}`}></div>
                  </button>
                </div>

                {profileStats.count > 0 ? (
                  <>
                    {/* Main Info */}
                    <div className="day-main-info">
                      <div className="day-investment">
                        ${profileStats.totalBuyIn.toFixed(0)}
                      </div>
                      <div className="day-metrics">
                        <div className="metrics-line">
                          {profileStats.count} {profileStats.count === 1 ? 'torneio' : 'torneios'} | ABI: ${profileStats.avgBuyIn.toFixed(2)}
                        </div>
                        <div className="metrics-line">
                          {profileStats.startTime && profileStats.endTime ? (
                            <>
                              {profileStats.startTime} — {profileStats.endTime} ({profileStats.durationHours.toFixed(1)}h)
                            </>
                          ) : (
                            'Hor\u00e1rios n\u00e3o definidos'
                          )}
                        </div>
                        <div className="metrics-line">
                          {(() => {
                            const typesArr = [
                              { name: 'Vanilla', percentage: profileStats.vanillaPercentage },
                              { name: 'PKO', percentage: profileStats.pkoPercentage },
                              { name: 'Mystery', percentage: profileStats.mysteryPercentage }
                            ];
                            const predominantType = typesArr.reduce((prev, current) =>
                              (prev.percentage > current.percentage) ? prev : current
                            );

                            const speedsArr = [
                              { name: 'Normal', percentage: profileStats.normalPercentage },
                              { name: 'Turbo', percentage: profileStats.turboPercentage },
                              { name: 'Hyper', percentage: profileStats.hyperPercentage }
                            ];
                            const predominantSpeed = speedsArr.reduce((prev, current) =>
                              (prev.percentage > current.percentage) ? prev : current
                            );

                            return `${predominantType.name} (${predominantType.percentage.toFixed(0)}%) ${predominantSpeed.name} (${predominantSpeed.percentage.toFixed(0)}%)`;
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Sites */}
                    <div className="day-sites-section">
                      <div className="sites-header">Sites</div>
                      <div className="sites-list">
                        {(() => {
                          const profileTournaments = getTournamentsForProfile(day.id, profile.profileType as 'A' | 'B');
                          const siteStatsList = profileTournaments.reduce((acc: any, t: any) => {
                            const site = t.site || 'Unknown';
                            const buyIn = parseFloat(t.buyIn) || 0;
                            acc[site] = (acc[site] || 0) + buyIn;
                            return acc;
                          }, {});

                          return Object.entries(siteStatsList).map(([site, total]) => (
                            <div key={site} className="site-item">
                              <div className="site-name">{site}</div>
                              <div className="site-amount">${(total as number).toFixed(0)}</div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-day-content">
                    <div className="empty-message">
                      {isProfileActive ? 'Adicionar Torneio' : (currentActiveProfile === null ? 'Ambos Perfis Inativos' : 'Perfil Inativo')}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
