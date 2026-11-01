import type { ReactNode } from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "react-email";
import { foregroundFor } from "@/lib/color";
import type { EmailBrand } from "../types";

const DEFAULT_BUTTON = "#2563eb";

export function EmailLayout({
  preview,
  heading,
  children,
  action,
  brand,
}: {
  preview: string;
  heading: string;
  children: ReactNode;
  action?: { label: string; url: string };
  /** Emails a tenant's end users get (doc 26 B4); team emails pass none. */
  brand?: EmailBrand;
}) {
  const button = brand?.color ?? DEFAULT_BUTTON;
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f4f4f5", fontFamily: "sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            margin: "40px auto",
            padding: "32px",
            borderRadius: "8px",
            maxWidth: "480px",
          }}
        >
          {brand?.logoUrl ? (
            <Img
              src={brand.logoUrl}
              alt={brand.name}
              height="40"
              style={{ height: 40, width: "auto", marginBottom: 24 }}
            />
          ) : null}
          <Heading as="h2" style={{ marginTop: 0 }}>
            {heading}
          </Heading>
          {children}
          {action ? (
            <Section style={{ margin: "24px 0" }}>
              <Button
                href={action.url}
                style={{
                  backgroundColor: button,
                  color: foregroundFor(button),
                  padding: "12px 20px",
                  borderRadius: "6px",
                }}
              >
                {action.label}
              </Button>
            </Section>
          ) : null}
          <Hr />
          <Text style={{ color: "#71717a", fontSize: "12px" }}>
            {!brand
              ? "Radius Roadmap"
              : brand.poweredBy
                ? `${brand.name} · Powered by Radius Roadmap`
                : brand.name}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
