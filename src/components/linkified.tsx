import { Fragment } from "react";

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

/** Plain text with http(s) URLs as links. React escapes everything else. */
export function Linkified({ text }: { text: string }) {
  return text.split(URL_PATTERN).map((part, i) =>
    i % 2 ? (
      <a
        // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer nofollow ugc"
        className="text-primary underline"
      >
        {part}
      </a>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
