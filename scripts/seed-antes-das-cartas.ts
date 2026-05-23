// Direct DB seed/refresh do curso "Antes das Cartas".
//
// Re-uploads Bloco A (covers/slides/podcast) + Bloco B (capas + slides;
// podcasts opcionais) + Bloco C (capas + slides + podcasts).
// Idempotente via upsert by slug.
//
// Source folder: B:/A anatomia de um Spot/00 - Antes das Cartas/<Bloco X>/
//   - Capas/{ep}.jpeg
//   - Slides/{ep} - <Title>.html
//   - Podcasts/{ep} - <Title>.m4a   (skip se ausente)

import { promises as fs } from "fs";
import path from "path";
import { storage } from "../server/storage";
import { createMediaStorage } from "../server/services/mediaStorage";
import { sanitizeArticleHtml, preserveInlineHandlers } from "../server/services/htmlSanitizer";
import { extractLearningObjectives } from "../server/services/learningObjectivesExtractor";
import { STORAGE_SCOPES } from "../shared/library-storage-scopes";

const ROOT = "B:/A anatomia de um Spot/00 - Antes das Cartas";
const ADMIN_USER_ID = "USER-0005";
const COURSE_SLUG = "antes-das-cartas";

interface Lesson {
  ep: string;
  baseFile: string;        // "A1 - Mentalidade Fixa vs Mentalidade de Crescimento" (sem ext)
  slug: string;
  title: string;
  subtitle: string;
  tags: string[];
  displayOrder: number;
}

interface Module {
  folder: string;          // "Bloco A - Fundamentos Mentais"
  slug: string;
  title: string;
  description: string;
  displayOrder: number;
  lessons: Lesson[];
}

