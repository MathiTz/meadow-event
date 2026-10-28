import { Heading, Text } from "@react-email/components";
import { EmailLayout, styles } from "./layout";

export const notFoundMessage = (title: string) =>
  `We couldn't find a movie called "${title}" in our database. Check the spelling, or try the original title (e.g. "Amélie" instead of its translation).`;

export function MovieNotFoundEmail({ title }: { title: string }) {
  return (
    <EmailLayout preview={`We couldn't find "${title}"`}>
      <Heading as="h1" style={{ ...styles.h1, marginBottom: "12px" }}>
        Movie not found
      </Heading>
      <Text>{notFoundMessage(title)}</Text>
    </EmailLayout>
  );
}

MovieNotFoundEmail.PreviewProps = { title: "Teh Matrxi" };

export default MovieNotFoundEmail;
