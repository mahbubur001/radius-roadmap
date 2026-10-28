import type { Metadata } from "next";
import { FeedbackScreen } from "./feedback-screen";

export const metadata: Metadata = { title: "Feedback" };

export default function FeedbackPage({
  params,
  searchParams,
}: PageProps<"/dashboard/[workspace]/feedback">) {
  return (
    <FeedbackScreen
      slug={params.then((p) => p.workspace)}
      query={searchParams}
      mode="list"
    />
  );
}