const MODULES: Module[] = [
  {
    folder: "Bloco A - Fundamentos Mentais",
    slug: "bloco-a-fundamentos-mentais",
    title: "Bloco A — Fundamentos Mentais",
    description: "A crenca invisivel que decide trajetorias",
    displayOrder: 0,
    lessons: [
      { ep: "A1", baseFile: "A1 - Mentalidade Fixa vs Mentalidade de Crescimento", slug: "a1-mentalidade-fixa-vs-crescimento", title: "Mentalidade Fixa vs Mentalidade de Crescimento", subtitle: "A crenca invisivel sobre como habilidade funciona", tags: ["mentalidade", "neurociencia", "spot-acao", "recall"], displayOrder: 1 },
      { ep: "A2", baseFile: "A2 - A Dicotomia do Controle", slug: "a2-dicotomia-do-controle", title: "A Dicotomia do Controle", subtitle: "Estoicismo aplicado ao poker", tags: ["mentalidade", "estoicismo", "fronteira", "controle"], displayOrder: 2 },
      { ep: "A3", baseFile: "A3 - Identidade como Narrativa", slug: "a3-identidade-como-narrativa", title: "Identidade como Narrativa", subtitle: "A historia que voce conta sobre voce mesmo", tags: ["mentalidade", "identidade", "narrativa"], displayOrder: 3 },
      { ep: "A4", baseFile: "A4 - Responsabilidade vs Culpa", slug: "a4-responsabilidade-vs-culpa", title: "Responsabilidade vs Culpa", subtitle: "Diferenca operacional entre dois conceitos colados", tags: ["mentalidade", "responsabilidade", "culpa"], displayOrder: 4 },
      { ep: "A5", baseFile: "A5 - O Padrao Agassi", slug: "a5-padrao-agassi", title: "O Padrao Agassi", subtitle: "Excelencia tecnica e odio do que se faz", tags: ["mentalidade", "trajetoria", "burnout"], displayOrder: 5 },
      { ep: "A6", baseFile: "A6 - Os Seis Medos do Poker", slug: "a6-seis-medos-do-poker", title: "Os Seis Medos do Poker", subtitle: "Medos invisiveis que governam decisoes", tags: ["mentalidade", "medo", "decisao"], displayOrder: 6 },
      { ep: "A7", baseFile: "A7 - Combustivel nao Gatilho", slug: "a7-combustivel-nao-gatilho", title: "Combustivel nao Gatilho", subtitle: "Tilt como sinal, nao como falha", tags: ["mentalidade", "tilt", "emocao"], displayOrder: 7 },
      { ep: "A8", baseFile: "A8 - Entre a Trava e a Arrogancia", slug: "a8-trava-arrogancia", title: "Entre a Trava e a Arrogancia", subtitle: "A faixa estreita da confianca calibrada", tags: ["mentalidade", "confianca", "calibracao"], displayOrder: 8 },
      { ep: "A9", baseFile: "A9 - Sistema acima da Forca de Vontade", slug: "a9-sistema-acima-forca-vontade", title: "Sistema acima da Forca de Vontade", subtitle: "Por que disciplina nao resolve", tags: ["mentalidade", "sistema", "habito"], displayOrder: 9 },
    ],
  },
  {
    folder: "Bloco B - Biologia do Aprendizado",
    slug: "bloco-b-biologia-aprendizado",
    title: "Bloco B — Biologia do Aprendizado",
    description: "Como o cerebro aprende — e como o estudo do poker se encaixa nisso",
    displayOrder: 1,
    lessons: [
      { ep: "B1", baseFile: "B1 - BDNF", slug: "b1-bdnf", title: "BDNF", subtitle: "Brain-Derived Neurotrophic Factor — o adubo do cerebro", tags: ["aprendizado", "neuroplasticidade", "bdnf"], displayOrder: 1 },
      { ep: "B2", baseFile: "B2 - Janela de Aprendizado", slug: "b2-janela-de-aprendizado", title: "Janela de Aprendizado", subtitle: "Quando o cerebro absorve mais — e quando trava", tags: ["aprendizado", "atencao", "neurociencia"], displayOrder: 2 },
      { ep: "B3", baseFile: "B3 - Sono e Consolidacao", slug: "b3-sono-e-consolidacao", title: "Sono e Consolidacao", subtitle: "O que dorme grava — o que nao dorme some", tags: ["aprendizado", "sono", "consolidacao"], displayOrder: 3 },
      { ep: "B4", baseFile: "B4 - Genetica do Aprendizado", slug: "b4-genetica-do-aprendizado", title: "Genetica do Aprendizado", subtitle: "Limites herdados e o que voce ainda controla", tags: ["aprendizado", "genetica", "individualidade"], displayOrder: 4 },
      { ep: "B5", baseFile: "B5 - Deep Practice e Chunks", slug: "b5-deep-practice-e-chunks", title: "Deep Practice e Chunks", subtitle: "Como pratica deliberada constroi habilidade", tags: ["aprendizado", "pratica-deliberada", "chunks"], displayOrder: 5 },
      { ep: "B6", baseFile: "B6 - Dificuldades Desejaveis", slug: "b6-dificuldades-desejaveis", title: "Dificuldades Desejaveis", subtitle: "Por que o estudo facil eh o estudo que nao gruda", tags: ["aprendizado", "desejavel", "recall"], displayOrder: 6 },
    ],
  },
  {
    folder: "Bloco C - Metodo e Pratica",
    slug: "bloco-c-metodo-e-pratica",
    title: "Bloco C — Metodo e Pratica",
    description: "Como transformar estudo em habilidade — metodo, rotina e os erros que sabotam o processo",
    displayOrder: 2,
    lessons: [
      { ep: "C1", baseFile: "C1 - As Quatro etapas da competencia", slug: "c1-quatro-etapas-da-competencia", title: "As Quatro Etapas da Competencia", subtitle: "Como habilidade vira automatismo", tags: ["metodo", "competencia", "aprendizado"], displayOrder: 1 },
      { ep: "C2", baseFile: "C2 - ABC Game", slug: "c2-abc-game", title: "ABC Game", subtitle: "Variancia de performance e o B-game consistente", tags: ["metodo", "performance", "consistencia"], displayOrder: 2 },
      { ep: "C3", baseFile: "C3 - Leaks Mentais", slug: "c3-leaks-mentais", title: "Leaks Mentais", subtitle: "Diagnostico de vazamentos recorrentes", tags: ["metodo", "leaks", "diagnostico"], displayOrder: 3 },
      { ep: "C4", baseFile: "C4 - Metodo Cientifico de Estudo", slug: "c4-metodo-cientifico-de-estudo", title: "Metodo Cientifico de Estudo", subtitle: "Estudo como ciclo hipotese-teste-revisao", tags: ["metodo", "estudo", "pratica-deliberada"], displayOrder: 4 },
      { ep: "C5", baseFile: "C5 - Vieses Cognitivos", slug: "c5-vieses-cognitivos", title: "Vieses Cognitivos", subtitle: "Os atalhos mentais que distorcem decisoes", tags: ["metodo", "vieses", "decisao"], displayOrder: 5 },
      { ep: "C6", baseFile: "C6 - Intuicao vs Instinto", slug: "c6-intuicao-vs-instinto", title: "Intuicao vs Instinto", subtitle: "System 1 / System 2 aplicados ao poker", tags: ["metodo", "intuicao", "decisao"], displayOrder: 6 },
      { ep: "C7", baseFile: "C7 - Metas Processo vs Resultado", slug: "c7-metas-processo-vs-resultado", title: "Metas de Processo vs Resultado", subtitle: "Orientacao a aprendizado e controle do controlavel", tags: ["metodo", "metas", "processo"], displayOrder: 7 },
      { ep: "C8", baseFile: "C8 - Warm-up e Cool-down", slug: "c8-warm-up-e-cool-down", title: "Warm-up e Cool-down", subtitle: "Rotinas de aquecimento e revisao de sessao", tags: ["metodo", "rotina", "warm-up"], displayOrder: 8 },
    ],
  },
];

