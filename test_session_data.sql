-- Inserir uma sessão de teste com percentuais variados
INSERT INTO grind_sessions (id, user_id, date, start_time, end_time, status, preparation_percentage, preparation_notes, final_notes) 
VALUES ('test-session-123', '43564737', '2025-01-10', '2025-01-10T18:00:00.000Z', '2025-01-10T23:00:00.000Z', 'completed', 85, 'Preparação focada em PKO', 'Sessão produtiva com mix de torneios');

-- Inserir torneios de diferentes tipos e velocidades
INSERT INTO planned_tournaments (id, user_id, session_id, site, name, buy_in, guaranteed, time, type, speed, category, status, result, bounty, position, field_size, rebuys, day_of_week, start_time, end_time, from_planned_tournament, planned_tournament_id) 
VALUES 
('test-tournament-1', '43564737', 'test-session-123', 'GGPoker', 'Mystery Bounty Main', 55, 100000, '18:00', 'Mystery', 'Normal', 'Mystery', 'completed', 245, 0, 5, 1247, 1, 4, '2025-01-10T18:00:00.000Z', '2025-01-10T21:30:00.000Z', true, 'planned-123'),
('test-tournament-2', '43564737', 'test-session-123', 'GGPoker', 'PKO Turbo', 33, 50000, '19:00', 'PKO', 'Turbo', 'PKO', 'completed', 0, 125, 45, 856, 0, 4, '2025-01-10T19:00:00.000Z', '2025-01-10T22:15:00.000Z', true, 'planned-124'),
('test-tournament-3', '43564737', 'test-session-123', 'GGPoker', 'Regular Main Event', 22, 30000, '20:00', 'Vanilla', 'Normal', 'Vanilla', 'completed', 0, 0, 120, 934, 0, 4, '2025-01-10T20:00:00.000Z', '2025-01-10T23:45:00.000Z', true, 'planned-125'),
('test-tournament-4', '43564737', 'test-session-123', 'GGPoker', 'Hyper Turbo', 11, 10000, '21:00', 'Vanilla', 'Hyper', 'Vanilla', 'completed', 0, 0, 89, 456, 0, 4, '2025-01-10T21:00:00.000Z', '2025-01-10T21:30:00.000Z', true, 'planned-126'),
('test-tournament-5', '43564737', 'test-session-123', 'GGPoker', 'PKO Normal', 44, 75000, '22:00', 'PKO', 'Normal', 'PKO', 'completed', 0, 89, 67, 723, 0, 4, '2025-01-10T22:00:00.000Z', '2025-01-11T01:30:00.000Z', true, 'planned-127');

-- Inserir alguns break feedbacks
INSERT INTO break_feedbacks (id, user_id, session_id, energia, foco, confianca, inteligencia_emocional, interferencias, notes) 
VALUES 
('test-break-1', '43564737', 'test-session-123', 8, 9, 7, 8, 3, 'Sessão começou bem'),
('test-break-2', '43564737', 'test-session-123', 7, 8, 8, 7, 4, 'Meio da sessão mantendo foco'),
('test-break-3', '43564737', 'test-session-123', 6, 7, 6, 6, 5, 'Final da sessão um pouco cansado');