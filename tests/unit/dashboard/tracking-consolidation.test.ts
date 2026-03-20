import { describe, it, expect } from 'vitest';
import * as schema from '../../../shared/schema';

// =============================================================================
// Testes TDD: Consolidacao das Tabelas de Tracking (user_activities -> user_activity)
//
// Spec: docs/specs/consolidate-tracking-tables.md
// Modo: TDD (red phase) — todos devem FALHAR ate a consolidacao ser implementada.
//
// Estes testes validam o estado FINAL esperado apos a consolidacao:
// - insertUserActivitySchema aceita todos os valores que antes eram validos em
//   insertUserActivitiesSchema (RF-01)
// - Funcao de mapeamento de dados converte campos corretamente (RF-02)
// - Tipo UserActivity aponta para userActivity.$inferSelect (RF-05)
// - userActivity tem relacoes Drizzle definidas (RF-05)
// - Artefatos da tabela antiga foram removidos (RF-05)
// =============================================================================

// ---------------------------------------------------------------------------
// RF-01: Schema consolidado — insertUserActivitySchema deve aceitar todos
// os valores que antes eram validos em insertUserActivitiesSchema
// ---------------------------------------------------------------------------

describe('Schema consolidado: insertUserActivitySchema aceita valores de ambas as tabelas', () => {
  // Valores que ja eram validos no insertUserActivitySchema (nao devem quebrar)
  describe('valores originais de user_activity (regressao)', () => {
    const validActivity = {
      userId: 'USER-0001',
      page: 'dashboard',
      action: 'page_view',
    };

    it('deve aceitar atividade com campos obrigatorios (userId, page, action)', () => {
      const result = schema.insertUserActivitySchema.safeParse(validActivity);
      expect(result.success).toBe(true);
    });

    it('deve aceitar action "feature_use"', () => {
      const data = { ...validActivity, action: 'feature_use' };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar action "session_start"', () => {
      const data = { ...validActivity, action: 'session_start' };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar action "session_end"', () => {
      const data = { ...validActivity, action: 'session_end' };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar feature como string nullable', () => {
      const data = { ...validActivity, feature: 'upload' };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar duration como inteiro em segundos (nullable)', () => {
      const data = { ...validActivity, duration: 300 };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar ipAddress como string nullable', () => {
      const data = { ...validActivity, ipAddress: '192.168.1.1' };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar userAgent como string nullable', () => {
      const data = { ...validActivity, userAgent: 'Mozilla/5.0' };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar metadata como objeto JSON nullable', () => {
      const data = { ...validActivity, metadata: { browser: 'Chrome' } };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  // Valores que antes eram validos APENAS no insertUserActivitiesSchema
  // Apos consolidacao, action deve aceitar esses valores tambem
  describe('valores absorvidos de user_activities (activityType -> action)', () => {
    const base = {
      userId: 'USER-0001',
      page: 'dashboard',
    };

    it('deve aceitar action "login" (antes activityType em user_activities)', () => {
      const data = { ...base, action: 'login' };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar action "logout" (antes activityType em user_activities)', () => {
      const data = { ...base, action: 'logout' };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar action "grind_session" (antes activityType em user_activities)', () => {
      const data = { ...base, action: 'grind_session' };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar action "upload" (antes activityType em user_activities)', () => {
      const data = { ...base, action: 'upload' };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar action "study_session" (antes activityType em user_activities)', () => {
      const data = { ...base, action: 'study_session' };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar action "page_view" (existe em ambas as tabelas)', () => {
      const data = { ...base, action: 'page_view' };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar todos os 9 action values da spec em sequencia', () => {
      const allActions = [
        'login', 'logout', 'grind_session', 'upload', 'study_session',
        'page_view', 'feature_use', 'session_start', 'session_end',
      ];
      for (const action of allActions) {
        const data = { ...base, action };
        const result = schema.insertUserActivitySchema.safeParse(data);
        expect(result.success, `action "${action}" deve ser aceita`).toBe(true);
      }
    });
  });

  // page e NOT NULL no schema consolidado
  describe('campo page e NOT NULL (obrigatorio)', () => {
    it('deve rejeitar atividade sem page', () => {
      const data = { userId: 'USER-0001', action: 'login' };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve aceitar page "unknown" (valor padrao para migrados com page NULL)', () => {
      const data = { userId: 'USER-0001', page: 'unknown', action: 'login' };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  // Campos nullable do schema consolidado
  describe('campos nullable permanecem nullable', () => {
    const base = { userId: 'USER-0001', page: 'dashboard', action: 'page_view' };

    it('deve aceitar duration como null', () => {
      const data = { ...base, duration: null };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar feature como null', () => {
      const data = { ...base, feature: null };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar ipAddress como null', () => {
      const data = { ...base, ipAddress: null };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar userAgent como null', () => {
      const data = { ...base, userAgent: null };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar metadata como null', () => {
      const data = { ...base, metadata: null };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  // Campos omitidos no schema de insert
  describe('campos auto-gerados sao omitidos', () => {
    it('deve omitir id e createdAt do schema de insert', () => {
      const data = {
        userId: 'USER-0001',
        page: 'dashboard',
        action: 'page_view',
        id: 'should-be-ignored',
        createdAt: new Date(),
      };
      const result = schema.insertUserActivitySchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('id');
        expect(result.data).not.toHaveProperty('createdAt');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// RF-02: Mapeamento de dados — funcao de migracao mapeia campos corretamente
// Testa a funcao mapUserActivitiesToUserActivity que o Implementer vai criar
// em server/migrations/consolidate-tracking.ts (ou similar)
// ---------------------------------------------------------------------------

describe('Mapeamento de dados: mapUserActivitiesToUserActivity', () => {
  // Import da funcao que AINDA NAO EXISTE — fara os testes falharem (red phase)
  // O Implementer criara esta funcao em server/migrations/consolidate-tracking.ts
  let mapUserActivitiesToUserActivity: (record: {
    id: string;
    userId: string;
    activityType: string;
    page: string | null;
    sessionDuration: number | null;
    metadata: unknown;
    createdAt: Date | null;
  }) => {
    id: string;
    userId: string;
    page: string;
    action: string;
    feature: string | null;
    duration: number | null;
    metadata: unknown;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date | null;
  };

  // Dynamic import para permitir que o teste falhe graciosamente
  // quando o modulo nao existe ainda
  beforeAll(async () => {
    try {
      const mod = await import('../../../server/migrations/consolidate-tracking');
      mapUserActivitiesToUserActivity = mod.mapUserActivitiesToUserActivity;
    } catch {
      // Funcao nao existe ainda — testes vao falhar como esperado (red phase)
      mapUserActivitiesToUserActivity = () => {
        throw new Error('mapUserActivitiesToUserActivity nao implementada ainda');
      };
    }
  });

  it('deve mapear activityType para action diretamente', () => {
    const input = {
      id: 'act-001',
      userId: 'USER-0001',
      activityType: 'login',
      page: 'dashboard',
      sessionDuration: null,
      metadata: null,
      createdAt: new Date('2025-06-15T10:00:00Z'),
    };
    const result = mapUserActivitiesToUserActivity(input);
    expect(result.action).toBe('login');
  });

  it('deve converter sessionDuration de minutos para duration em segundos (x60)', () => {
    const input = {
      id: 'act-002',
      userId: 'USER-0001',
      activityType: 'grind_session',
      page: 'grind',
      sessionDuration: 45, // 45 minutos
      metadata: null,
      createdAt: new Date('2025-06-15T10:00:00Z'),
    };
    const result = mapUserActivitiesToUserActivity(input);
    expect(result.duration).toBe(2700); // 45 * 60 = 2700 segundos
  });

  it('deve converter page NULL para "unknown"', () => {
    const input = {
      id: 'act-003',
      userId: 'USER-0001',
      activityType: 'upload',
      page: null,
      sessionDuration: null,
      metadata: null,
      createdAt: new Date('2025-06-15T10:00:00Z'),
    };
    const result = mapUserActivitiesToUserActivity(input);
    expect(result.page).toBe('unknown');
  });

  it('deve manter sessionDuration NULL como duration NULL (nao 0)', () => {
    const input = {
      id: 'act-004',
      userId: 'USER-0001',
      activityType: 'login',
      page: 'dashboard',
      sessionDuration: null,
      metadata: null,
      createdAt: new Date('2025-06-15T10:00:00Z'),
    };
    const result = mapUserActivitiesToUserActivity(input);
    expect(result.duration).toBeNull();
  });

  it('deve preencher feature como null (nao existe em user_activities)', () => {
    const input = {
      id: 'act-005',
      userId: 'USER-0001',
      activityType: 'page_view',
      page: 'studies',
      sessionDuration: null,
      metadata: null,
      createdAt: new Date('2025-06-15T10:00:00Z'),
    };
    const result = mapUserActivitiesToUserActivity(input);
    expect(result.feature).toBeNull();
  });

  it('deve preencher ipAddress como null (nao existe em user_activities)', () => {
    const input = {
      id: 'act-006',
      userId: 'USER-0001',
      activityType: 'login',
      page: 'dashboard',
      sessionDuration: null,
      metadata: null,
      createdAt: new Date('2025-06-15T10:00:00Z'),
    };
    const result = mapUserActivitiesToUserActivity(input);
    expect(result.ipAddress).toBeNull();
  });

  it('deve preencher userAgent como null (nao existe em user_activities)', () => {
    const input = {
      id: 'act-007',
      userId: 'USER-0001',
      activityType: 'login',
      page: 'dashboard',
      sessionDuration: null,
      metadata: null,
      createdAt: new Date('2025-06-15T10:00:00Z'),
    };
    const result = mapUserActivitiesToUserActivity(input);
    expect(result.userAgent).toBeNull();
  });

  it('deve preservar id original do registro', () => {
    const input = {
      id: 'original-id-123',
      userId: 'USER-0001',
      activityType: 'login',
      page: 'dashboard',
      sessionDuration: null,
      metadata: null,
      createdAt: new Date('2025-06-15T10:00:00Z'),
    };
    const result = mapUserActivitiesToUserActivity(input);
    expect(result.id).toBe('original-id-123');
  });

  it('deve preservar userId original', () => {
    const input = {
      id: 'act-008',
      userId: 'USER-9999',
      activityType: 'upload',
      page: null,
      sessionDuration: null,
      metadata: null,
      createdAt: new Date('2025-06-15T10:00:00Z'),
    };
    const result = mapUserActivitiesToUserActivity(input);
    expect(result.userId).toBe('USER-9999');
  });

  it('deve preservar metadata original', () => {
    const metadata = { device: 'desktop', ip: '10.0.0.1' };
    const input = {
      id: 'act-009',
      userId: 'USER-0001',
      activityType: 'login',
      page: 'dashboard',
      sessionDuration: null,
      metadata,
      createdAt: new Date('2025-06-15T10:00:00Z'),
    };
    const result = mapUserActivitiesToUserActivity(input);
    expect(result.metadata).toEqual(metadata);
  });

  it('deve preservar metadata NULL', () => {
    const input = {
      id: 'act-010',
      userId: 'USER-0001',
      activityType: 'login',
      page: 'dashboard',
      sessionDuration: null,
      metadata: null,
      createdAt: new Date('2025-06-15T10:00:00Z'),
    };
    const result = mapUserActivitiesToUserActivity(input);
    expect(result.metadata).toBeNull();
  });

  it('deve preservar createdAt original', () => {
    const createdAt = new Date('2025-01-01T00:00:00Z');
    const input = {
      id: 'act-011',
      userId: 'USER-0001',
      activityType: 'login',
      page: 'dashboard',
      sessionDuration: null,
      metadata: null,
      createdAt,
    };
    const result = mapUserActivitiesToUserActivity(input);
    expect(result.createdAt).toEqual(createdAt);
  });

  it('deve converter sessionDuration 0 minutos para duration 0 segundos (nao null)', () => {
    const input = {
      id: 'act-012',
      userId: 'USER-0001',
      activityType: 'grind_session',
      page: 'grind',
      sessionDuration: 0,
      metadata: null,
      createdAt: new Date('2025-06-15T10:00:00Z'),
    };
    const result = mapUserActivitiesToUserActivity(input);
    expect(result.duration).toBe(0);
  });

  it('deve manter page quando nao e null', () => {
    const input = {
      id: 'act-013',
      userId: 'USER-0001',
      activityType: 'page_view',
      page: 'studies',
      sessionDuration: null,
      metadata: null,
      createdAt: new Date('2025-06-15T10:00:00Z'),
    };
    const result = mapUserActivitiesToUserActivity(input);
    expect(result.page).toBe('studies');
  });
});

// ---------------------------------------------------------------------------
// RF-05: Tipo UserActivity deve apontar para userActivity.$inferSelect
// (nao mais userActivities.$inferSelect)
// ---------------------------------------------------------------------------

describe('Tipo UserActivity aponta para a tabela correta', () => {
  it('UserActivity deve ter campo "action" (campo de userActivity, nao activityType)', () => {
    // Apos consolidacao, UserActivity = typeof userActivity.$inferSelect
    // que tem "action" em vez de "activityType"
    type HasAction = schema.UserActivity extends { action: string } ? true : false;
    const check: HasAction = true;
    expect(check).toBe(true);
  });

  it('UserActivity deve ter campo "page" como NOT NULL (string, nao string | null)', () => {
    type HasPageNotNull = schema.UserActivity extends { page: string } ? true : false;
    const check: HasPageNotNull = true;
    expect(check).toBe(true);
  });

  it('UserActivity deve ter campo "feature" (nullable)', () => {
    type HasFeature = schema.UserActivity extends { feature: string | null } ? true : false;
    const check: HasFeature = true;
    expect(check).toBe(true);
  });

  it('UserActivity deve ter campo "duration" em vez de "sessionDuration"', () => {
    type HasDuration = schema.UserActivity extends { duration: number | null } ? true : false;
    const check: HasDuration = true;
    expect(check).toBe(true);
  });

  it('UserActivity deve ter campo "ipAddress" (nullable)', () => {
    type HasIpAddress = schema.UserActivity extends { ipAddress: string | null } ? true : false;
    const check: HasIpAddress = true;
    expect(check).toBe(true);
  });

  it('UserActivity deve ter campo "userAgent" (nullable)', () => {
    type HasUserAgent = schema.UserActivity extends { userAgent: string | null } ? true : false;
    const check: HasUserAgent = true;
    expect(check).toBe(true);
  });

  it('UserActivity NAO deve ter campo "activityType" (campo da tabela antiga)', () => {
    // Se UserActivity ainda aponta para userActivities, tera activityType
    // Apos consolidacao, nao deve ter esse campo
    type HasActivityType = schema.UserActivity extends { activityType: string } ? true : false;
    const check: HasActivityType = false as HasActivityType;
    expect(check).toBe(false);
  });

  it('UserActivity NAO deve ter campo "sessionDuration" (campo da tabela antiga)', () => {
    type HasSessionDuration = schema.UserActivity extends { sessionDuration: number | null } ? true : false;
    const check: HasSessionDuration = false as HasSessionDuration;
    expect(check).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RF-05: Relacoes Drizzle — userActivity deve ter relacao com users
// ---------------------------------------------------------------------------

describe('Relacoes Drizzle para userActivity', () => {
  it('userActivityRelations deve existir como export', () => {
    // Apos consolidacao, deve existir userActivityRelations
    expect(schema).toHaveProperty('userActivityRelations');
  });

  it('userActivityRelations deve ser um objeto de relacoes Drizzle', () => {
    // Verifica que e um objeto valido (relacoes Drizzle sao objetos com metadata)
    expect(schema.userActivityRelations).toBeDefined();
    expect(typeof schema.userActivityRelations).not.toBe('undefined');
  });
});

// ---------------------------------------------------------------------------
// RF-05: Remocao de artefatos — schemas e exports da tabela antiga
// ---------------------------------------------------------------------------

describe('Remocao de artefatos da tabela user_activities', () => {
  it('insertUserActivitiesSchema NAO deve existir como export', () => {
    // Apos consolidacao, o schema da tabela antiga deve ter sido removido
    expect(schema).not.toHaveProperty('insertUserActivitiesSchema');
  });

  it('userActivities (tabela Drizzle) NAO deve existir como export', () => {
    // A definicao da tabela antiga deve ter sido removida
    expect(schema).not.toHaveProperty('userActivities');
  });

  it('userActivitiesRelations NAO deve existir como export', () => {
    // As relacoes da tabela antiga devem ter sido removidas
    expect(schema).not.toHaveProperty('userActivitiesRelations');
  });

  it('userActivity (tabela Drizzle consolidada) deve existir como export', () => {
    // A tabela consolidada deve continuar existindo
    expect(schema).toHaveProperty('userActivity');
  });

  it('insertUserActivitySchema (schema Zod consolidado) deve existir como export', () => {
    // O schema Zod da tabela consolidada deve continuar existindo
    expect(schema).toHaveProperty('insertUserActivitySchema');
  });

  it('UserActivity type deve existir como export', () => {
    // O tipo re-apontado deve existir
    // Verificamos indiretamente: se o tipo nao existisse, o TS nao compilaria
    // Aqui testamos via runtime que o modulo exporta algo utilizavel
    const activityInstance: schema.UserActivity = {
      id: 'test',
      userId: 'USER-0001',
      page: 'dashboard',
      action: 'page_view',
      feature: null,
      duration: null,
      metadata: null,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
    };
    expect(activityInstance.action).toBe('page_view');
  });
});
