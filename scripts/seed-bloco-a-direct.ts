// Direct DB seed of Bloco A (bypass HTTP+CSRF). Reads files from
// "C:/Users/ricar/OneDrive/Desktop/A anatomia de um Spot/00 - Antes das Cartas/Bloco A - Fundamentos Mentais/"
// and calls storage upsert methods directly.

import { promises as fs } from "fs";
import path from "path";
import { storage } from "../server/storage";
import { createMediaStorage } from "../server/services/mediaStorage";
import { sanitizeArticleHtml, preserveInlineHandlers } from "../server/services/htmlSanitizer";
import { extractLearningObjectives } from "../server/services/learningObjectivesExtractor";
import { STORAGE_SCOPES } from "../shared/library-storage-scopes";

const FOLDER = "C:/Users/ricar/OneDrive/Desktop/A anatomia de um Spot/00 - Antes das Cartas/Bloco A - Fundamentos Mentais";
const ADMIN_USER_ID = "USER-0005";

interface Lesson {
  ep: string;
  htmlFile: string;
  audioFile: string;
  coverFile: string;
  slug: string;
  title: string;
  subtitle: string;
  tags: string[];
  displayOrder: number;
}

const LESSONS: Lesson[] = [
  { ep: "A1", htmlFile: "A1 - Mentalidade Fixa vs Mentalidade de Crescimento.html", audioFile: "compressed/A1 - Mentalidade Fixa vs Mentalidade de Crescimento.m4a", coverFile: "Capas/A1.jpeg", slug: "a1-mentalidade-fixa-vs-crescimento", title: "Mentalidade Fixa vs Mentalidade de Crescimento", subtitle: "A crenca invisivel sobre como habilidade funciona", tags: ["mentalidade", "neurociencia", "spot-acao", "recall"], displayOrder: 1 },
  { ep: "A2", htmlFile: "A2 - A Dicotomia do Controle.html", audioFile: "compressed/A2 - A Dicotomia do Controle.m4a", coverFile: "Capas/A2.jpeg", slug: "a2-dicotomia-do-controle", title: "A Dicotomia do Controle", subtitle: "Estoicismo aplicado ao poker", tags: ["mentalidade", "estoicismo", "fronteira", "controle"], displayOrder: 2 },
  { ep: "A3", htmlFile: "A3 - Identidade como Narrativa.html", audioFile: "compressed/A3 - Identidade como Narrativa.m4a", coverFile: "Capas/A3.jpeg", slug: "a3-identidade-como-narrativa", title: "Identidade como Narrativa", subtitle: "A historia que voce conta sobre voce mesmo", tags: ["mentalidade", "identidade", "narrativa"], displayOrder: 3 },
  { ep: "A4", htmlFile: "A4 - Responsabilidade vs Culpa.html", audioFile: "compressed/A4 - Responsabilidade vs Culpa.m4a", coverFile: "Capas/A4.jpeg", slug: "a4-responsabilidade-vs-culpa", title: "Responsabilidade vs Culpa", subtitle: "Diferenca operacional entre dois conceitos colados", tags: ["mentalidade", "responsabilidade", "culpa"], displayOrder: 4 },
  { ep: "A5", htmlFile: "A5 - O Padrao Agassi.html", audioFile: "compressed/A5 - O Padrao Agassi.m4a", coverFile: "Capas/A5.jpeg", slug: "a5-padrao-agassi", title: "O Padrao Agassi", subtitle: "Excelencia tecnica e odio do que se faz", tags: ["mentalidade", "trajetoria", "burnout"], displayOrder: 5 },
  { ep: "A6", htmlFile: "A6 - Os Seis Medos do Poker.html", audioFile: "compressed/A6 - Os Seis Medos do Poker.m4a", coverFile: "Capas/A6.jpeg", slug: "a6-seis-medos-do-poker", title: "Os Seis Medos do Poker", subtitle: "Medos invisiveis que governam decisoes", tags: ["mentalidade", "medo", "decisao"], displayOrder: 6 },
  { ep: "A7", htmlFile: "A7 - Combustivel nao Gatilho.html", audioFile: "compressed/A7 - Combustivel nao Gatilho.m4a", coverFile: "Capas/A7.jpeg", slug: "a7-combustivel-nao-gatilho", title: "Combustivel nao Gatilho", subtitle: "Tilt como sinal, nao como falha", tags: ["mentalidade", "tilt", "emocao"], displayOrder: 7 },
  { ep: "A8", htmlFile: "A8 - Entre a Trava e a Arrogancia.html", audioFile: "compressed/A8 - Entre a Trava e a Arrogancia.m4a", coverFile: "Capas/A8.jpeg", slug: "a8-trava-arrogancia", title: "Entre a Trava e a Arrogancia", subtitle: "A faixa estreita da confianca calibrada", tags: ["mentalidade", "confianca", "calibracao"], displayOrder: 8 },
  { ep: "A9", htmlFile: "A9 - Sistema acima da Forca de Vontade.html", audioFile: "compressed/A9 - Sistema acima da Forca de Vontade.m4a", coverFile: "Capas/A9.jpeg", slug: "a9-sistema-acima-forca-vontade", title: "Sistema acima da Forca de Vontade", subtitle: "Por que disciplina nao resolve", tags: ["mentalidade", "sistema", "habito"], displayOrder: 9 },
];