async function uploadIfExists(
  ms: ReturnType<typeof createMediaStorage>,
  absPath: string,
  scope: string,
  mime: string,
  ext: string,
): Promise<string | undefined> {
  try {
    const buffer = await fs.readFile(absPath);
    const result = await ms.put({ scope, ext, buffer, mime });
    return result.key;
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      console.error(`  [err] ${absPath}: ${err.message}`);
    } else {
      console.log(`  [skip] missing ${path.basename(absPath)}`);
    }
    return undefined;
  }
}

async function main() {
  const ms = createMediaStorage();

  // Course cover usa A1.jpeg do Bloco A (mesmo padrao do seed antigo).
  console.log("[1/3] Upsert course + modules");
  const courseCover = await uploadIfExists(
    ms,
    path.join(ROOT, MODULES[0].folder, "Capas", `${MODULES[0].lessons[0].ep}.jpeg`),
    STORAGE_SCOPES.LIBRARY_COVERS,
    "image/jpeg",
    "jpeg",
  );
  const course = await storage.upsertLibraryCourseBySlug({
    slug: COURSE_SLUG,
    title: "Antes das Cartas",
    subtitle: "Curso 00 — Fundamentos antes do estudo tecnico",
    description: "Mentalidade · Biologia do aprendizado · Metodo · Tilt · Sono · Economia",
    displayOrder: 0,
    createdBy: ADMIN_USER_ID,
    coverKey: courseCover,
    isPublished: true,
  } as any);
  console.log(`  course id=${course?.id}`);

  for (const m of MODULES) {
    const mod = await storage.upsertLibraryModuleBySlug({
      courseSlug: COURSE_SLUG,
      slug: m.slug,
      title: m.title,
      description: m.description,
      displayOrder: m.displayOrder,
    } as any);
    console.log(`  module ${m.slug} id=${mod?.id}`);
  }

  console.log("[2/3] Upsert lessons");
  let lessonsTotal = 0;
  for (const m of MODULES) {
    const blocoRoot = path.join(ROOT, m.folder);
    for (const l of m.lessons) {
      lessonsTotal++;
      console.log(`  ${l.ep}: ${l.title}`);
      const coverPath = path.join(blocoRoot, "Capas", `${l.ep}.jpeg`);
      const audioPath = path.join(blocoRoot, "Podcasts", `${l.baseFile}.m4a`);
      const htmlPath = path.join(blocoRoot, "Slides", `${l.baseFile}.html`);

      const coverKey = await uploadIfExists(ms, coverPath, STORAGE_SCOPES.LIBRARY_COVERS, "image/jpeg", "jpeg");
      const audioKey = await uploadIfExists(ms, audioPath, STORAGE_SCOPES.LIBRARY_AUDIO, "audio/mp4", "m4a");

      let articleHtml: string | undefined;
      let articleWordCount: number | undefined;
      let learningObjectives: string[] = [];
      try {
        const raw = await fs.readFile(htmlPath, "utf8");
        learningObjectives = extractLearningObjectives(raw);
        const preserved = preserveInlineHandlers(raw);
        const sanitized = sanitizeArticleHtml(preserved, "admin-trusted");
        articleHtml = sanitized.clean;
        articleWordCount = sanitized.wordCount;
      } catch (err: any) {
        if (err.code !== "ENOENT") {
          console.error(`    [err html] ${err.message}`);
        } else {
          console.log(`    [skip] missing slide html`);
        }
      }

      await storage.upsertLibraryLessonBySlug({
        courseSlug: COURSE_SLUG,
        moduleSlug: m.slug,
        slug: l.slug,
        title: l.title,
        subtitle: l.subtitle,
        categoryId: "performance_mental",
        tags: l.tags,
        coverKey,
        audioKey,
        audioMimeType: audioKey ? "audio/mp4" : undefined,
        articleHtml,
        articleWordCount,
        learningObjectives,
        displayOrder: l.displayOrder,
        isPublished: true,
      } as any);
    }
  }
  console.log(`  lessons upserted: ${lessonsTotal}`);

  console.log("[3/3] Grant access to admin user");
  const courseDetail = await storage.getLibraryCourseBySlug(COURSE_SLUG);
  const lessonIds: string[] = [];
  for (const mod of (courseDetail?.modules ?? []) as any[]) {
    for (const lesson of (mod.lessons ?? []) as any[]) lessonIds.push(lesson.id);
  }
  if (lessonIds.length > 0) {
    const result = await storage.bulkGrantLessonAccess({
      userId: ADMIN_USER_ID,
      lessonIds,
      source: "admin",
      grantedBy: ADMIN_USER_ID,
    } as any);
    console.log(`  granted=${result.granted}, alreadyHadAccess=${result.alreadyHadAccess}`);
  }

  console.log("[done] Antes das Cartas seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
