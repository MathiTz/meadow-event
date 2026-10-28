import { Body, Container, Head, Html, Preview } from "@react-email/components";
import type { ReactNode } from "react";

export const styles = {
  h1: { fontSize: "22px", margin: "0 0 4px" },
  meta: { margin: "0 0 16px", color: "#6b7280" },
  footer: { color: "#9ca3af", fontSize: "12px", marginTop: "24px" },
};

export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", lineHeight: 1.6, color: "#1f2937" }}>
        <Container style={{ maxWidth: "560px", margin: "0 auto" }}>{children}</Container>
      </Body>
    </Html>
  );
}
