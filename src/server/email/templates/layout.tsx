import type { ReactNode } from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";

export function EmailLayout({
  preview,
  heading,
  children,
  action,
}: {
  preview: string;
  heading: string;
  children: ReactNode;
  action?: { label: string; url: string };
}) {
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
          <Heading as="h2" style={{ marginTop: 0 }}>
            {heading}
          </Heading>
          {children}
          {action ? (
            <Section style={{ margin: "24px 0" }}>
              <Button
                href={action.url}
                style={{
                  backgroundColor: "#2563eb",
                  color: "#ffffff",
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
            Radius Roadmap
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
