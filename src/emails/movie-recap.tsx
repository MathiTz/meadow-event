import { Heading, Text } from "@react-email/components";
import type { Movie } from "@/lib/omdb";
import { EmailLayout, styles } from "./layout";

export function movieHeading(movie: Pick<Movie, "title" | "year">) {
  return movie.year ? `${movie.title} (${movie.year})` : movie.title;
}

export function movieMeta(movie: Pick<Movie, "director" | "rating">) {
  return [movie.director && `Directed by ${movie.director}`, movie.rating && `IMDb ${movie.rating}/10`].filter(Boolean) as string[];
}

/** React escapes every interpolated value, so OMDb content cannot inject markup. */
export function MovieRecapEmail({ movie }: { movie: Movie }) {
  const meta = movieMeta(movie);
  return (
    <EmailLayout preview={movie.plot.slice(0, 90)}>
      <Heading as="h1" style={styles.h1}>
        {movieHeading(movie)}
      </Heading>
      {meta.length > 0 && <Text style={styles.meta}>{meta.join(" · ")}</Text>}
      <Text>{movie.plot}</Text>
      <Text style={styles.footer}>You received this because you watched {movie.title}.</Text>
    </EmailLayout>
  );
}

MovieRecapEmail.PreviewProps = {
  movie: {
    title: "The Matrix",
    year: "1999",
    director: "Lana Wachowski, Lilly Wachowski",
    rating: "8.7",
    plot: "A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.",
  },
};

export default MovieRecapEmail;
