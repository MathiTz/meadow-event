import { EventSchemas, Inngest } from "inngest";
import { MOVIE_EMAIL_FAILED, MOVIE_WATCHED, type MovieWatchedData } from "./schemas";

type Events = {
  [MOVIE_WATCHED]: { data: MovieWatchedData };
  [MOVIE_EMAIL_FAILED]: { data: { movie_title: string; recipient_email: string; reason: string } };
};

export const inngest = new Inngest({ id: "meadow-event", schemas: new EventSchemas().fromRecord<Events>() });
