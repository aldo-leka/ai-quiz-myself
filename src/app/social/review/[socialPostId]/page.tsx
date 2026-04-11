import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminSessionOrNull } from "@/lib/admin-auth";
import { getSocialPostById, getSocialPostForPreview } from "@/lib/social/service";
import { SOCIAL_FRAME_VARIANTS, type SocialFrameVariant } from "@/lib/social/types";

type ReviewPageProps = {
  params: Promise<{ socialPostId: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function SocialReviewPage({
  params,
  searchParams,
}: ReviewPageProps) {
  const { socialPostId } = await params;
  const { token } = await searchParams;

  let socialPost = token
    ? await getSocialPostForPreview({
        socialPostId,
        token,
      })
    : null;

  if (!socialPost) {
    const adminSession = await getAdminSessionOrNull();
    if (!adminSession) {
      notFound();
    }

    socialPost = await getSocialPostById(socialPostId);
  }

  if (!socialPost || !socialPost.previewManifest) {
    notFound();
  }

  const reviewToken = token ?? socialPost.previewToken;

  return (
    <main className="min-h-screen bg-[#0f1117] px-6 py-10 text-[#e4e4e9]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="rounded-3xl border border-[#252940] bg-[#1a1d2e] p-6 md:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#818cf8]">
            Social Review
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">
            {socialPost.quizSnapshot.title}
          </h1>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[#252940] bg-[#0f1117]/82 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9394a5]">
                Quiz Mode
              </p>
              <p className="mt-2 text-lg font-semibold text-[#e4e4e9]">
                {socialPost.quizSnapshot.gameMode}
              </p>
            </div>
            <div className="rounded-2xl border border-[#252940] bg-[#0f1117]/82 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9394a5]">
                Selected Questions
              </p>
              <p className="mt-2 text-lg font-semibold text-[#e4e4e9]">
                {socialPost.selectedQuestionCount}
              </p>
            </div>
            <div className="rounded-2xl border border-[#252940] bg-[#0f1117]/82 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9394a5]">
                Play URL
              </p>
              <p className="mt-2 break-all text-sm font-medium text-[#c7cada]">
                {socialPost.playUrl}
              </p>
            </div>
            <div className="rounded-2xl border border-[#252940] bg-[#0f1117]/82 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9394a5]">
                Reservation Expires
              </p>
              <p className="mt-2 text-sm font-medium text-[#c7cada]">
                {socialPost.reservationExpiresAt
                  ? socialPost.reservationExpiresAt.toISOString()
                  : "Not set"}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-[#252940] bg-[#0f1117]/82 p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9394a5]">
              Copy Snapshot
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#818cf8]">
                  Caption
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[#c7cada]">
                  {socialPost.copySnapshot.caption ?? "Not written yet"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#818cf8]">
                  First Comment
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[#c7cada]">
                  {socialPost.copySnapshot.firstComment ?? "Not written yet"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#818cf8]">
                  TikTok Title
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[#c7cada]">
                  {socialPost.copySnapshot.tiktokTitle ?? "Not written yet"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {socialPost.previewManifest.variants.map((variant) => (
          <section
            key={variant.variant}
            className="rounded-3xl border border-[#252940] bg-[#1a1d2e] p-6 md:p-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-[#e4e4e9]">
                  {SOCIAL_FRAME_VARIANTS[variant.variant as SocialFrameVariant].label}
                </h2>
                <p className="mt-1 text-sm text-[#9394a5]">
                  {variant.width} x {variant.height}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
              {variant.frameUrls.map((frameUrl, index) => (
                <article
                  key={`${variant.variant}-${index}`}
                  className="overflow-hidden rounded-3xl border border-[#252940] bg-[#0f1117]/82"
                >
                  <Image
                    src={frameUrl}
                    alt={`Frame ${index + 1}`}
                    width={variant.width}
                    height={variant.height}
                    unoptimized
                    className="block h-auto w-full"
                  />
                  <div className="border-t border-[#252940] px-4 py-3">
                    <p className="text-sm font-semibold text-[#e4e4e9]">
                      Frame {index + 1}
                    </p>
                    <p className="mt-1 break-all text-xs text-[#9394a5]">{frameUrl}</p>
                    <div className="mt-3">
                      <Link
                        href={frameUrl}
                        className="text-sm font-semibold text-[#818cf8] hover:text-[#9ea7ff]"
                      >
                        Open frame
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-3xl border border-[#252940] bg-[#1a1d2e] p-6">
          <p className="text-sm text-[#9394a5]">
            Review token:
            <span className="ml-2 font-mono text-[#e4e4e9]">{reviewToken}</span>
          </p>
        </section>
      </div>
    </main>
  );
}
