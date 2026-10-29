import { z } from "zod";

/** Accepted image types → file extension. No SVG: it can carry scripts. */
export const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export type ImageType = keyof typeof IMAGE_TYPES;

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * Card attachments (doc 21 step C): images plus PDF. No Office files: they are
 * zip containers we can't check by their first bytes. PDFs are served as
 * downloads, never inline.
 */
export const ATTACHMENT_TYPES = {
  ...IMAGE_TYPES,
  "application/pdf": "pdf",
} as const;

export type AttachmentType = keyof typeof ATTACHMENT_TYPES;

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function isImageType(type: string): type is ImageType {
  return type in IMAGE_TYPES;
}

export const uploadPurposeSchema = z.enum([
  "avatar",
  "account-logo",
  "workspace-logo",
  "card-image",
]);

export type UploadPurpose = z.infer<typeof uploadPurposeSchema>;

const imageTypeSchema = z.enum(
  Object.keys(IMAGE_TYPES) as [ImageType, ...ImageType[]],
  "Use a PNG, JPEG or WebP image.",
);

export const requestUploadSchema = z.object({
  purpose: uploadPurposeSchema,
  workspaceId: z.uuid().optional(),
  contentType: imageTypeSchema,
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_IMAGE_BYTES, "Images must be 2 MB or smaller."),
});

export type RequestUploadInput = z.infer<typeof requestUploadSchema>;

/** `key: null` removes the current image. */
export const saveUploadSchema = z.object({
  purpose: uploadPurposeSchema,
  workspaceId: z.uuid().optional(),
  key: z.string().max(300).nullable(),
});

export type SaveUploadInput = z.infer<typeof saveUploadSchema>;
