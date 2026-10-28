import type { Metadata } from "next";
import { FeedbackScreen } from "../feedback-screen";

export const metadata: Metadata = { title: "Feedback inbox" };

/** New submissions waiting for review (doc 20 D2). */
export default function FeedbackInboxPage({
  params,
  searchParams,
}: PageProps<"/dashboard/[workspace]/feedback/inbox">) {
  return (
    <FeedbackScreen
      slug={params.then((p) => p.workspace)}
      query={searchParams}
      mode="inbox"
    />
  );
}
