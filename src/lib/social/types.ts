export const DEFAULT_SOCIAL_PIPELINE_SLUG = "organic_publer_main";
export const SOCIAL_MIN_QUESTION_COUNT = 3;
export const SOCIAL_MAX_QUESTION_COUNT = 5;
export const SOCIAL_RESERVATION_TTL_MINUTES = 90;
export const SOCIAL_DEFAULT_LOW_INVENTORY_THRESHOLDS = [25, 10, 5, 0] as const;

export const SOCIAL_FRAME_VARIANTS = {
  feed: {
    width: 1080,
    height: 1350,
    label: "Instagram/Facebook Feed",
  },
  story: {
    width: 1080,
    height: 1920,
    label: "TikTok Portrait",
  },
} as const;

export type SocialPipelineAllowedGameMode = "single" | "wwtbam";
export type SocialPostStatus =
  | "reserved"
  | "preview_ready"
  | "drafted"
  | "published"
  | "failed"
  | "skipped";
export type SocialPublishMode = "draft" | "publish" | "schedule";
export type SocialFrameVariant = keyof typeof SOCIAL_FRAME_VARIANTS;
export type SocialFrameKind =
  | "single-question-reveal"
  | "single-question-unanswered"
  | "wwtbam-question-reveal"
  | "wwtbam-question-unanswered"
  | "cta";

export type SocialQuestionOptionSnapshot = {
  text: string;
  explanation: string;
};

export type SocialQuestionSnapshot = {
  id: string;
  position: number;
  questionText: string;
  options: SocialQuestionOptionSnapshot[];
  correctOptionIndex: number;
};

export type SocialQuizSnapshot = {
  quizId: string;
  title: string;
  description: string | null;
  theme: string;
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
  gameMode: "single" | "wwtbam";
  questionCount: number;
  creatorName: string | null;
  playUrl: string;
  selectedQuestionCount: number;
  questions: SocialQuestionSnapshot[];
};

export type SocialFrameSnapshot = {
  index: number;
  kind: SocialFrameKind;
  questionPosition: number | null;
};

export type SocialVariantPreview = {
  variant: SocialFrameVariant;
  width: number;
  height: number;
  frameUrls: string[];
};

export type SocialPreviewManifest = {
  frameCount: number;
  frames: SocialFrameSnapshot[];
  variants: SocialVariantPreview[];
  reviewUrl: string | null;
};

export type SocialCaptionSnapshot = {
  caption: string | null;
  firstComment: string | null;
  tiktokTitle: string | null;
};

export type SocialInventoryNudge =
  | {
    type: "low_inventory";
    threshold: number;
    remainingEligible: number;
  }
  | {
    type: "empty_pipeline";
    remainingEligible: 0;
  };

export function getFrameVariantSize(variant: SocialFrameVariant) {
  return SOCIAL_FRAME_VARIANTS[variant];
}
