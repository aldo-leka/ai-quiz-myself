import { z } from "zod";

export const hubCandidateOptionSchema = z.object({
  text: z.string().min(1),
  explanation: z.string().min(1),
});

export const hubCandidateQuestionSchema = z.object({
  position: z.number().int().positive(),
  questionText: z.string().min(1),
  options: z.array(hubCandidateOptionSchema).length(4),
  correctOptionIndex: z.number().int().min(0).max(3),
  difficulty: z.enum(["easy", "medium", "hard"]),
  subject: z.string().nullable(),
});

export const hubCandidateSnapshotSchema = z.object({
  title: z.string().min(1),
  theme: z.string().min(1),
  language: z.string().min(2),
  difficulty: z.enum(["easy", "medium", "hard", "mixed", "escalating"]),
  gameMode: z.enum(["single", "wwtbam", "couch_coop"]),
  sourceType: z.enum(["manual", "ai_generated", "pdf", "url"]),
  sourceUrl: z.string().nullable(),
  questionCount: z.number().int().positive(),
  questions: z.array(hubCandidateQuestionSchema).min(1),
});

export type HubCandidateSnapshot = z.infer<typeof hubCandidateSnapshotSchema>;
export type HubCandidateSnapshotQuestion = z.infer<typeof hubCandidateQuestionSchema>;