async function uploadIfExists(
  ms: ReturnType<typeof createMediaStorage>,
  rel: string,
  scope: string,
  mime: string,
  ext: string,
): Promise<string | undefined> {
  const abs = path.join(FOLDER, rel);
  try {
    const buffer = await fs.readFile(abs);
    const result = await ms.put({ scope, ext, buffer, mime });
    return result.key;
  } catch (err: any) {
    console.error(`  [skip] ${rel}: ${err.message}`);
    return undefined;
  }
}

async function main() {
  const ms = createMediaStorage();

  console.log("[1/3] Upsert course + module");
  const courseCoverKey = await uploadIfExists(
    ms,
    "Capas/A1.jpeg",
    STORAGE_SCOPES.LIBRARY_COVERS,
    "image/jpeg",
    "jpeg",
  );
  const course = await storage.upsertLibraryCourseBySlug({
    slug: "antes-das-cartas",
    title: "Antes das Cartas",
    subtitle: "Curso 00 — Fundamentos antes do estudo tecnico",
    description: "Mentalidade · Bankroll · Rotina · Recuperacao",
    displayOrder: 0,
    createdBy: ADMIN_USER_ID,
    coverKey: courseCoverKey,
    isPublished: true,
  } as any);
  console.log(`  course id=${course?.id}`);

  const module = await storage.upsertLibraryModuleBySlug({
    courseSlug: "antes-das-cartas",
    slug: "bloco-a-fundamentos-mentais",
    title: "Bloco A — Fundamentos Mentais",
    description: "A crenca invisivel que decide trajetorias",
    displayOrder: 0,
  } as any);
  console.log(`  module id=${module?.id}`);

  console.log("[2/3] Upsert 9 lessons");
  for (const l of LESSONS) {
    console.log(`  ${l.ep}: ${l.title}`);
    const coverKey = await uploadIfExists(ms, l.coverFile, STORAGE_SCOPES.LIBRARY_COVERS, "image/jpeg", "jpeg");
    const audioKey = await uploadIfExists(ms, l.audioFile, STORAGE_SCOPES.LIBRARY_AUDIO, "audio/mp4", "m4a");

    let articleHtml: string | undefined;
    let articleWordCount: number | undefined;
    let learningObjectives: string[] = [];
    try {
      const raw = await fs.readFile(path.join(FOLDER, l.htmlFile), "utf8");
      learningObjectives = extractLearningObjectives(raw);
      const preserved = preserveInlineHandlers(raw);
      const sanitized = sanitizeArticleHtml(preserved, "admin-trusted");
      articleHtml = sanitized.clean;
      articleWordCount = sanitized.wordCount;
    } catch (err: any) {
      console.error(`    [skip html] ${err.message}`);
    }

    await storage.upsertLibraryLessonBySlug({
      courseSlug: "antes-das-cartas",
      moduleSlug: "bloco-a-fundamentos-mentais",
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

  console.log("[3/3] Grant access to admin user");
  const userId = ADMIN_USER_ID;
  const courseDetail = await storage.getLibraryCourseBySlug("antes-das-cartas");
  const lessonIds: string[] = [];
  for (const m of (courseDetail?.modules ?? []) as any[]) {
    for (const lesson of (m.lessons ?? []) as any[]) lessonIds.push(lesson.id);
  }
  if (lessonIds.length > 0) {
    const result = await storage.bulkGrantLessonAccess({
      userId,
      lessonIds,
      source: "admin",
      grantedBy: userId,
    } as any);
    console.log(`  granted=${result.granted}, alreadyHadAccess=${result.alreadyHadAccess}`);
  }

  console.log("[done] Bloco A seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
